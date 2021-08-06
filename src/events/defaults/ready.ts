import { ApplicationCommandManager, GuildApplicationCommandManager } from 'discord.js';
import { PandaDiscordBot } from '../../bot';
import { BaseCommand } from '../../commands/base';
import { DiscordUtil } from '../../util/discord';
import { BaseEvent } from '../base';

/**
 * Default event handler for the ready event.
 */
export class DefaultReadyEvent extends BaseEvent<'ready', PandaDiscordBot> {
    constructor(bot: PandaDiscordBot) {
        super(bot, 'ready');
    }

    public async run() {
        console.log(`Bot is logged in as ${this.bot.client.user.tag}.`);
        this.bot.client.user.setActivity(`@${this.bot.name} help`, {
            type: 'PLAYING',
        });

        await this.bot.createAndEnableSlashCommands();
    }
}
