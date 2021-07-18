import { PandaDiscordBot } from '../bot';
import { BaseCommand } from './base';

/**
 * Array of command types that can be instantiated.
 */
export type CommandTypeArray<Bot extends PandaDiscordBot = PandaDiscordBot, Shared = any> = (new () => BaseCommand<
    Bot,
    Shared
>)[];

/**
 * Maps a command name to the command that handles it.
 */
export type CommandMap<K, Bot extends PandaDiscordBot = PandaDiscordBot, Shared = any> = Map<
    K,
    BaseCommand<Bot, Shared>
>;

export namespace CommandConfig {
    /**
     * Builds a command array into a command map.
     * @param commands Array of command type.
     * @returns Map of command names to command instances.
     */
    export function build<Bot extends PandaDiscordBot = PandaDiscordBot>(
        commands: CommandTypeArray<Bot>,
    ): CommandMap<string, Bot> {
        const map = new Map();
        for (const cmd of commands) {
            const instance = new cmd();
            instance.initialize();
            map.set(instance.name, instance);
        }
        return map;
    }
}
