import { ApplicationCommandData, ApplicationCommandType, PermissionResolvable, Snowflake } from 'discord.js';

import { CommandPermissionOptions } from './permission';

export interface BaseCommand {
    /**
     * Specifies the level of permission needed to run the command.
     */
    readonly permission?: CommandPermissionOptions;

    /**
     * Enables this command in direct messages.
     *
     * Default is false.
     */
    readonly enableInDM?: boolean;

    /**
     * Override for which member permissions are required to execute the command.
     *
     * By default, the member permissions on the command permission are used.
     */
    readonly memberPermissions?: PermissionResolvable;

    /**
     * The guild this command should be added to as an application command.
     *
     * If left blank, it is added as a global application command.
     */
    readonly guildId?: Snowflake;
}

/**
 * Interface for all commands that can be run through a Discord bot.
 */
export abstract class BaseCommand {
    /**
     * Name of the command.
     */
    public abstract readonly name: string;

    /**
     * Application command type.
     */
    public abstract readonly type: ApplicationCommandType;

    /**
     * Generates data to be used for context menu command configuration.
     */
    public abstract commandData(): ApplicationCommandData;
}
