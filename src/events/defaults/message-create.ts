import { Message, Snowflake } from 'discord.js';
import { PandaDiscordBot } from '../../bot';
import { CommandSource } from '../../commands/command-source';
import { ChatCommandParameters } from '../../commands/params';
import { SplitArgumentArray } from '../../util/argument-splitter';
import { BaseEvent } from '../base';

/**
 * Default event handler for messages.
 */
export class DefaultMessageCreateEvent extends BaseEvent<'messageCreate', PandaDiscordBot> {
    private forbiddenMentionRegex = /@(everyone|here)/g;

    constructor(bot: PandaDiscordBot) {
        super(bot, 'messageCreate');
    }

    private async runCommand(content: string, msg: Message, guildId: Snowflake) {
        const src = new CommandSource(msg);
        let args: SplitArgumentArray;
        try {
            args = this.bot.splitIntoArgs(content);
        } catch (error) {
            await this.bot.sendError(src, error);
            return;
        }

        const cmd = args.shift();
        content = content.substr(cmd.length).trim();
        content = content.replace(this.forbiddenMentionRegex, '@\u{200b}$1');

        const params: ChatCommandParameters = {
            bot: this.bot,
            src,
            args,
            content,
            guildId,
        };

        // Global command.
        if (this.bot.commands.has(cmd)) {
            try {
                const command = this.bot.commands.get(cmd);
                if (this.bot.validate(params, command)) {
                    await command.executeChat(params);
                }
            } catch (error) {
                await this.bot.sendError(params.src, error);
            }
        }
    }

    public async run(msg: Message) {
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
                    const content = msg.content.substr(endOfMentionString + 1).trim();
                    await this.runCommand(content, msg, msg.guild.id);
                }
            }
        } else {
            const content = msg.content.substr(prefix.length);
            await this.runCommand(content, msg, msg.guild.id);
        }
    }
}
