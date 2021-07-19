import { Snowflake } from 'discord-api-types';
import {
    CommandPermissionValidatorConfig,
    DefaultCommandCategory,
    DefaultCommandPermission,
    MemberListService,
    PandaDiscordBot,
    TimeoutService,
} from '../src/index';

export const CommandPermission = {
    ...DefaultCommandPermission,
    Mod: 'Moderator',
};

export const CommandCategory = {
    ...DefaultCommandCategory,
    Fun: 'Fun!',
    Staff: 'Staff',
};

/**
 * Example bot for the Panda command framework.
 */
export class ExampleBot extends PandaDiscordBot {
    public color = '#CE8AE2' as `#${string}`;
    public commandCategories = Object.values(CommandCategory);
    public permissionValidators: CommandPermissionValidatorConfig<this> = {
        [CommandPermission.Mod]: params => {
            const member = params.src.member;
            if (!member) {
                return false;
            }
            return member.roles.cache.find(role => role.name === 'Moderator') !== undefined;
        },
    };

    public memberListService: MemberListService = new MemberListService(this);
    public timeoutService: TimeoutService = new TimeoutService(this);

    public async getPrefix(guildId: Snowflake): Promise<string> {
        // Can wire up a database here if desired to store a different prefix
        // for each guild.
        return '!';
    }
}
