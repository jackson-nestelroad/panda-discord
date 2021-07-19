import { PandaDiscordBot } from '../bot';
import { CommandParameters } from './params';

/**
 * Default command permissions supported by the bot framework.
 *
 * You should use your own enum or set of strings for new
 * permission schemes, but still use these values if using
 * default commands.
 */
export enum DefaultCommandPermission {
    Everyone = 'Everyone',
    Owner = 'Owner',
    Inherit = '_Inherit',
}

/**
 * Validates if a command should be run or not.
 * Return true to run, return false to ignore.
 */
export type CommandPermissionValidator<Bot extends PandaDiscordBot = PandaDiscordBot> = (
    params: CommandParameters<Bot>,
) => boolean;

/**
 * Config type for command permission validators. Maps a command permission
 * string to its validation config.
 */
export type CommandPermissionValidatorConfig<Bot extends PandaDiscordBot> = Record<
    string,
    CommandPermissionValidator<Bot>
>;
