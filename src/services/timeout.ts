import { VariableTimedCacheSet } from '../util/timed-cache';
import { Snowflake, User } from 'discord.js';
import { BaseService } from './base';

/**
 * Service for handling user timeouts.
 * When a user is on timeout, the bot ignores all commands interactions from them.
 */
export class TimeoutService extends BaseService {
    /**
     * Maps a user ID to the number of times they have been on timeout.
     */
    public readonly timeoutCount: Map<Snowflake, number> = new Map();
    /**
     * Stores each user for the duration of their timeout.
     */
    public readonly timeoutUsers: VariableTimedCacheSet<Snowflake> = new VariableTimedCacheSet();

    /**
     * Convert the number of offenses to the corresponding timeout duration.
     * @param offenses Number of offenses
     * @returns Timeout duration in minutes.
     */
    protected getTimeoutDuration(offenses: number): number {
        return 2 * offenses - 1;
    }

    /**
     * Puts a user on timeout.
     * @param user User to timeout.
     */
    public async timeout(user: User) {
        let offenses = this.timeoutCount.get(user.id) ?? 0;
        this.timeoutCount.set(user.id, ++offenses);
        const minutes = this.getTimeoutDuration(offenses);
        this.timeoutUsers.set(user.id, { minutes });
        await user.send(
            `You are being timed out for command spam. Your messages will be ignored for ${minutes} minute${
                minutes === 1 ? '' : 's'
            }.`,
        );
    }

    /**
     * Checks if a user is on timeout.
     * @param user User to check.
     * @returns Is user on timeout?
     */
    public onTimeout(user: User): boolean {
        return this.timeoutUsers.has(user.id);
    }
}
