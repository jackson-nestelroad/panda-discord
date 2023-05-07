import { PandaDiscordBot } from '../bot';
import { BaseChatInputCommand, ParameterizedCommand } from './chat-input';
import { BaseContextMenuCommand, ContextMenuCommandClassType } from './context-menu';

/**
 * Array of command types that can be instantiated.
 */
export type CommandTypeArray<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Shared = unknown,
> = (new () => BaseChatInputCommand<Bot, Shared>)[];

/**
 * Maps a command name to the command that handles it.
 */
export type CommandMap<K, Bot extends PandaDiscordBot = PandaDiscordBot, Shared = unknown> = Map<
    K,
    BaseChatInputCommand<Bot, Shared>
>;

/**
 * Array of context menu command types that can be instantiated.
 */
export type ContextMenuCommandArray<
    Command extends ParameterizedCommand<Bot, Args, Shared>,
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Args = unknown,
    Shared = unknown,
> = ContextMenuCommandClassType<Command, Bot, Args, Shared>[];

/**
 * Maps a context menu command name to the command that handles it.
 */
export type ContextMenuCommandMap<K, Bot extends PandaDiscordBot = PandaDiscordBot> = Map<
    K,
    BaseContextMenuCommand<Bot>
>;

/**
 * The result of building the configured command classes.
 */
export interface BuildCommandMapsResult<Bot extends PandaDiscordBot> {
    commands: CommandMap<string, Bot>;
    contextMenuCommands: ContextMenuCommandMap<string, Bot>;
}

export namespace CommandConfig {
    function recursivelyFindSubcommands<Bot extends PandaDiscordBot = PandaDiscordBot>(
        start: BaseChatInputCommand<Bot>,
    ): BaseContextMenuCommand[] {
        const contextMenuCommands: BaseContextMenuCommand[] = [];
        const commands = [start];
        while (commands.length !== 0) {
            const cmd = commands.shift()!;
            if (cmd.isParameterized() && cmd.contextMenu && Array.isArray(cmd.contextMenu)) {
                for (const contextMenuCmd of cmd.contextMenu) {
                    const contextMenuInstance = new contextMenuCmd(cmd);
                    contextMenuInstance.initialize();
                    contextMenuCommands.push(contextMenuInstance);
                }
            } else if (cmd.isNested()) {
                commands.push(...cmd.subcommandMap.values());
            }
        }
        return contextMenuCommands;
    }

    /**
     * Builds a command array into its corresponding command maps.
     * @param commands Array of command type.
     * @returns Map of command names to command instances.
     */
    export function build<Bot extends PandaDiscordBot = PandaDiscordBot>(
        commands: CommandTypeArray<Bot>,
    ): BuildCommandMapsResult<Bot> {
        const result: BuildCommandMapsResult<Bot> = {
            commands: new Map(),
            contextMenuCommands: new Map(),
        };
        for (const cmd of commands) {
            const instance = new cmd();
            instance.initialize();
            const contextMenuCommands = recursivelyFindSubcommands(instance);
            for (const contextMenuCmd of contextMenuCommands) {
                result.contextMenuCommands.set(contextMenuCmd.name, contextMenuCmd);
            }
            result.commands.set(instance.name, instance);
        }
        return result;
    }
}
