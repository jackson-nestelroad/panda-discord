import { EmbedBuilder, Snowflake } from 'discord.js';

import { EnabledCommandType, PandaDiscordBot } from '../bot';
import { ArgumentAutocompleteOption, ArgumentType, SingleArgumentConfig } from '../commands/arguments';
import { CommandCategoryUtil } from '../commands/category';
import { BaseChatInputCommand, ComplexCommand } from '../commands/chat-input';
import { CommandMap } from '../commands/config';
import { ExpireAgeConversion } from '../util/timed-cache';
import { BaseService } from './base';

/**
 * The context given to a help handler on where it is executing.
 *
 * The `bot` field is not truly necessary, since it is exposed through the internal help as well, but it is provided
 * here for consistency with command handlers.
 */
export interface HelpServiceContext<Bot extends PandaDiscordBot = PandaDiscordBot> {
    bot: Bot;
    guildId: Snowflake;
}

/**
 * Arguments given to help service when requesting help.
 *
 * Given as an interface in case it is expanded in the future.
 */
export interface HelpServiceArgs {
    /**
     * Main query of what the user is seeking help on.
     *
     * This can be a command category, command name, or bot-related other topic.
     */
    query?: string;
}

export interface HelpServiceOptions {
    /**
     * Name of the command that mainly invokes the help service.
     */
    commandName: string;

    /**
     * Number of commands allowed in a single column before writing them next to each other separated by commads.
     */
    singleColumnLimit: number;

    /**
     * Number of optional named arguments in a command's arguments string before clumping them together under one name.
     */
    optionalNamedArgumentsLimit: number;
}

type CompleteHelpServiceOptions = { [option in keyof HelpServiceOptions]-?: HelpServiceOptions[option] };

const defaultOptions: CompleteHelpServiceOptions = {
    commandName: 'help',
    singleColumnLimit: 20,
    optionalNamedArgumentsLimit: 3,
};

/**
 * Internal helper and state for `BaseHelpService`.
 *
 * This class provides data access and common methods for help handlers. The motivation for this class is to avoid
 * exposing too many data members and methods on the `BaseHelpService` interface.
 *
 * In simple cases, bot creators can just pass an instance of this to their bot's `BaseHelpService`. However, creators
 * may also derive from this class to provide more common features to their help handlers.
 */
export class BaseHelpServiceInternal<Bot extends PandaDiscordBot = PandaDiscordBot> {
    public readonly options: CompleteHelpServiceOptions = {} as CompleteHelpServiceOptions;
    public commandListByCategory: Map<string, Map<string, string>> = null;

    // Argument config used for condensed optional named arguments symbol.
    private readonly optionalArgsTemplate: SingleArgumentConfig = {
        description: '',
        type: ArgumentType.String,
        required: false,
        named: true,
    } as const;

    public constructor(public readonly bot: Bot, options: Partial<HelpServiceOptions> = {}) {
        this.mergeOptionsIn(options);
    }

    private mergeOptionsIn(options: Partial<HelpServiceOptions>): void {
        for (const key in defaultOptions) {
            this.options[key] = options[key] ?? defaultOptions[key];
        }
    }

    /**
     * Creates the full command-arguments string for displaying on the help page.
     * @param cmd Command.
     * @returns Full command-arguments string.
     */
    public createCommandArgsString(cmd: BaseChatInputCommand) {
        if (
            !(cmd instanceof ComplexCommand) ||
            this.options.optionalNamedArgumentsLimit === Infinity ||
            this.options.optionalNamedArgumentsLimit === undefined ||
            this.options.optionalNamedArgumentsLimit === null
        ) {
            return cmd.argsString(this.bot);
        }

        const argEntries = Object.entries(cmd.args).filter(([name, config]) => !config.hidden);
        const optionalNamedArgsCounter = argEntries.filter(([name, config]) => config.named && !config.required).length;
        if (optionalNamedArgsCounter <= this.options.optionalNamedArgumentsLimit) {
            return argEntries.map(([name, config]) => this.bot.argString(name, config)).join(' ');
        } else {
            const argsString = argEntries
                .filter(([name, config]) => !config.named || config.required)
                .map(([name, config]) => this.bot.argString(name, config))
                .join(' ');
            return `${argsString} ${this.bot.argString('args', this.optionalArgsTemplate)}*`;
        }
    }

    /**
     * This method builds all of the command arguments strings ahead of time and caches them for use in help handlers.
     *
     * For nested commands, this command is run for every subcommand. The current subcommand chain is stored in the
     * `nameChain` parameter.
     * @param map Command map.
     * @param nameChain Current name chain to append new commands to.
     */
    private addCommandsToCommandListByCategory(map: CommandMap<string>, nameChain: string[] = []): void {
        map.forEach((cmd, name) => {
            if (cmd.isNested() && !cmd.flattenHelpForSubCommands) {
                nameChain.push(name);
                this.addCommandsToCommandListByCategory(cmd.subcommandMap, nameChain);
                nameChain.pop();
            } else if (CommandCategoryUtil.isPublic(cmd.category)) {
                const categoryName = CommandCategoryUtil.realName(cmd.category);
                if (!this.commandListByCategory.has(categoryName)) {
                    this.commandListByCategory.set(categoryName, new Map());
                }
                const fullName = (nameChain.length > 0 ? nameChain.join(' ') + ' ' : '') + name;
                this.commandListByCategory
                    .get(categoryName)
                    .set(fullName, `${fullName} ${this.createCommandArgsString(cmd)}`);
            }
        });
    }

    /**
     * Initializes the command help cache.
     *
     * Call this method in all help handlers that rely on cached command data in the `commandListByCategory` map.
     */
    public async initializeCommandHelpCache(): Promise<void> {
        // Organize commands by category only once, since category shouldn't ever change.
        if (!this.commandListByCategory) {
            this.commandListByCategory = new Map();
            for (const category of this.bot.commandCategories) {
                if (CommandCategoryUtil.isPublic(category)) {
                    const categoryName = CommandCategoryUtil.realName(category);
                    this.commandListByCategory.set(categoryName, new Map());
                }
            }
            this.addCommandsToCommandListByCategory(this.bot.commands);
        }
    }

    /**
     * Returns the prefix to display next to commands.
     * @param context Help service context.
     * @returns Prefix, which is either the guild's prefix or a slash.
     */
    public displayPrefix({ bot, guildId }: HelpServiceContext<Bot>): string {
        return (bot.options.commandType & EnabledCommandType.Slash) !== 0 ? '/' : bot.getPrefix(guildId) ?? '/';
    }
}

/**
 * The return type of `HelpHandler.match`, which communicates if the help handler should be used for the query.
 *
 * In simple cases, you can return a boolean. In complex cases where it is helpful to "transform" the query, you can
 * return an object with the new string.
 */
export type HelpHandlerMatcherReturnType =
    | boolean
    | {
          matched: boolean;
          matchedString?: string;
      };

/**
 * A single handler for a help query.
 */
export abstract class HelpHandler<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Helper extends BaseHelpServiceInternal = BaseHelpServiceInternal,
> {
    constructor(protected readonly helper: Helper) {}

    /**
     * Initializes data for the help handler.
     */
    public initialize?(): Promise<void>;

    /**
     * Gives options for the autocomplete handler.
     * @param context Help service context.
     */
    public autocompleteOptions?(context: HelpServiceContext<Bot>): ArgumentAutocompleteOption[];

    /**
     * Matches the query to test if this help handler should handle it.
     * @param context Help service context.
     * @param args Help service arguments.
     * @returns `HelpHandlerMatcherReturnType`, which can be a boolean or an object.
     */
    public abstract match(
        context: HelpServiceContext<Bot>,
        args: HelpServiceArgs,
    ): Promise<HelpHandlerMatcherReturnType>;

    /**
     * Runs the help handler for the given query, assumiung it is already matched.
     * @param context Help service context.
     * @param args Help service arguments.
     * @param embed Embed to attach results to.
     */
    public abstract run(context: HelpServiceContext<Bot>, args: HelpServiceArgs, embed: EmbedBuilder): Promise<void>;
}

/**
 * Constructor type for HelpHandler.
 */
export type HelpHandlerType<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Helper extends BaseHelpServiceInternal = BaseHelpServiceInternal,
> = new (helper: Helper) => HelpHandler<Bot, Helper>;

/**
 * Namespace of built-in help handlers for simple cases.
 */
export namespace BuiltInHelpHandlers {
    /**
     * Help handler for blank queries.
     *
     * Returns basic usage information and a list of categories.
     */
    export class BlankHelpHandler extends HelpHandler {
        public async initialize(): Promise<void> {
            await this.helper.initializeCommandHelpCache();
        }

        public async match(context: HelpServiceContext, args: HelpServiceArgs): Promise<HelpHandlerMatcherReturnType> {
            return !args.query;
        }

        public async run(context: HelpServiceContext, args: HelpServiceArgs, embed: EmbedBuilder): Promise<void> {
            const { bot } = context;
            // Blank, give all public command categories.
            embed.setTitle('All Command Categories');

            let description = '';
            if ((bot.options.commandType & EnabledCommandType.Chat) !== 0) {
                description += `You may also use \`@${bot.name} cmd\` to run any command.`;
                if ((bot.options.commandType & EnabledCommandType.Slash) !== 0) {
                    description += ' All commands are also available as slash commands.';
                }
            } else if ((bot.options.commandType & EnabledCommandType.Slash) !== 0) {
                description += 'All commands are available as slash commands.';
            }

            description += `\n\nUse \`${this.helper.displayPrefix(context)}${
                this.helper.options.commandName
            } [category]\` to view commands in a specific category.`;
            embed.setDescription(description);

            embed.addFields({ name: 'Categories', value: [...this.helper.commandListByCategory.keys()].join('\n') });
            return;
        }
    }

    /**
     * Help handler for command categories.
     *
     * Returns all commands in the category.
     */
    export class CategoryHelpHandler extends HelpHandler {
        public async initialize(): Promise<void> {
            await this.helper.initializeCommandHelpCache();
        }

        public autocompleteOptions(context: HelpServiceContext): ArgumentAutocompleteOption[] {
            return [...this.helper.commandListByCategory.keys()].map(category => ({
                name: `${category} Category`,
                value: category,
            }));
        }

        public async match(
            context: HelpServiceContext,
            { query }: HelpServiceArgs,
        ): Promise<HelpHandlerMatcherReturnType> {
            let matchedCategory: string = null;
            for (const category of this.helper.commandListByCategory.keys()) {
                if (category.localeCompare(query, undefined, { sensitivity: 'base' }) === 0) {
                    matchedCategory = category;
                    break;
                }
            }

            if (matchedCategory !== null) {
                return { matched: true, matchedString: matchedCategory };
            }
            return false;
        }

        public async run(context: HelpServiceContext, { query }: HelpServiceArgs, embed: EmbedBuilder): Promise<void> {
            // Query is a category.
            embed.setTitle(`${query} Commands`);
            const categoryCommands = this.helper.commandListByCategory.get(query);
            let commandsString: string;
            const prefix = this.helper.displayPrefix(context);
            if (categoryCommands.size <= this.helper.options.singleColumnLimit) {
                commandsString = [...categoryCommands.values()].map(value => `${prefix}${value}`).join('\n');
            } else {
                commandsString = [...categoryCommands.keys()].map(value => `\`${prefix}${value}\``).join(', ');
            }

            if (!commandsString) {
                commandsString = 'No commands!';
            }

            embed.setDescription(commandsString);
        }
    }

    /**
     * Help handler for commands.
     *
     * Returns informaiton about the command.
     */
    export class CommandHelpHandler extends HelpHandler {
        public async initialize(): Promise<void> {
            await this.helper.initializeCommandHelpCache();
        }

        public autocompleteOptions(context: HelpServiceContext): ArgumentAutocompleteOption[] {
            const prefix = this.helper.displayPrefix(context);
            return [...this.helper.commandListByCategory.values()]
                .map(categoryMap => [...categoryMap.keys()])
                .flat()
                .map(command => ({ name: `${prefix}${command}`, value: `${command}` }));
        }

        public async match(
            { bot, guildId }: HelpServiceContext,
            { query }: HelpServiceArgs,
        ): Promise<HelpHandlerMatcherReturnType> {
            const prefix = bot.getPrefix(guildId);
            if (query.startsWith('/')) {
                query = query.slice(1);
            } else if (query.startsWith(prefix)) {
                query = query.slice(prefix.length);
            }
            const cmd = bot.getCommandFromFullName(query);
            return { matched: !!cmd, matchedString: cmd?.fullName() };
        }

        public async run(context: HelpServiceContext, { query }: HelpServiceArgs, embed: EmbedBuilder): Promise<void> {
            // Query is a global command.
            const { bot } = context;
            const prefix = this.helper.displayPrefix(context);
            const cmd = bot.getCommandFromFullName(query);
            const fullName = cmd.fullName();
            embed.setTitle(`${prefix}${fullName} ${this.helper.createCommandArgsString(cmd)}`);
            embed.addFields(
                { name: 'Description', value: cmd.fullDescription() },
                { name: 'Category', value: CommandCategoryUtil.realName(cmd.category), inline: true },
                {
                    name: 'Permission',
                    value: `${cmd.permission.name}${cmd.memberPermissions ? ' (with permissions)' : ''}`,
                    inline: true,
                },
                {
                    name: 'Cooldown',
                    value: cmd.cooldown ? ExpireAgeConversion.toString(cmd.cooldown) : 'None',
                    inline: true,
                },
            );
            if (cmd.args) {
                const argsEntries = Object.entries(cmd.args);
                const argumentsField: string[] = argsEntries
                    .filter(([name, config]) => !config.hidden)
                    .map(([name, config]) => `\`${bot.argString(name, config)}\` - ${config.description}`);
                if (argumentsField.length > 0) {
                    embed.addFields({ name: 'Arguments', value: argumentsField.join('\n'), inline: true });
                }
            }
            if (cmd.addHelpFields) {
                cmd.addHelpFields(embed);
            }
            if (cmd.examples && cmd.examples.length > 0) {
                embed.addFields({
                    name: 'Examples',
                    value: cmd.examples.map(example => `${prefix}${fullName} ${example}`).join('\n'),
                });
            }
        }
    }

    /**
     * Help handler for all queries.
     *
     * Returns an embed that says the given command was not found. This handler should be configured last, since it will
     * match to any query.
     */
    export class CatchAllHandler extends HelpHandler {
        public async match(context: HelpServiceContext, args: HelpServiceArgs) {
            return true;
        }

        public async run(context: HelpServiceContext, args: HelpServiceArgs, embed: EmbedBuilder) {
            // No handler matched the query.
            embed.setTitle('No Command Found');
            embed.setDescription(`Command "${this.helper.displayPrefix(context)}${args.query}" does not exist.`);
        }
    }
}

/**
 * The base class for a help service, which handles help queries by providing information about the bot and its
 * commands.
 *
 * This class must be extended from to at least provide a list of handlers. If you desire default functionality, use
 * `DefaultHelpService`.
 */
export abstract class BaseHelpService<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Internal extends BaseHelpServiceInternal = BaseHelpServiceInternal,
> extends BaseService<Bot> {
    /**
     * Handlers for all help queries.
     *
     * Handlers are tested and tried in the order they are configured. The earlier a handler
     * is placed in the array, the higher priority it has.
     */
    public abstract readonly handlers: HelpHandlerType[];

    private handlerInstances: HelpHandler[];

    public constructor(bot: Bot, protected readonly internal: Internal) {
        super(bot);
        this.setUpDefaultHandlers();
    }

    private setUpDefaultHandlers() {}

    /**
     * Initializes an embed to attach the help response to.
     *
     * Ensures a consistent format for all help handlers.
     * @param context Help service embed.
     * @returns Embed.
     */
    protected initializeEmbed({ bot }: HelpServiceContext): EmbedBuilder {
        const embed = bot.createEmbed();
        embed.setAuthor({ name: bot.name + ' Help', iconURL: bot.avatarUrl });
        return embed;
    }

    /**
     * Refreshes the help handlers by recreating them all.
     */
    protected async refreshHandlers(): Promise<void> {
        this.handlerInstances = [];
        for (const handler of this.handlers) {
            const instance = new handler(this.internal);
            if (instance.initialize) {
                await instance.initialize();
            }
            this.handlerInstances.push(instance);
        }
    }

    /**
     * Initializes the help service.
     */
    public async initialize(): Promise<void> {
        await this.refreshHandlers();
    }

    /**
     * Refreshes the help service.
     */
    public async refresh(): Promise<void> {
        await this.refreshHandlers();
    }

    /**
     * Attempts to autocomplete the given help query using the registered help handlers.
     * @param context Help service context.
     * @param query Help query.
     * @returns Array of autocomplete options.
     */
    public autocomplete(context: HelpServiceContext<Bot>, query: string): ArgumentAutocompleteOption[] {
        const options = this.handlerInstances
            .filter(handler => handler.autocompleteOptions)
            .map(handler => handler.autocompleteOptions(context))
            .flat();
        // Only return options that starts with the current value, using base-sensitive comparison.
        return options.filter(
            ({ value }) =>
                query.localeCompare(value.toString().substring(0, query.length), undefined, {
                    sensitivity: 'base',
                }) === 0,
        );
    }

    /**
     * Handles the given help query using the registered help handlers.
     * @param context Help service context.
     * @param args Help service arguments.
     * @returns Embed with results.
     */
    public async help(context: HelpServiceContext<Bot>, args: HelpServiceArgs): Promise<EmbedBuilder> {
        const embed = this.initializeEmbed(context);
        for (const handler of this.handlerInstances) {
            const result = await handler.match(context, args);
            if (typeof result === 'object' && result.matched) {
                await handler.run(context, { query: result.matchedString ?? args.query }, embed);
                return embed;
            } else if (typeof result === 'boolean' && result) {
                await handler.run(context, args, embed);
                return embed;
            }
        }
        throw new Error(`No help handler registered for the query "${args.query}".`);
    }
}

/**
 * A default help service with basic functionality for handling no query, categories, and commands.
 */
export class DefaultHelpService extends BaseHelpService {
    public handlers = [
        BuiltInHelpHandlers.BlankHelpHandler,
        BuiltInHelpHandlers.CategoryHelpHandler,
        BuiltInHelpHandlers.CommandHelpHandler,
        BuiltInHelpHandlers.CatchAllHandler,
    ];
}
