import { EnabledCommandType, PandaDiscordBot } from '../../bot';
import { BaseEvent } from '../base';

/**
 * Default event handler for the ready event.
 */
export class DefaultReadyEvent extends BaseEvent<'clientReady'> {
    constructor(bot: PandaDiscordBot) {
        super(bot, 'clientReady');
    }

    public async run() {
        console.log(`Bot is logged in as ${this.bot.client.user!.tag}.`);
        this.bot.setHelpPresence();

        if ((this.bot.options.commandType & EnabledCommandType.Application) !== 0) {
            await this.bot.createAndEnableApplicationCommands();
        } else {
            await this.bot.deleteAllApplicationCommands();
        }
    }
}
