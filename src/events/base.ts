import { ClientEvents } from 'discord.js';

import { PandaDiscordBot } from '../bot';

export interface ExtendableClientEvents extends ClientEvents {
    [other: string]: [...unknown[]];
}

/**
 * An event handler for an event exposed by Discord.JS.
 */
export abstract class BaseEvent<K extends keyof ExtendableClientEvents, Bot extends PandaDiscordBot = PandaDiscordBot> {
    constructor(protected bot: Bot, public readonly name: K) {
        this.bot.client.on(name as any, this.execute.bind(this));
    }

    private execute(...args: ExtendableClientEvents[K]) {
        this.run(...args).catch(error => {
            console.error(`Uncaught exception in ${this.name} event handler: ${error}`);
            if (this.bot.handleUncaughtEventHandlerError) {
                this.bot.handleUncaughtEventHandlerError(error);
            }
        });
    }

    /**
     * Event handler for the Discord event.
     */
    public abstract run(...args: ExtendableClientEvents[K]): Promise<void>;
}
