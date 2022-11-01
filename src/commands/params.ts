import { ChatInputCommandInteraction } from 'discord.js';
import { Snowflake } from 'discord.js';

import { PandaDiscordBot } from '../bot';
import { SplitArgumentArray } from '../util/argument-splitter';
import {
    CommandInteractionCommandSource,
    CommandSource,
    InteractionCommandSource,
    MessageCommandSource,
} from './command-source';

/**
 * Parameters given to all commands, whether running as a chat command or slash command.
 */
export interface CommandParameters<Bot extends PandaDiscordBot = PandaDiscordBot> {
    /**
     * The bot the command was issued to.
     */
    bot: Bot;
    /**
     * The guild the command was issued in.
     */
    guildId: Snowflake;
    /**
     * The source of the command.
     */
    src: CommandSource;
    /**
     * Any extra arguments supplied in the command that could not be parsed out.
     */
    extraArgs: Record<string, string>;
}

/**
 * Parameters exclusive to chat commands.
 */
export interface ChatCommandParameters<Bot extends PandaDiscordBot = PandaDiscordBot> extends CommandParameters<Bot> {
    src: MessageCommandSource;

    /**
     * The split arguments of the chat command.
     *
     * This is parsed into a preset format depending on the command.
     */
    args: SplitArgumentArray;

    /**
     * The content of the chat message.
     */
    content: string;
}

export interface InteractionCommandParameters<Bot extends PandaDiscordBot = PandaDiscordBot>
    extends CommandParameters<Bot> {
    src: CommandInteractionCommandSource;
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
export interface SlashCommandParameters<Bot extends PandaDiscordBot = PandaDiscordBot>
    extends InteractionCommandParameters<Bot> {
    /**
     * The options sent with the slash command.
     *
     * This is parsed into a preset format depending on the command.
     */
    options: ChatInputCommandInteraction['options'];

    /**
     * The current level the slash command is executing in.
     */
    level?: SlashCommandArgumentLevel;
}
