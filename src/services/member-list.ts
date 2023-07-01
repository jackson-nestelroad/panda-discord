import { Collection, GuildMember, Snowflake } from 'discord.js';

import { PandaDiscordBot } from '../bot';
import { ExpireAge, TimedCache } from '../util/timed-cache';
import { BaseService } from './base';

/**
 * Service for fetching and caching the entire member list of a guild.
 */
export class MemberListService extends BaseService {
    private readonly cache: TimedCache<Snowflake, Collection<Snowflake, GuildMember>>;

    public constructor(bot: PandaDiscordBot, expireAge: ExpireAge = { minutes: 30 }) {
        super(bot);
        this.cache = new TimedCache(expireAge);
    }

    /**
     * Fetch and cache the entire member list for a guild.
     * @param id Guild ID.
     * @returns Promise for the guild's member list.
     */
    private async fetchMemberListForGuild(id: Snowflake): Promise<Collection<Snowflake, GuildMember>> {
        const guild = this.bot.client.guilds.cache.get(id);
        if (!guild) {
            throw new Error(`Guild ${id} could not be found.`);
        }
        const members = await guild.members.fetch();
        this.cache.set(id, members);
        return members;
    }

    /**
     * Returns the entire member list for a single guild.
     * Fetches the member list if it is not currently cached.
     * @param id Guild ID.
     * @returns Promise for the guild's member list.
     */
    public async getMemberListForGuild(id: Snowflake): Promise<Collection<Snowflake, GuildMember>> {
        return this.cache.get(id) ?? (await this.fetchMemberListForGuild(id));
    }
}
