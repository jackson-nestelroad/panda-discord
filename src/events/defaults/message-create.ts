import { Message, Snowflake } from 'discord.js';

import { EnabledCommandType, PandaDiscordBot } from '../../bot';
import { CommandSource } from '../../commands/command-source';
import { ChatCommandParameters } from '../../commands/params';
import { SplitArgumentArray } from '../../util/argument-splitter';
import { BaseEvent } from '../base';

/**
 * Default event handler for messages.
 */
export class DefaultMessageCreateEvent extends BaseEvent<'messageCreate'> {
    private forbiddenMentionRegex = /@(everyone|here)/g;

    constructor(bot: PandaDiscordBot) {
        super(bot, 'messageCreate');
    }

    private async runCommand(content: string, msg: Message, guildId: Snowflake) {
        content = content.replace(this.forbiddenMentionRegex, '@\u{200b}$1');

        const src = new CommandSource(msg);
        let args: SplitArgumentArray;
        try {
            args = this.bot.splitIntoArgs(content);
        } catch (error) {
            await this.bot.sendError(src, error);
            return;
        }

        // No arguments, which really means no command.
        if (args.length === 0) {
            return;
        }

        const cmd = args.shift();
        content = content.substring(cmd.length).trim();

        const params: ChatCommandParameters = {
            bot: this.bot,
            src,
            args,
            content,
            guildId,
            extraArgs: {},
        };

        // Global command.
        if (this.bot.commands.has(cmd)) {
            try {
                const command = this.bot.commands.get(cmd);
                if (command.disableChat) {
                    return;
                }
                if (this.bot.validate(params, command)) {
                    await command.executeChat(params);
                }
            } catch (error) {
                await this.bot.sendError(params.src, error);
            }
        }
    }

    public async run(msg: Message) {
        // Bot ignores chat commands.
        if ((this.bot.options.commandType & EnabledCommandType.Chat) === 0) {
            return;
        }

        // User is a bot.
        if (msg.author.bot) {
            return;
        }

        // User is on timeout.
        if (this.bot.timeoutService?.onTimeout(msg.author)) {
            return;
        }

        const prefix = await this.bot.getPrefix(msg.guild.id);

        if (!msg.content.startsWith(prefix)) {
            // Bot is mentioned.
            if (msg.mentions.users.has(this.bot.client.user.id)) {
                // Bot mention is the message's prefix.
                const mentionIndex = msg.content.indexOf(this.bot.client.user.id);
                const endOfMentionString = mentionIndex + this.bot.client.user.id.length;
                if (
                    (mentionIndex === 2 || (mentionIndex === 3 && msg.content[2] === '!')) &&
                    msg.content[0] === '<' &&
                    msg.content[1] === '@' &&
                    msg.content[endOfMentionString] === '>'
                ) {
                    const content = msg.content.substring(endOfMentionString + 1).trim();
                    await this.runCommand(content, msg, msg.guild.id);
                }
            }
        } else {
            const content = msg.content.substring(prefix.length);
            await this.runCommand(content, msg, msg.guild.id);
        }
    }
}
