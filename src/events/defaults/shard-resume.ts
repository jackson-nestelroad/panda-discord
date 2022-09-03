import { BaseEvent } from '../base';
import { PandaDiscordBot } from '../../bot';

/**
 * Default event handler for the resumeShard event.
 */
export class DefaultSharedResumeEvent extends BaseEvent<'shardResume'> {
    constructor(bot: PandaDiscordBot) {
        super(bot, 'shardResume');
    }

    public async run() {
        this.bot.setHelpPresence();
    }
}
