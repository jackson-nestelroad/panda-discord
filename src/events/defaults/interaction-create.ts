import { Interaction } from 'discord.js';
import { PandaDiscordBot } from '../../bot';
import { CommandSource } from '../../commands/command-source';
import { SlashCommandParameters } from '../../commands/params';
import { BaseEvent } from '../base';

/**
 * Default event handler for interactions.
 */
export class DefaultInteractionCreateEvent extends BaseEvent<'interactionCreate', PandaDiscordBot> {
    constructor(bot: PandaDiscordBot) {
        super(bot, 'interactionCreate');
    }

    public async run(interaction: Interaction) {
        // Only serve commands.
        if (!interaction.isCommand()) {
            return;
        }

        // User is a bot or in a direct message.
        if (interaction.user.bot) {
            return;
        }

        // User is on timeout.
        if (this.bot.timeoutService?.onTimeout(interaction.user)) {
            return;
        }

        // Global command.
        if (this.bot.commands.has(interaction.commandName)) {
            const params: SlashCommandParameters = {
                bot: this.bot,
                src: new CommandSource(interaction),
                options: interaction.options,
                guildId: interaction.guild.id,
            };

            try {
                const command = this.bot.commands.get(interaction.commandName);
                if (await this.bot.validate(params, command)) {
                    await command.executeSlash(params);
                }
            } catch (error) {
                this.bot.sendError(params.src, error);
            }
        }
    }
}
