import { Snowflake } from 'discord-api-types';
import {
    BaseCommand,
    CommandParameters,
    DefaultCommandPermission,
    MemberListService,
    PandaDiscordBot,
    TimeoutService,
} from '../src/index';

export const CommandPermission = {
    ...DefaultCommandPermission,
    Mod: 'Moderator',
};

export enum CommandCategory {
    Utility = 'Utility',
    Fun = 'Fun!',
    Staff = 'Staff',
}

/**
 * Example bot for the Panda command framework.
 */
export class ExampleBot extends PandaDiscordBot {
    public color = '#CE8AE2' as `#${string}`;
    public commandCategories = Object.values(CommandCategory);

    public memberListService: MemberListService = new MemberListService(this);
    public timeoutService: TimeoutService = new TimeoutService(this);

    public async getPrefix(guildId: Snowflake): Promise<string> {
        return '!';
    }

    public async validate(params: CommandParameters, command: BaseCommand): Promise<boolean> {
        switch (command.permission) {
            case DefaultCommandPermission.Everyone:
                return true;
            case DefaultCommandPermission.Owner:
                return params.src.author.id === this.options.owner;
            case CommandPermission.Mod: {
                const member = params.src.member;
                if (!member) {
                    return false;
                }
                return member.roles.cache.find(role => role.name === 'Moderator') !== undefined;
            }
            default:
                throw new Error(`No validation found for command permission: ${command.permission}.`);
        }
    }
}
