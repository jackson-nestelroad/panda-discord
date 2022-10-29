import { Interaction } from 'discord.js';

import { PandaDiscordBot } from '../..';
import { BaseEvent } from '../base';

/**
 * Default event handler for autocomplete interactions.
 */
export class DefaultAutocompleteEvent extends BaseEvent<'interactionCreate'> {
    constructor(bot: PandaDiscordBot) {
        super(bot, 'interactionCreate');
    }

    public async run(interaction: Interaction) {
        if (!interaction.isAutocomplete()) {
            return;
        }
        const cmd = this.bot.getCommandFromInteraction(interaction);
        const focused = interaction.options.getFocused(true);
        const argConfig = cmd.args[focused.name];
        if (argConfig?.autocomplete) {
            const response = cmd.args[focused.name]
                .autocomplete({
                    value: focused.value,
                    bot: this.bot,
                    guildId: interaction.guildId,
                    command: cmd,
                })
                .slice(0, 25);
            await interaction.respond(response);
        } else {
            await interaction.respond([]);
        }
    }
}
