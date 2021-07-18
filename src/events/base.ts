import { ClientEvents } from 'discord.js';
import { PandaDiscordBot } from '../bot';

/**
 * An event handler for an event exposed by Discord.JS.
 */
export abstract class BaseEvent<K extends keyof ClientEvents, Bot extends PandaDiscordBot = PandaDiscordBot> {
    constructor(protected bot: Bot, public readonly name: K) {
        this.bot.client.on(name, this.execute.bind(this));
    }

    private execute(...args: ClientEvents[K]) {
        this.run(...args).catch(error => {
            console.error(`Uncaught exception in ${this.name} event handler: ${error}`);
        });
    }

    /**
     * Event handler for the Discord event.
     */
    public abstract run(...args: ClientEvents[K]): Promise<void>;
}
