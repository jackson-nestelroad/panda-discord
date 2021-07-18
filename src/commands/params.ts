import { Snowflake } from 'discord-api-types';
import { Collection, CommandInteractionOption } from 'discord.js';
import { PandaDiscordBot } from '../bot';
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
    args: string[];
    content: string;
}

/**
 * Parameters exclusive to slash commands.
 */
export interface SlashCommandParameters<Bot extends PandaDiscordBot = PandaDiscordBot> extends CommandParameters<Bot> {
    options: Collection<string, CommandInteractionOption>;
}
