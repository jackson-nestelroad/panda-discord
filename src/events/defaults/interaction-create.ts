import { Interaction } from 'discord.js';

import { EnabledCommandType, PandaDiscordBot } from '../../bot';
import { CommandInteractionCommandSource, CommandSource } from '../../commands/command-source';
import { InteractionCommandParameters, SlashCommandParameters } from '../../commands/params';
import { BaseEvent } from '../base';

/**
 * Default event handler for interactions.
 */
export class DefaultInteractionCreateEvent extends BaseEvent<'interactionCreate'> {
    constructor(bot: PandaDiscordBot) {
        super(bot, 'interactionCreate');
    }

    public async run(interaction: Interaction) {
        // Bot ignores slash commands.
        if ((this.bot.options.commandType & EnabledCommandType.Slash) === 0) {
            return;
        }

        // Only serve commands in this handler.
        if (!interaction.isCommand()) {
            return;
        }

        // User is a bot.
        if (interaction.user.bot) {
            return;
        }

        // User is on timeout.
        if (this.bot.timeoutService?.onTimeout(interaction.user)) {
            return;
        }

        if (interaction.isChatInputCommand()) {
            const params: SlashCommandParameters = {
                bot: this.bot,
                src: new CommandSource(interaction) as CommandInteractionCommandSource,
                options: interaction.options,
                guildId: interaction.guildId,
                extraArgs: {},
            };
            if (this.bot.commands.has(interaction.commandName)) {
                try {
                    const command = this.bot.commands.get(interaction.commandName)!;
                    if (command.disableSlash) {
                        return;
                    }
                    await command.executeSlash(params);
                } catch (error) {
                    await this.bot.sendError(params.src, error);
                }
            }
        } else if (interaction.isContextMenuCommand()) {
            const params: InteractionCommandParameters = {
                bot: this.bot,
                src: new CommandSource(interaction) as CommandInteractionCommandSource,
                guildId: interaction.guildId,
                extraArgs: {},
            };
            if (this.bot.contextMenuCommands.has(interaction.commandName)) {
                try {
                    const command = this.bot.contextMenuCommands.get(interaction.commandName)!;
                    await command.execute(params);
                } catch (error) {
                    await this.bot.sendError(params.src, error);
                }
            }
        } else {
            throw new Error(`Unknown command interaction type.`);
        }
    }
}
