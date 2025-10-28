import { PandaDiscordBot } from '../bot';
import { BaseEvent, ExtendableClientEvents } from './base';

/**
 * Array of event types that can be instantiated.
 */
export type EventTypeArray<Bot extends PandaDiscordBot = PandaDiscordBot> = (new (
    bot: Bot,
) => BaseEvent<keyof ExtendableClientEvents, Bot>)[];

/**
 * Maps an event name to the object that handles it.
 */
export type EventMap<Bot extends PandaDiscordBot = PandaDiscordBot> = Map<
    keyof ExtendableClientEvents,
    BaseEvent<keyof ExtendableClientEvents, Bot>
>;

export namespace EventConfig {
    /**
     * Builds an event array into an event map.
     * @param events Array of event types.
     * @param bot Bot.
     * @returns Map of event names to event instances.
     */
    export function build<Bot extends PandaDiscordBot = PandaDiscordBot>(
        events: EventTypeArray<Bot>,
        bot: Bot,
    ): EventMap<Bot> {
        const map = new Map();
        for (const event of events) {
            const instance = new event(bot);
            map.set(instance.name, instance);
        }
        return map;
    }
}
