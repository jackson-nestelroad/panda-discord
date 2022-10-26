import { EnabledCommandType, PandaDiscordBot } from '../../bot';
import { BaseEvent } from '../base';

/**
 * Default event handler for the ready event.
 */
export class DefaultReadyEvent extends BaseEvent<'ready'> {
    constructor(bot: PandaDiscordBot) {
        super(bot, 'ready');
    }

    public async run() {
        console.log(`Bot is logged in as ${this.bot.client.user.tag}.`);
        this.bot.setHelpPresence();

        if ((this.bot.options.commandType & EnabledCommandType.Slash) !== 0) {
            await this.bot.createAndEnableSlashCommands();
        } else {
            await this.bot.deleteAllSlashCommands();
        }
    }
}
