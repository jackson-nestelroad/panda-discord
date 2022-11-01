import { PermissionFlagsBits, Snowflake } from 'discord.js';

import {
    BaseHelpServiceInternal,
    CommandPermissionOptions,
    DefaultCommandCategory,
    DefaultCommandPermission,
    MemberListService,
    PandaDiscordBot,
    TimeoutService,
} from '../src/index';
import { HelpService } from './services/help';

export const CommandPermission = {
    ...DefaultCommandPermission,
    Mod: {
        name: 'Moderator',
        memberPermissions:
            PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers | PermissionFlagsBits.ManageMessages,
    } as CommandPermissionOptions,
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
    public commandPermissions = Object.values(CommandPermission);

    public helpService: HelpService = new HelpService(this, new BaseHelpServiceInternal(this));
    public memberListService: MemberListService = new MemberListService(this);
    public timeoutService: TimeoutService = new TimeoutService(this);

    public getPrefix(guildId: Snowflake): string {
        // Can wire up a database here if desired to store a different prefix
        // for each guild.
        return '!';
    }
}
