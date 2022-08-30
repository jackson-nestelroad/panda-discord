import { PermissionFlagsBits, PermissionResolvable } from 'discord.js';

import { CommandParameters } from './params';
import { PandaDiscordBot } from '../bot';

/**
 * Validates if a command should be run or not.
 * Return true to run, return false to ignore.
 */
export type CommandPermissionValidator<Bot extends PandaDiscordBot = PandaDiscordBot> = (
    params: CommandParameters<Bot>,
) => boolean;

export interface CommandPermissionOptions<Bot extends PandaDiscordBot = PandaDiscordBot> {
    name: string;
    hidden?: boolean;
    inherit?: boolean;

    /**
     * Member permissions required to execute the command.
     *
     * Use `0n` for no one. Use `null` for everyone.
     * Otherwise, use a bit string constructed from `PermissionFlagsBits`.
     */
    memberPermissions?: PermissionResolvable;

    /**
     * Custom validation function that takes precedence over member permissions.
     */
    validate?: CommandPermissionValidator<Bot>;
}

/**
 * Default command permissions supported by the bot framework.
 */
export const DefaultCommandPermission = {
    Everyone: {
        name: 'Everyone',
        memberPermissions: null,
    } as CommandPermissionOptions,
    Owner: {
        name: 'Bot Owner',
        memberPermissions: BigInt(0),
        validate: params => {
            return params.src.author.id == params.bot.options.owner;
        },
    } as CommandPermissionOptions,
    Inherit: {
        name: 'Inherit',
        hidden: true,
        inherit: true,
    } as CommandPermissionOptions,
} as const;
