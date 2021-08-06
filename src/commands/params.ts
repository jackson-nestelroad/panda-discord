import { Snowflake } from 'discord-api-types';
import { CommandInteractionOptionResolver } from 'discord.js';
import { PandaDiscordBot } from '../bot';
import { SplitArgumentArray } from '../util/argument-splitter';
import { CommandSource } from './command-source';

/**
 * Parameters given to all commands, whether running as a chat command or slash command.
 */
export interface CommandParameters<Bot extends PandaDiscordBot = PandaDiscordBot> {
    bot: Bot;
    guildId: Snowflake;
    src: CommandSource;
}

/**
 * Parameters exclusive to chat commands.
 */
export interface ChatCommandParameters<Bot extends PandaDiscordBot = PandaDiscordBot> extends CommandParameters<Bot> {
    args: SplitArgumentArray;
    content: string;
}

/**
 * The current level the slash command is executing in.
 *
 * Used for finding the next subcommand, if appplicable, to delegate down to.
 */
export enum SlashCommandArgumentLevel {
    SubcommandGroup,
    Subcommand,
}

/**
 * Parameters exclusive to slash commands.
 */
export interface SlashCommandParameters<Bot extends PandaDiscordBot = PandaDiscordBot> extends CommandParameters<Bot> {
    options: CommandInteractionOptionResolver;
    level?: SlashCommandArgumentLevel;
}
