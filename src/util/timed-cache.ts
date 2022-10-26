/**
 * Single entry for a timed cache.
 */
export interface TimedCacheEntry<T> {
    expireAt: number;
    data: T;
}

/**
 * Format for specifying the expire age of a timed cache.
 */
export interface ExpireAgeFormat {
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
}

/**
 * The actual expire age of a timed cache.
 * A number indicates an expire age in milliseconds.
 * An object specifies a more human-readable format for larger times.
 */
export type ExpireAge = number | ExpireAgeFormat;

/**
 * Common conversion functions for an ExpireAge.
 */
export namespace ExpireAgeConversion {
    /**
     * Converts an ExpireAge to the corresponding amount of milliseconds.
     * @param time Expire age.
     * @returns Number in milliseconds.
     */
    export function toMilliseconds(time: ExpireAge): number {
        if (typeof time === 'number') {
            return time;
        } else {
            let value = 0;
            if (time.hours) {
                value += time.hours * 60 * 60 * 1000;
            }
            if (time.minutes) {
                value += time.minutes * 60 * 1000;
            }
            if (time.seconds) {
                value += time.seconds * 1000;
            }
            if (time.milliseconds) {
                value += time.milliseconds;
            }
            return value;
        }
    }

    /**
     * Converts a time given in milliseconds to an ExpireAgeFormat object.
     * @param time Number in milliseconds.
     * @returns Expire age format.
     */
    export function toExpireAgeFormat(time: number): ExpireAgeFormat {
        const format: ExpireAgeFormat = {};
        if (time >= 3600000) {
            format.hours = Math.floor(time / 3600000);
            time %= 3600000;
        }
        if (time >= 60000) {
            format.minutes = Math.floor(time / 60000);
            time %= 60000;
        }
        if (time >= 1000) {
            format.seconds = Math.floor(time / 1000);
            time %= 1000;
        }
        if (time !== 0) {
            format.milliseconds = time;
        }
        return format;
    }

    /**
     * Converts an ExpireAge to string.
     * @param time Expire age.
     * @param includeMs Include milliseconds?
     * @returns Time string (x hours, y minutes, z seconds, w milliseconds).
     */
    export function toString(time: ExpireAge, includeMs: boolean = true): string {
        if (typeof time === 'number') {
            return toString(toExpireAgeFormat(time), includeMs);
        } else {
            const values: string[] = [];
            if (time.hours) {
                values.push(`${time.hours} hour${time.hours !== 1 ? 's' : ''}`);
            }
            if (time.minutes) {
                values.push(`${time.minutes} minute${time.minutes !== 1 ? 's' : ''}`);
            }
            if (time.seconds) {
                values.push(`${time.seconds} second${time.seconds !== 1 ? 's' : ''}`);
            }
            if (includeMs && time.milliseconds) {
                values.push(`${time.milliseconds} millisecond${time.milliseconds !== 1 ? 's' : ''}`);
            }
            return values.join(', ');
        }
    }
}

/**
 * A timed cache holds objects associatively by key for only a certain amount of time.
 *
 * Every stored entry holds a corresponding "expireAt" property that indicates when the entry is no longer valid.
 * Expired entries appear to not exist in the cache, but they really still exist in the cache.
 */
class BaseTimedCache<K, T> {
    protected readonly cache: Map<K, TimedCacheEntry<T>> = new Map();

    /**
     * Check if a key exists in the cache and has not expired.
     * @param key Key to check.
     * @returns Key exists and is not expired?
     */
    public has(key: K): boolean {
        if (this.cache.has(key)) {
            const entry = this.cache.get(key);
            if (new Date().valueOf() >= entry.expireAt) {
                return false;
            }
            return true;
        }
        return false;
    }

    /**
     * Get the object stored for the given key if it is not expired.
     * @param key Key to check.
     * @returns Value stored at key, undefined if it does not exist or expired.
     */
    public get(key: K): T | undefined {
        if (this.cache.has(key)) {
            const entry = this.cache.get(key);
            if (new Date().valueOf() >= entry.expireAt) {
                return undefined;
            }
            return entry.data;
        }
        return undefined;
    }

    /**
     * Get the cache entry stored for the given key if it is not expired.
     * @param key Key to check.
     * @returns Entry stored at key, undefined if it does not exist or expired.
     */
    public getEntry(key: K): TimedCacheEntry<T> | undefined {
        if (this.cache.has(key)) {
            const entry = this.cache.get(key);
            if (new Date().valueOf() >= entry.expireAt) {
                return undefined;
            }
            return entry;
        }
        return undefined;
    }

    /**
     * Clear all entries from the cache.
     */
    public clear(): void {
        this.cache.clear();
    }
}

/**
 * A timed cache that has a static expire age, which means every object expires after the same amount of time.
 */
export class TimedCache<K, T> extends BaseTimedCache<K, T> {
    // Expire age of an entry in the cache in milliseconds.
    public readonly expireAge: number;

    constructor(expireAge: number | ExpireAgeFormat) {
        super();
        this.expireAge = ExpireAgeConversion.toMilliseconds(expireAge);

        if (this.expireAge < 0) {
            this.expireAge = Infinity;
        }
    }

    /**
     * Set a new value in the timed cache.
     * Expire time is refreshed.
     * @param key Key value to access the entry under.
     * @param value Value to access by key.
     */
    public set(key: K, value: T): void {
        this.cache.set(key, { expireAt: new Date().valueOf() + this.expireAge, data: value });
    }

    /**
     * Update an existing entry with a new value.
     * Expire time is not refreshed.
     * @param key Key value to update.
     * @param value New value for key.
     */
    public update(key: K, value: T): void {
        if (this.cache.has(key)) {
            const entry = this.cache.get(key);
            entry.data = value;
        }
    }
}

/**
 * A timed cache that does not store an associative value for each key.
 */
export class TimedCacheSet<T> extends BaseTimedCache<T, T> {
    // Expire age of an entry in the cache in milliseconds.
    public readonly expireAge: number;

    constructor(expireAge: number | ExpireAgeFormat) {
        super();
        this.expireAge = ExpireAgeConversion.toMilliseconds(expireAge);

        if (this.expireAge < 0) {
            this.expireAge = Infinity;
        }
    }

    /**
     * Add a new value to the cache.
     * Expire time is refreshed.
     * @param value New value to add or refresh.
     */
    public add(value: T): void {
        this.cache.set(value, { expireAt: new Date().valueOf() + this.expireAge, data: value });
    }
}

/**
 * A timed cache that has a variable expire age, which means every object is inserted with its expire age to indicate
 * how long the entry should exist in the cache.
 */
export class VariableTimedCache<K, T> extends BaseTimedCache<K, T> {
    /**
     * Set a new value in the timed cache.
     * Overwrites any existing expire time.
     * @param key Key value to access the entry under.
     * @param value Value to access by key.
     * @param expireAge Time it takes for the entry to expire.
     */
    public set(key: K, value: T, expireAge: ExpireAge): void {
        this.cache.set(key, {
            expireAt: new Date().valueOf() + ExpireAgeConversion.toMilliseconds(expireAge),
            data: value,
        });
    }

    /**
     * Update a new value in the timed cache.
     * Expire time is not refreshed.
     * @param key Key value to update.
     * @param value New value for key.
     */
    public update(key: K, value: T): void {
        if (this.cache.has(key)) {
            const entry = this.cache.get(key);
            entry.data = value;
        }
    }
}

/**
 * A timed cache with a variable expire age that does not store an associative value for each key.
 */
export class VariableTimedCacheSet<T> extends BaseTimedCache<T, T> {
    /**
     * Set a new value in the timed cache.
     * Overwrites any existing expire time.
     * @param value New value to add or refresh.
     * @param expireAge Time it takes for the entry to expire.
     */
    public set(value: T, expireAge: ExpireAge): void {
        this.cache.set(value, {
            expireAt: new Date().valueOf() + ExpireAgeConversion.toMilliseconds(expireAge),
            data: value,
        });
    }
}
