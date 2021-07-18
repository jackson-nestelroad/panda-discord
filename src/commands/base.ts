import {
    ApplicationCommandData,
    ApplicationCommandOptionType,
    CommandInteractionOption,
    MessageEmbed,
    Snowflake,
} from 'discord.js';
import { PandaDiscordBot } from '../bot';
import { DiscordUtil } from '../util/discord';
import { ExpireAge, ExpireAgeFormat, TimedCache } from '../util/timed-cache';
import {
    ArgumentParserResult,
    ArgumentsConfig,
    ArgumentType,
    ArgumentTypeConfig,
    ArgumentTypeMetadata,
    ChatCommandArgumentParsingContext,
    SingleArgumentConfig,
    SingleArgumentTransformer,
} from './arguments';
import { CommandMap, CommandTypeArray } from './config';
import { ChatCommandParameters, CommandParameters, SlashCommandParameters } from './params';
import { DefaultCommandPermission } from './permission';

type ReadonlyDictionary<T> = { readonly [key: string]: T };

const StandardCooldownObject = {
    Low: { seconds: 3 },
    Medium: { seconds: 5 },
    High: { seconds: 10 },
    Minute: { minutes: 1 },
} as const;

/**
 * Standard cooldowns available for any command to use.
 */
export const StandardCooldowns: Readonly<Record<keyof typeof StandardCooldownObject, Readonly<ExpireAgeFormat>>> =
    StandardCooldownObject;

/**
 * Functions that internally modify command fields.
 * These functions should not be exposed externally.
 */
namespace InternalCommandModifiers {
    export function setShared<Shared>(cmd: BaseCommand<PandaDiscordBot, Shared>, shared: Shared) {
        cmd['shared' as string] = shared;
    }

    export function setParent<Shared>(
        child: BaseCommand<PandaDiscordBot, Shared>,
        parent: BaseCommand<PandaDiscordBot, Shared>,
    ) {
        child['parentCommand' as string] = parent;
    }

    export function setNestedDepth(cmd: BaseCommand, nestedLevel: number) {
        cmd['nestedDepth' as string] = nestedLevel;
    }
}

/*

    The following classes and interfaces make up the command framework.
    The primary goal of this framework is to allow chat commands (over
        message) and slash commands (over interaction) to be handled
        using the same code.
    This framework also aims to minimize command handling code, especially
        in terms of parsing arguments.

    The command framework has the following structure:


                            BaseCommand
                                |
          -------------------------------------------------                 
          |                     |                         |
    SimpleCommand       ParameterizedCommand        NestedCommand
                                |
                        ------------------------
                        |                      |
                ComplexCommand          LegacyCommand


    BaseCommand ---             The base type that all commands derive from. Represents
                                any command that can be run as a chat or slash command.
    SimpleCommand ---           A command that takes no arguments. Only the command name
                                is needed to run the command.
    ParameterizedCommand ---    A command that takes one or more arguments. This command
                                requires an ArgumentsConfig object to set up slash commands
                                and internal parsing.
    ComplexCommand ---          A parameterized command that uses the internal parser for
                                chat commands. The chat command parser aims to parse
                                arguments in a very similar way to how slash commands
                                are automatically parsed.
    LegacyCommand ---           A parameterized command that specifies custom parsing for
                                chat commands. Commands that specify arguments using
                                special formatting must use their own parser.
    NestedCommand ---           A command with one level of sub-commands. Nested commands
                                delegate running the command to a sub-command based on the
                                first argument.

    Furthermore, there are generic types across each class.
    Args ---                    An interface that is provided to the implementation-specific
                                command handler. An Args object is produced by all internal
                                and legacy parsers.
    Shared ---                  The type of the `BaseCommand.shared` object, which provides
                                data and methods that can be used across a nested command
                                chain. Commands that do not have sub-commands use the `never`
                                type to communicate that there is never shared data, while
                                nested commands provide shared data to its sub-commands.

    See the following commands and how they would be represented in this framework:
        
        /ping ---                       BaseCommand >>> SimpleCommand
                No arguments, so this command is simple.

        /8ball (question) ---           BaseCommand >>> ParameterizedCommand >>> ComplexCommand
                One argument which is trivial to parse, so this command is complex.

        /say (#channel) message ---     BaseCommand >>> ParameterizedCommand >>> LegacyCommand
                Two arguments, but they are not trivial to parse, since the `#channel`
                argument may or may not be specified. This would obviously be trivial
                as a slash command, but it needs special parsing if ran as a chat
                command, so a legacy command works well here.
        
        /message-listener add code ---  BaseCommand >>> NestedCommand
        /message-listener remove id
                This command could be represented as a ComplexCommand with two arguments,
                but the first argument changes how the command works. The `add` sub-command
                takes in code (which can be the rest of the message's content), while the
                `remove` sub-command takes in a single integer. This scenario suits the use
                case for a nested command, which will then have two sub-command objects, both
                represented as a complex command.

*/

// Optional fields for command handlers
export interface BaseCommand<Bot extends PandaDiscordBot = PandaDiscordBot, Shared = any> {
    /**
     * More description exclusively available on the help page.
     */
    readonly moreDescription?: string | string[];

    /**
     * Cooldown between multiple uses of the command.
     * Default is no cooldown.
     */
    readonly cooldown?: ExpireAge;

    /**
     * Examples for the help page.
     */
    readonly examples?: string[];

    /**
     * Prevent this command from being ran inside of a custom command.
     * Default is false, which allows commands to run inside of custom commands.
     */
    readonly disableInCustomCommand?: boolean;

    /**
     * Prevent this command from being added as a slash command.
     * Default is conditional on the command's permission.
     */
    readonly disableSlash?: boolean;

    /**
     * The guild this command should be added to as a slash command.
     * If left blank, it is added as a global slash command.
     */
    readonly slashGuildId?: Snowflake;

    /**
     * A flag that signals to the outside world if this command should
     * be treated as a nested command.
     * Do not set this manually in implementation classes.
     */
    readonly isNested?: boolean;

    /**
     * Map of sub-commands, which is only useful if the command is nested.
     */
    readonly subCommandMap?: CommandMap<string, Bot, Shared>;

    /**
     * Add any additional fields to the help page if desired.
     * @param embed Help embed.
     */
    addHelpFields?(embed: MessageEmbed): void;
}

/**
 * Any command that can run as a chat or slash command.
 *
 * Do not inherit directly from this!
 */
export abstract class BaseCommand<Bot extends PandaDiscordBot = PandaDiscordBot, Shared = any> {
    /**
     * Name of the command, which is used to run the command.
     */
    public abstract readonly name: string;

    /**
     * Description of the command that appears on the slash command screen
     * and the help page.
     */
    public abstract readonly description: string;

    /**
     * Category of the command.
     */
    public abstract readonly category: string;

    /**
     * Specifies the level of permission needed to run the command.
     */
    public abstract readonly permission: string;

    /**
     * Optional object for specifying the arguments the command takes.
     */
    public abstract readonly args?: ReadonlyDictionary<SingleArgumentConfig>;

    /**
     * An object that provides shared access to data inside of this command handler.
     * Only used for sub-commands to share common data.
     */
    protected readonly shared: Shared;

    /**
     * The parent of this command if it is a sub-command.
     */
    protected readonly parentCommand: Shared extends never ? never : BaseCommand<Bot, Shared>;

    /**
     * The nested depth of this command as a sub-command.
     *
     * 0 indicates the command is a top-level command.
     * 1 indicates the command has sub-commands.
     * 2 indicates the command has sub-command groups.
     */
    protected readonly nestedDepth: number = 0;

    /**
     * Maps user IDs to the number of times they have tried to use this command
     * before their cooldown has finished.
     */
    private cooldownSet: TimedCache<Snowflake, number> = null;

    /**
     * Checks if the command should be created as a slash command.
     */
    public get isSlashCommand(): boolean {
        // Command must be public.
        return !this.disableSlash && this.permission === 'Everyone';
    }

    /**
     * Generates the full description to display on the help page.
     * @returns Full description.
     */
    public fullDescription(): string {
        if (!this.moreDescription) {
            return this.description;
        }
        if (Array.isArray(this.moreDescription)) {
            return this.description + '\n\n' + this.moreDescription.join('\n\n');
        }
        return this.description + '\n\n' + this.moreDescription;
    }

    /**
     * Generates symbolic form of command arguments for the help page.
     */
    public abstract argsString(): string;

    /**
     * Generates data to be used for slash command configuration.
     */
    public abstract commandData(): ApplicationCommandData;

    /**
     * Runs the command when it is called from a message.
     * @param params Chat command parameters.
     */
    public abstract runChat(params: ChatCommandParameters<Bot>): Promise<void>;

    /**
     * Runs the command when it is called from an interaction.
     * @param params Slash command parameters.
     */
    public abstract runSlash(params: SlashCommandParameters<Bot>): Promise<void>;

    protected throwConfigurationError(msg: string) {
        throw new Error(`Configuration error for command "${this.name}": ${msg}`);
    }

    /**
     * Initializes the internal state of the command and performs a few validation tests.
     */
    public initialize(): void {
        if (/\s/.test(this.name)) {
            this.throwConfigurationError('Command names may not include whitespace.');
        }

        if (this.cooldown !== undefined) {
            this.cooldownSet = new TimedCache(this.cooldown);
            if (this.cooldownSet.expireAge <= 0) {
                this.cooldownSet = null;
            }
        }
    }

    /**
     * Executes the command as a chat command.
     * @param params Chat command parameters.
     * @returns Promise that resolves when the command finishes.
     */
    public async executeChat(params: ChatCommandParameters<Bot>): Promise<void> {
        if (await params.bot.handleCooldown(params.src, this.cooldownSet)) {
            return this.runChat(params);
        }
    }

    /**
     * Executes the command as a chat command.
     * @param params Chat command parameters.
     * @returns Promise that resolves when the command finishes.
     */
    public async executeSlash(params: SlashCommandParameters<Bot>): Promise<void> {
        if (await params.bot.handleCooldown(params.src, this.cooldownSet)) {
            return this.runSlash(params);
        }
    }
}

/**
 * A command that takes no other arguments besides its name.
 */
export abstract class SimpleCommand<Bot extends PandaDiscordBot, Shared = never> extends BaseCommand<Bot, Shared> {
    public args: null = null;
    public isNested: false = false;

    /**
     * Generalized command handler for both chat and slash commands.
     * @param params Command parameters.
     */
    public abstract run(params: CommandParameters<Bot>): Promise<void>;

    public argsString(): string {
        return '';
    }

    public commandData(): ApplicationCommandData {
        return {
            name: this.name,
            description: this.description,
            options: undefined,
            defaultPermission: this.permission === DefaultCommandPermission.Everyone,
        };
    }

    // Avoid any parsing of the message content, because it doesn't matter.
    public async runChat(params: ChatCommandParameters<Bot>) {
        return this.run(params);
    }

    public async runSlash(params: SlashCommandParameters<Bot>) {
        return this.run(params);
    }
}

interface ParameterizedCommand<Bot extends PandaDiscordBot, Args extends object, Shared = never> {
    /**
     * Suppresses arguments parsing errors, allowing the command to run anyway.
     * If true, input validation should be done in the command handler.
     */
    readonly suppressArgumentsError?: boolean;
}

/**
 * A command that takes one or more arguments.
 */
abstract class ParameterizedCommand<
    Bot extends PandaDiscordBot,
    Args extends object,
    Shared = never,
> extends BaseCommand<Bot, Shared> {
    // Stronger typing for the args configuration.
    public abstract readonly args: ArgumentsConfig<Args>;

    /**
     * Generalized command handler for chat and slash commands.
     * @param params Command parameters.
     * @param args Command arguments.
     */
    public abstract run(params: CommandParameters<Bot>, args: Args): Promise<void>;

    private static convertArgumentType(type: ArgumentType): ApplicationCommandOptionType {
        switch (type) {
            case ArgumentType.RestOfContent:
                return 'STRING';
            case ArgumentType.FloatingPoint:
                return 'STRING';
            default:
                return DiscordUtil.ActualApplicationCommandOptionTypeEnum[type] as ApplicationCommandOptionType;
        }
    }

    // Validates the arguments config object is possible to use.
    private validateArgumentConfig(): void {
        // Non-required arguments must be listed last (consecutively).
        // RestOfContent argument can only be at the very end.

        let nonRequiredFound = false;
        let restOfContentFound = false;
        for (const name in this.args) {
            const data: SingleArgumentConfig = this.args[name];
            if (restOfContentFound) {
                this.throwConfigurationError(`RestOfContent arguments must be configured last.`);
            }
            restOfContentFound = data.type === ArgumentType.RestOfContent;

            if (nonRequiredFound && data.required) {
                this.throwConfigurationError(`Non-required arguments must be configured last.`);
            }

            nonRequiredFound = !data.required;
        }
    }

    public commandData(): ApplicationCommandData {
        // Validate argument config at setup time.
        this.validateArgumentConfig();

        return {
            name: this.name,
            description: this.description,
            options: Object.entries(this.args).map(([name, data]: [string, SingleArgumentConfig]) => {
                return {
                    name,
                    description: data.description,
                    type: ParameterizedCommand.convertArgumentType(data.type),
                    required: data.required,
                    choices: data.choices?.length !== 0 ? data.choices : undefined ?? undefined,
                };
            }),
            defaultPermission: this.permission === DefaultCommandPermission.Everyone,
        };
    }

    // Shared parsing for slash commands.
    // Trivial since all arguments are parsed by Discord.
    public async runSlash(params: SlashCommandParameters<Bot>): Promise<void> {
        // No parsing needed for slash commands.
        // Discord has already done it for us!
        // Just pick the right part of the option object depending on the type.
        const parsedOptions: Partial<Args> = {};
        for (const arg in this.args) {
            const option = params.options.get(arg);
            const argConfig: SingleArgumentConfig = this.args[arg as keyof ArgumentsConfig<Args>];
            const typeConfig: ArgumentTypeMetadata<Bot> = ArgumentTypeConfig[argConfig.type];

            if (option === undefined) {
                parsedOptions[arg as string] = argConfig.default;
            } else {
                const result: ArgumentParserResult = {};
                typeConfig.parsers.slash(option, result);
                if (result.error && !this.suppressArgumentsError) {
                    throw new Error(result.error);
                }

                if (argConfig.transformers) {
                    if (argConfig.transformers.any) {
                        (argConfig.transformers.any as SingleArgumentTransformer)(result.value, result);
                    } else if (argConfig.transformers.slash) {
                        (argConfig.transformers.slash as SingleArgumentTransformer)(result.value, result);
                    }
                }

                if (result.error && !this.suppressArgumentsError) {
                    throw new Error(result.error);
                }

                parsedOptions[option.name] = result.value;
            }
        }
        return this.run(params, parsedOptions as Args);
    }
}

/**
 * A command that automatically parses chat and slash arguments the same way.
 */
export abstract class ComplexCommand<
    Bot extends PandaDiscordBot,
    Args extends object,
    Shared = never,
> extends ParameterizedCommand<Bot, Args, Shared> {
    public isNested: false = false;

    public argsString(): string {
        return Object.entries(this.args)
            .map(([name, data]: [string, SingleArgumentConfig]) => {
                if (!data.required) {
                    return `(${name})`;
                } else {
                    return name;
                }
            })
            .join(' ');
    }

    // Parses chat commands to make them appear like slash commands.
    public async runChat(params: ChatCommandParameters<Bot>): Promise<void> {
        // Parse message according to arguments configuration.
        // This allows chat commands to behave almost exactly like slash commands.
        // However, there are a few limitations:
        // Chat arguments are separated by space, while slash arguments are separated by the client.
        // Chat arguments must be listed sequentially, while slash arguments can be out of order.
        // This allows later optional arguments to be defined while others are not.
        // Commands should consider this a possibility now.
        // Later optional commands cannot entirely depend on the presence of previous optional commands.
        const parsed: Partial<Args> = {};
        const context: ChatCommandArgumentParsingContext<Bot> = {
            value: null,
            name: null,
            config: null,
            i: 0,
            params,
        };
        for (const entry of Object.entries(this.args)) {
            // context.name is really of type "keyof T".
            context.name = entry[0];
            context.config = entry[1] as SingleArgumentConfig;
            context.value = params.args[context.i];

            const argConfig: SingleArgumentConfig = this.args[context.name as keyof ArgumentsConfig<Args>];
            const typeConfig: ArgumentTypeMetadata<Bot> = ArgumentTypeConfig[argConfig.type];

            if (context.i >= params.args.length) {
                if (context.config.required) {
                    if (!this.suppressArgumentsError) {
                        throw new Error(`Missing required argument \`${context.name}\`.`);
                    }
                } else {
                    parsed[context.name] = argConfig.default;
                    continue;
                }
            }

            const result: ArgumentParserResult = {};
            if (typeConfig.asyncChatParser) {
                await typeConfig.parsers.chat(context, result);
            } else {
                typeConfig.parsers.chat(context, result);
            }
            if (result.error && !this.suppressArgumentsError) {
                throw new Error(result.error);
            }

            if (argConfig.transformers) {
                if (argConfig.transformers.any) {
                    (argConfig.transformers.any as SingleArgumentTransformer)(result.value, result);
                } else if (argConfig.transformers.chat) {
                    (argConfig.transformers.chat as SingleArgumentTransformer)(result.value, result);
                }
            }

            if (result.error && !this.suppressArgumentsError) {
                throw new Error(result.error);
            }

            parsed[context.name] = result.value;
            ++context.i;
        }
        return this.run(params, parsed as Args);
    }
}

/**
 * A command that implements its own parsing within the command itself.
 * Some commands have very complex parsing methods, which make slash commands impractical.
 * Thus, legacy commands allow chat-only commands to be expressed without having to set up an arguments object.
 */
export abstract class LegacyCommand<
    Bot extends PandaDiscordBot,
    Args extends object,
    Shared = never,
> extends ParameterizedCommand<Bot, Args, Shared> {
    public isNested: false = false;

    /**
     * Custom parser for chat commands.
     * @param params Chat command parameters.
     */
    protected abstract parseChatArgs(params: ChatCommandParameters<Bot>): Args;

    public async runChat(params: ChatCommandParameters<Bot>) {
        return this.run(params, this.parseChatArgs(params));
    }
}

export interface NestedCommand<Bot extends PandaDiscordBot, Shared = void> {
    /**
     * Creates the object that will be shared with all children of this nested command.
     */
    initializeShared?(): Shared;
}

/**
 * A command that delegates to sub-commands.
 * Currently only one level of nesting is supported.
 */
export abstract class NestedCommand<Bot extends PandaDiscordBot, Shared = void> extends BaseCommand<Bot, Shared> {
    public args: null = null;
    public isNested: true = true;

    /**
     * Configuration array of sub-command types to initialize internally.
     */
    public abstract subCommands: CommandTypeArray<Bot, Shared>;

    // Actual sub-command map to delegate commands to.
    public subCommandMap: CommandMap<string, Bot, Shared>;

    public argsString() {
        return `(${[...this.subCommandMap.keys()].join(' | ')})`;
    }

    public initialize() {
        super.initialize();

        // If depth is currently 2, then the next level of commands will be depth 3,
        // which is not supported by Discord.
        if (this.nestedDepth >= 2) {
            this.throwConfigurationError(`Nested commands only support two levels of nesting.`);
        }

        // Some extra validations for the Discord API. We check them here just to provide
        // nicer error messages for invalid commands.
        if (this.subCommands.length === 0) {
            this.throwConfigurationError(`Sub-command array cannot be empty.`);
        }
        if (this.subCommands.length > 25) {
            this.throwConfigurationError(`Command can only have up to 25 sub-commands.`);
        }

        // Set up shared data for all sub-commands if this is the top level.
        if (!this.parentCommand && this.initializeShared) {
            InternalCommandModifiers.setShared(this, this.initializeShared());
        }

        this.subCommandMap = new Map();
        for (const cmd of this.subCommands) {
            const instance = new cmd();
            InternalCommandModifiers.setShared(instance, this.shared);
            InternalCommandModifiers.setParent(instance, this);
            InternalCommandModifiers.setNestedDepth(instance, this.nestedDepth + 1);
            instance.initialize();

            this.subCommandMap.set(instance.name, instance);
        }
    }

    public commandData(): ApplicationCommandData {
        const data = {} as ApplicationCommandData;

        data.name = this.name;
        data.description = this.description;
        data.defaultPermission = this.permission === DefaultCommandPermission.Everyone;
        data.options = [];

        for (const [key, cmd] of [...this.subCommandMap.entries()]) {
            const subData = cmd.commandData();
            // We only support two levels of nesting, so this logic is adequate.
            // If the command is nested, then this level should be the sub-command group.
            // If the command is not nested, then this level should be the sub-command.
            const type: ApplicationCommandOptionType = cmd.isNested ? 'SUB_COMMAND_GROUP' : 'SUB_COMMAND';
            data.options.push({
                name: cmd.name,
                description: cmd.description,
                type,
                options: subData.options?.length !== 0 ? subData.options : undefined ?? undefined,
            });
        }

        return data;
    }

    public addHelpFields(embed: MessageEmbed) {
        embed.addField('Sub-Commands', [...this.subCommandMap.keys()].map(key => `\`${key}\``).join(', '));
    }

    // Delegates a chat command to a sub-command.
    public async runChat(params: ChatCommandParameters<Bot>) {
        if (params.args.length === 0) {
            throw new Error(`Missing sub-command for command \`${this.name}\`.`);
        }

        const subName = params.args.shift();

        if (this.subCommandMap.has(subName)) {
            const subNameIndex = params.content.indexOf(subName);
            if (subNameIndex === -1) {
                throw new Error(`Could not find sub-command name in content field.`);
            }
            params.content = params.content.substring(subNameIndex).trimLeft();

            const subCommand = this.subCommandMap.get(subName);
            if (await params.bot.validate(params, subCommand)) {
                await subCommand.executeChat(params);
            }
        } else {
            throw new Error(`Invalid sub-command for command \`${this.name}\`.`);
        }
    }

    // Delegates a slash command to a sub-command
    public async runSlash(params: SlashCommandParameters<Bot>) {
        let subCommandOption: CommandInteractionOption;
        subCommandOption = params.options.find(option => option.type === 'SUB_COMMAND_GROUP');
        if (!subCommandOption) {
            subCommandOption = params.options.find(option => option.type === 'SUB_COMMAND');
            if (!subCommandOption) {
                throw new Error(`Missing sub-command for command \`${this.name}\`.`);
            }
        }
        const subCommand = this.subCommandMap.get(subCommandOption.name);
        if (!subCommand) {
            throw new Error(`Invalid sub-command for command \`${this.name}\`.`);
        }

        params.options = subCommandOption.options;
        if (await params.bot.validate(params, subCommand)) {
            await subCommand.executeSlash(params);
        }
    }
}
