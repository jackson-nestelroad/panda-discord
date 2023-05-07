import {
    ApplicationCommandOptionData,
    ApplicationCommandOptionType,
    ApplicationCommandSubCommandData,
    ApplicationCommandSubGroupData,
    ApplicationCommandType,
    ChatInputApplicationCommandData,
    EmbedBuilder,
    Snowflake,
} from 'discord.js';

import { NamedArgsOption } from '..';
import { PandaDiscordBot } from '../bot';
import { SplitArgumentArray } from '../util/argument-splitter';
import { ExpireAge, ExpireAgeFormat, TimedCache } from '../util/timed-cache';
import {
    ArgumentParserResult,
    ArgumentType,
    ArgumentTypeConfig,
    ArgumentTypeMetadata,
    ArgumentsConfig,
    ChatCommandArgumentParsingContext,
    ParseableArguments,
    SingleArgumentConfig,
    SingleArgumentTransformer,
    StringArgumentParsingContext,
} from './arguments';
import { BaseCommand } from './base';
import { CommandCategoryUtil, DefaultCommandCategory } from './category';
import { CommandMap, CommandTypeArray, ContextMenuCommandArray } from './config';
import { ChatCommandParameters, CommandParameters, SlashCommandArgumentLevel, SlashCommandParameters } from './params';
import { CommandPermissionOptions } from './permission';

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
    export function setShared<Shared>(cmd: BaseChatInputCommand<PandaDiscordBot, Shared>, shared: Shared) {
        // @ts-ignore
        cmd['shared' as string] = shared;
    }

    export function setParent<Shared>(
        child: BaseChatInputCommand<PandaDiscordBot, Shared>,
        parent: BaseChatInputCommand<PandaDiscordBot, Shared>,
    ) {
        // @ts-ignore
        child['parentCommand' as string] = parent;
    }

    export function setNestedDepth(cmd: BaseChatInputCommand, nestedLevel: number) {
        // @ts-ignore
        cmd['nestedDepth' as string] = nestedLevel;
    }

    export function setCategory(cmd: BaseChatInputCommand, category: string) {
        // @ts-ignore
        cmd['category' as string] = category;
    }

    export function setPermission(cmd: BaseChatInputCommand, permission: CommandPermissionOptions) {
        // @ts-ignore
        cmd['permission' as string] = permission;
    }

    export function setSubcommandMap<Bot extends PandaDiscordBot = PandaDiscordBot, Shared = unknown>(
        cmd: NestedCommand<Bot, Shared>,
        subcommandMap: CommandMap<string, Bot, Shared>,
    ) {
        // @ts-ignore
        cmd['subcommandMap' as string] = subcommandMap;
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


                            BaseChatInputCommand
                                    |
            -------------------------------------------------                 
            |                     |                         |
        SimpleCommand       ParameterizedCommand        NestedCommand
                                    |
                            ------------------------
                            |                      |
                    ComplexCommand          LegacyCommand


    BaseChatInputCommand ---             The base type that all commands derive from. Represents
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
                                
                                NOTE: LegacyCommand's can be completely replaced using
                                named arguments.
    
    NestedCommand ---           A command with one level of subcommands. Nested commands
                                delegate running the command to a subcommand based on the
                                first argument.

    Furthermore, there are generic types across each class.
    Args ---                    An interface that is provided to the implementation-specific
                                command handler. An Args object is produced by all internal
                                and legacy parsers.
    Shared ---                  The type of the `BaseChatInputCommand.shared` object, which provides
                                data and methods that can be used across a nested command
                                chain. Commands that do not have subcommands use the `never`
                                type to communicate that there is never shared data, while
                                nested commands provide shared data to its subcommands.

    See the following commands and how they would be represented in this framework:
        
        /ping ---                       BaseChatInputCommand >>> SimpleCommand
                No arguments, so this command is simple.

        /8ball (question) ---           BaseChatInputCommand >>> ParameterizedCommand >>> ComplexCommand
                One argument which is trivial to parse, so this command is complex.

        /say (#channel) message ---     BaseChatInputCommand >>> ParameterizedCommand >>> ComplexCommand
                Two arguments, but they are not trivial to parse, since the `#channel`
                argument may or may not be specified. This is trivial as a slash command,
                and named arguments can be used for the chat command.
                Examples:   !say --channel=#general Hello, world!
                            !say Hello, world! --channel=#general
           
        
        /message-listener add code ---  BaseChatInputCommand >>> NestedCommand
        /message-listener remove id
                This command could be represented as a ComplexCommand with two arguments,
                but the first argument changes how the command works. The `add` subcommand
                takes in code (which can be the rest of the message's content), while the
                `remove` subcommand takes in a single integer. This scenario suits the use
                case for a nested command, which will then have two subcommand objects, both
                represented as a complex command.

*/

// Optional fields for command handlers.
export interface BaseChatInputCommand<Bot extends PandaDiscordBot = PandaDiscordBot, Shared = unknown> {
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
     * Prevent this command from being used as a chat command.
     * Default is false;
     */
    readonly disableChat?: boolean;

    /**
     * Prevent this command from being added as a slash command.
     * Default is false.
     */
    readonly disableSlash?: boolean;

    /**
     * Disables parsing named arguments.
     */
    readonly disableNamedArgs?: boolean;

    /**
     * Add any additional fields to the help page if desired.
     * @param embed Help embed.
     */
    addHelpFields?(embed: EmbedBuilder): void;
}

/**
 * Any command that can run as a chat or slash command.
 *
 * Do not inherit directly from this!
 */
export abstract class BaseChatInputCommand<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Shared = unknown,
> extends BaseCommand {
    public readonly type = ApplicationCommandType.ChatInput;

    /**
     * Description of the command that appears on the slash command screen and the help page.
     */
    public abstract readonly description: string;

    /**
     * Category of the command.
     */
    public abstract readonly category: string;

    /**
     * Specifies the level of permission needed to run the command.
     */
    public abstract readonly permission: CommandPermissionOptions;

    /**
     * Optional object for specifying the arguments the command takes.
     */
    public abstract readonly args?: ReadonlyDictionary<SingleArgumentConfig>;

    /**
     * An object that provides shared access to data inside of this command handler.
     * Only used for subcommands to share common data.
     */
    protected readonly shared: Shared;

    /**
     * The parent of this command if it is a subcommand.
     */
    protected readonly parentCommand: Shared extends never ? never : BaseChatInputCommand<Bot, Shared>;

    /**
     * The nested depth of this command as a subcommand.
     *
     * 0 indicates the command is a top-level command.
     * 1 indicates the command has subcommands.
     * 2 indicates the command has subcommand groups.
     */
    protected readonly nestedDepth: number = 0;

    /**
     * Maps user IDs to the number of times they have tried to use this command before their cooldown has finished.
     */
    private cooldownSet?: TimedCache<Snowflake, number>;

    /**
     * Checks if the command should be created as a slash command.
     */
    public get isSlashCommand(): boolean {
        // Command must be public.
        return !this.disableSlash && CommandCategoryUtil.isPublic(this.category);
    }

    public abstract isParameterized(): this is ParameterizedCommand<Bot, unknown, Shared>;
    public abstract isNested(): this is NestedCommand<Bot, Shared>;

    /**
     * Generates the full name (includes all subcommands) to display on the help page.
     * @returns Full name.
     */
    public fullName(): string {
        let name = this.name;
        for (let cmd = this.parentCommand; cmd; cmd = cmd.parentCommand) {
            name = `${cmd.name} ${name}`;
        }
        return name;
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
    public abstract argsString(bot: Bot): string;

    /**
     * Generates data to be used for slash command configuration.
     */
    public abstract commandData(): ChatInputApplicationCommandData;

    /**
     * Runs the command when it is called from a message.
     * @param params Chat command parameters.
     */
    public abstract runChat(params: ChatCommandParameters<Bot>): Promise<boolean>;

    /**
     * Runs the command when it is called from an interaction.
     * @param params Slash command parameters.
     */
    public abstract runSlash(params: SlashCommandParameters<Bot>): Promise<boolean>;

    protected throwConfigurationError(msg: string) {
        throw new Error(`Configuration error for command "${this.name}": ${msg}`);
    }

    /**
     * Returns whether or not the command should parse out named arguments prior to running.
     * @param params Command parameters.
     * @returns Parse named arguments?
     */
    protected shouldParseNamedArgs(params: CommandParameters<Bot>): boolean {
        let parseNamedArgs = !this.disableNamedArgs;
        switch (params.bot.options.namedArgs) {
            case NamedArgsOption.Always:
                parseNamedArgs &&= true;
                break;
            case NamedArgsOption.Never:
                parseNamedArgs &&= false;
                break;
            case NamedArgsOption.IfNeeded:
                // @ts-ignore
                parseNamedArgs &&= this['usesNamedArgs'];
                break;
        }
        return parseNamedArgs;
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
                delete this.cooldownSet;
            }
        }

        if (this.category === DefaultCommandCategory.Inherit) {
            if (!this.parentCommand) {
                this.throwConfigurationError('Only subcommands can inherit command category from parent.');
            }
            InternalCommandModifiers.setCategory(this, this.parentCommand.category);
        }

        if (this.permission.inherit) {
            if (!this.parentCommand) {
                this.throwConfigurationError('Only subcommands can inherit command permission from parent.');
            }
            InternalCommandModifiers.setPermission(this, this.parentCommand.permission);
        }
    }

    /**
     * Executes the command as a chat command.
     *
     * Before executing the command, this method checks a few preconditions, such as validating permisions and checking
     * if the user is on cooldown for the command. If the user fails any of these preconditions, `false` is returned.
     * Otherwise, the command executes and this method returns `true`. If the command experiences a failure, it should
     * throw an error to be caught by the caller.
     * @param params Chat command parameters.
     * @returns Promise that resolves when the command finishes. Promise contains `true` if the command executed and
     * `false` if the command did not execute for some reason, such as for validation or cooldown reasons.
     */
    public async executeChat(params: ChatCommandParameters<Bot>): Promise<boolean> {
        // Invalid permissions.
        if (!params.bot.validate(params, this)) {
            return false;
        }

        // Wrong guild.
        if (this.guildId && params.guildId !== this.guildId) {
            return false;
        }

        if (!(await params.bot.handleCooldown(params.src, this.cooldownSet))) {
            return false;
        }

        return await this.runChat(params);
    }

    /**
     * Executes the command as a slash command.
     *
     * Before executing the command, this method checks a few preconditions, such as validating permisions and checking
     * if the user is on cooldown for the command. If the user fails any of these preconditions, `false` is returned.
     * Otherwise, the command executes and this method returns `true`. If the command experiences a failure, it should
     * throw an error to be caught by the caller.
     * @param params Slash command parameters.
     * @returns Promise that resolves when the command finishes. Promise contains `true` if the command executed and
     * `false` if the command did not execute for some reason, such as for validation or cooldown reasons.
     */
    public async executeSlash(params: SlashCommandParameters<Bot>): Promise<boolean> {
        // Invalid permissions.
        if (!params.bot.validate(params, this)) {
            await params.src.reply({ content: 'Permission denied.', ephemeral: true });
            return false;
        }

        // Wrong guild.
        if (this.guildId && params.guildId !== this.guildId) {
            // This should not ever really happen if we upload the command correctly, but we check just in case.
            await params.src.reply({ content: 'Wrong guild.', ephemeral: true });
            return false;
        }

        if (!(await params.bot.handleCooldown(params.src, this.cooldownSet))) {
            return false;
        }

        return await this.runSlash(params);
    }
}

/**
 * A command that takes no other arguments besides its name.
 */
export abstract class SimpleCommand<Bot extends PandaDiscordBot, Shared = never> extends BaseChatInputCommand<
    Bot,
    Shared
> {
    public args: never;

    public isParameterized(): false {
        return false;
    }

    public isNested(): false {
        return false;
    }

    /**
     * Generalized command handler for both chat and slash commands.
     * @param params Command parameters.
     */
    public abstract run(params: CommandParameters<Bot>): Promise<void>;

    public argsString(bot: Bot): string {
        return '';
    }

    public commandData(): ChatInputApplicationCommandData {
        return {
            name: this.name,
            description: this.description,
            options: [],
            defaultMemberPermissions: this.memberPermissions ?? this.permission.memberPermissions ?? null,
            dmPermission: this.guildId ? undefined : !!this.enableInDM,
        };
    }
    public async runChat(params: ChatCommandParameters<Bot>): Promise<boolean> {
        // Avoid any parsing of the message content, because it doesn't matter.
        // ... except in the case where the user is asking for help.
        if (this.shouldParseNamedArgs(params)) {
            const { named } = params.bot.extractNamedArgs(params.args);
            if (
                params.bot.options.runHelpNamedArg &&
                named.has(params.bot.options.runHelpNamedArg) &&
                params.bot.helpService
            ) {
                // User is asking for help on how to use this command.
                const helpEmbed = await params.bot.helpService.help(params, { query: this.fullName() });
                await params.src.send({ embeds: [helpEmbed] });
                return true;
            }
        }
        await this.run(params);
        return true;
    }

    public async runSlash(params: SlashCommandParameters<Bot>): Promise<boolean> {
        await this.run(params);
        return true;
    }
}

export interface ParameterizedCommand<Bot extends PandaDiscordBot = PandaDiscordBot, Args = unknown, Shared = never> {
    /**
     * Suppresses arguments parsing errors, allowing the command to run anyway.
     * If true, input validation should be done in the command handler.
     */
    readonly suppressArgumentsError?: boolean;

    /**
     * Context menu commands associated with this command.
     */
    readonly contextMenu?: ContextMenuCommandArray<this, Bot, Args, Shared>;
}

/**
 * A command that takes one or more arguments.
 */
export abstract class ParameterizedCommand<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Args = unknown,
    Shared = never,
> extends BaseChatInputCommand<Bot, Shared> {
    public isParameterized(): true {
        return true;
    }

    public isNested(): false {
        return false;
    }

    // Stronger typing for the args configuration.
    public abstract readonly args: ArgumentsConfig<Args>;

    // Does the bot use named arguments?
    // This field actually is used.
    private usesNamedArgs: boolean = false;

    /**
     * Generalized command handler for chat and slash commands.
     * @param params Command parameters.
     * @param args Command arguments.
     */
    public abstract run(params: CommandParameters<Bot>, args: Args): Promise<void>;

    private static convertArgumentType(type: ArgumentType): ApplicationCommandOptionType {
        switch (type) {
            case ArgumentType.RestOfContent:
                return ApplicationCommandOptionType.String;
            case ArgumentType.SplitArguments:
                return ApplicationCommandOptionType.String;
            default:
                return type as number as ApplicationCommandOptionType;
        }
    }

    // Validates that the arguments config object is possible to use.
    private validateArgumentConfig(): void {
        // Enforces the following ordering:
        //  1. Required arguments.
        //  2. Optional arguments.
        //  3. Rest-of-content argument.
        // Named and hidden arguments can be scattered throughout in any way, as long as they are not marked as
        // required.

        const state = {
            required: true,
            restOfContent: false,
        };

        const argEntries: [string, SingleArgumentConfig][] = Object.entries(this.args);
        for (const [name, config] of argEntries) {
            if (config.named) {
                this.usesNamedArgs = true;
                if (config.hidden) {
                    if (config.required) {
                        this.throwConfigurationError('Hidden arguments cannot be required.');
                    } else {
                        continue;
                    }
                }
            } else if (config.hidden) {
                this.throwConfigurationError('Hidden arguments must be marked as named arguments.');
            }

            // The following logic trivially holds only for non-hidden arguments.

            const isRestOfContent =
                !config.named &&
                (config.type === ArgumentType.RestOfContent || config.type === ArgumentType.SplitArguments);

            if (!state.required && config.required) {
                // Optional argument comes after some required argument.
                this.throwConfigurationError('Optional arguments must be configured last.');
            } else if (state.restOfContent && !config.named) {
                // Rest-of-content argument already found.
                this.throwConfigurationError(
                    'Non-named arguments that use the rest of content must be configured last.',
                );
            }

            state.required &&= config.required;
            state.restOfContent ||= isRestOfContent;
        }
    }

    public commandData(): ChatInputApplicationCommandData {
        // Validate argument config at setup time.
        this.validateArgumentConfig();

        return {
            name: this.name,
            description: this.description,
            options: Object.entries(this.args)
                .filter(([name, config]: [string, SingleArgumentConfig]) => !config.hidden)
                .map(([name, config]: [string, SingleArgumentConfig]) => {
                    return {
                        name,
                        description: config.description,
                        type: ParameterizedCommand.convertArgumentType(config.type),
                        required: config.required,
                        choices: config.choices?.length !== 0 ? config.choices : undefined ?? undefined,
                        channelTypes: config.channelTypes?.length !== 0 ? config.channelTypes : undefined ?? undefined,
                        autocomplete: config.autocomplete ? true : undefined,
                    } as ApplicationCommandOptionData;
                }),
            defaultMemberPermissions: this.memberPermissions ?? this.permission.memberPermissions ?? null,
            dmPermission: this.guildId ? undefined : !!this.enableInDM,
        };
    }

    protected runTransformer(argConfig: SingleArgumentConfig, result: ArgumentParserResult, slash: boolean): void {
        if (!result.value) {
            return;
        }
        if (argConfig.transformers) {
            if (argConfig.transformers.any) {
                (argConfig.transformers.any as SingleArgumentTransformer)(result.value!, result);
            } else if (slash && argConfig.transformers.slash) {
                (argConfig.transformers.slash as SingleArgumentTransformer)(result.value!, result);
            } else if (!slash && argConfig.transformers.chat) {
                (argConfig.transformers.chat as SingleArgumentTransformer)(result.value!, result);
            }
        }
    }

    /**
     * Parses the given parseable arguments object into its corresponding arguments object that can be used to run the
     * command.
     *
     * This command is equivalent to running a chat command.
     * @param params Command parameters.
     * @param args Parseable arguments.
     * @param parsed Optional object of arguments that are already parsed. Values defined here will be skipped.
     * @returns Parsed arguments object.
     */
    public async parseArguments(
        params: CommandParameters<Bot>,
        args: ParseableArguments<Args>,
        parsed: Partial<Args> = {},
    ): Promise<Args> {
        // We need to create a fake context here for parsing like a chat command.
        // The chat parser uses this context object, but it does not necessarily use everything here.
        const context = {
            params: {
                bot: params.bot,
                guildId: params.guildId,
                src: params.src,
                extraArgs: {},
            },
        } as StringArgumentParsingContext<Bot>;

        for (const arg in this.args) {
            if (parsed[arg] !== undefined && parsed[arg] !== null) {
                // This argument is already defined, which means it was given by the caller, so we assume it is already
                // parsed and good to go.
                continue;
            }

            const argConfig: SingleArgumentConfig = this.args[arg as keyof ArgumentsConfig<Args>];
            const typeConfig: ArgumentTypeMetadata<Bot> = ArgumentTypeConfig[argConfig.type];

            // Update the context for this argument.
            context.value = args[arg];
            context.name = arg;
            context.config = argConfig;

            // Call the correct parser for the argument type.
            const result: ArgumentParserResult = {};
            if (context.value === undefined || context.value === null) {
                // Argument was not given.
                if (argConfig.default === undefined || argConfig.default === null) {
                    // Argument does not have a default value.
                    if (argConfig.required) {
                        throw new Error(`Missing required argument \`${context.name}\`.`);
                    }
                    // Argument is not required, so we skip over it.
                    continue;
                } else {
                    result.value = argConfig.default;
                }
            } else {
                // Argument was given.
                const parserResult = typeConfig.parsers.string(context, result);
                // @ts-ignore
                if (typeof parserResult?.['then'] === 'function') {
                    await parserResult;
                }

                if (result.error && !this.suppressArgumentsError) {
                    throw new Error(result.error);
                }
            }

            // Transform the argument as configured.
            this.runTransformer(context.config, result, false);

            if (result.error && !context.config.hidden && !this.suppressArgumentsError) {
                throw new Error(result.error);
            }

            // Assign the parsed value into the resulting object for the commandt to use.
            // @ts-ignore
            parsed[arg as string] = result.value;
        }
        return parsed as Args;
    }

    // Shared parsing for slash commands.
    // Trivial since all arguments are parsed by Discord.
    public async runSlash(params: SlashCommandParameters<Bot>): Promise<boolean> {
        // No parsing needed for slash commands.
        // Discord has already done it for us!
        // Just pick the right part of the option object depending on the type.
        const parsedOptions: Partial<Args> = {};
        for (const arg in this.args) {
            const argConfig: SingleArgumentConfig = this.args[arg as keyof ArgumentsConfig<Args>];
            const typeConfig: ArgumentTypeMetadata<Bot> = ArgumentTypeConfig[argConfig.type];

            const result: ArgumentParserResult = {};
            const option = params.options.get(arg, false);
            if (option === undefined || option === null) {
                if (argConfig.default === undefined || argConfig.default === null) {
                    continue;
                }
                result.value = argConfig.default;
            } else {
                typeConfig.parsers.slash(option, result);
            }

            if (result.error && !this.suppressArgumentsError) {
                throw new Error(result.error);
            }

            this.runTransformer(argConfig, result, true);

            if (result.error && !this.suppressArgumentsError) {
                throw new Error(result.error);
            }

            // @ts-ignore
            parsedOptions[option?.name ?? arg] = result.value;
        }
        await this.run(params, parsedOptions as Args);
        return true;
    }
}

/**
 * A command that automatically parses chat and slash arguments the same way.
 */
export abstract class ComplexCommand<Bot extends PandaDiscordBot, Args, Shared = never> extends ParameterizedCommand<
    Bot,
    Args,
    Shared
> {
    public argsString(bot: Bot): string {
        return Object.entries(this.args)
            .filter(([name, config]: [string, SingleArgumentConfig]) => !config.hidden)
            .map(([name, config]: [string, SingleArgumentConfig]) => bot.argString(name, config))
            .join(' ');
    }

    private async parseCommandArgument(
        context: ChatCommandArgumentParsingContext<Bot>,
    ): Promise<ArgumentParserResult['value']> {
        const typeConfig: ArgumentTypeMetadata<Bot> = ArgumentTypeConfig[context.config.type];

        // If this type does not read from arguments, move backwards so that the current argument is used later.
        // For instance, attachments are retrieved off of the message itself.
        if (typeConfig.readsFromArgs === false) {
            --context.i;
            // If using named arguments, the value should be given to the parser.
            // If not, there is no value to give.
            if (!context.isNamed) {
                context.value = undefined;
            }
        }

        // Call the correct parser for the argument type.
        const result: ArgumentParserResult = {};
        let parser = typeConfig.parsers.chat ?? typeConfig.parsers.string;
        const parserResult = parser(context, result);
        // @ts-ignore
        if (typeof parserResult?.['then'] === 'function') {
            await parserResult;
        }

        if (result.error && !context.config.hidden && !this.suppressArgumentsError) {
            throw new Error(result.error);
        }

        // Transform the argument as configured.
        this.runTransformer(context.config, result, false);

        if (result.error && !context.config.hidden && !this.suppressArgumentsError) {
            throw new Error(result.error);
        }

        // Assign the parsed value into the resulting object for the commandt to use.
        return result.value;
    }

    // Parses chat commands to make them appear like slash commands.
    public async runChat(params: ChatCommandParameters<Bot>): Promise<boolean> {
        // Parse message according to arguments configuration.
        // This allows chat commands to behave almost exactly like slash commands.
        // However, there are a few limitations:
        // Chat arguments are separated by space, while slash arguments are separated by the client.
        // Chat arguments must be listed sequentially, while slash arguments can be out of order.
        // Named arguments are the exception to the above rule, as they can be given in any order.
        const parsed: Partial<Args> = {};
        const context = {
            i: 0,
            attachmentIndex: 0,
            isNamed: false,
            params,
        } as ChatCommandArgumentParsingContext<Bot>;

        const cmdArgEntries: [string, SingleArgumentConfig][] = Object.entries(this.args);

        const parseNamedArgs = this.shouldParseNamedArgs(params);

        // These sets are not needed if we are not parsing named arguments.
        const requiredArgNames: Set<string> | undefined = parseNamedArgs
            ? new Set(cmdArgEntries.filter(([name, config]) => config.required).map(([name, config]) => name))
            : undefined;
        const argsGivenByName: Set<string> | undefined = parseNamedArgs ? new Set() : undefined;

        // If supported, extract and process all named arguments first.
        if (parseNamedArgs) {
            const { named, unnamed } = params.bot.extractNamedArgs(params.args);

            if (
                params.bot.options.runHelpNamedArg &&
                named.has(params.bot.options.runHelpNamedArg) &&
                params.bot.helpService
            ) {
                // User is asking for help on how to use this command.
                const helpEmbed = await params.bot.helpService.help(params, { query: this.fullName() });
                await params.src.send({ embeds: [helpEmbed] });
                return true;
            }

            for (let [name, value] of named.entries()) {
                name = name.toLocaleLowerCase();
                // @ts-ignore
                const config = this.args[name];
                if (!config) {
                    // Unknown argument name.
                    params.extraArgs[name] = value;
                    continue;
                }
                context.name = name;
                context.config = config;
                context.value = value;
                context.isNamed = true;
                // We need to fake the args array here in case an argument that uses it shows up.
                context.i = 0;
                context.params.args = SplitArgumentArray.Fake(value);

                // @ts-ignore
                parsed[name] = await this.parseCommandArgument(context);

                argsGivenByName!.add(name);
                if (config.required) {
                    requiredArgNames!.delete(name);
                }
            }

            // After all processing is done, overwrite the old args array with the new one that has no named arguments.
            // Clearly unnamed arguments override any named ones.
            context.i = 0;
            context.isNamed = false;
            context.params.args = unnamed;
        }

        // Index of the next command argument in order.
        let cmdArgIndex = 0;

        // Loop through all split arguments, without named arguments.
        for (; context.i < params.args.length && cmdArgIndex < cmdArgEntries.length; ++context.i, ++cmdArgIndex) {
            let nextSplitArg = params.args.get(context.i);

            // The next split arg is assigned to the next command arg.
            let cmdArgEntry = cmdArgEntries[cmdArgIndex];

            // Update the context for the argument parsers.
            // context.name is really of type "keyof T".
            context.name = cmdArgEntry[0];
            context.config = cmdArgEntry[1];
            context.value = nextSplitArg;

            // Only parse if the current argument being read is not named.
            if (!context.config.hidden && !context.config.named) {
                // @ts-ignore
                parsed[context.name] = await this.parseCommandArgument(context);

                if (parseNamedArgs && context.config.required) {
                    requiredArgNames!.delete(context.name);
                }
            }
        }

        // Assure that all required arguments were given and set default values as necessary.

        if (parseNamedArgs) {
            if (requiredArgNames!.size !== 0) {
                // Some required arguments never showed up.
                if (!this.suppressArgumentsError) {
                    throw new Error(
                        `Missing required argument${requiredArgNames!.size !== 1 ? 's' : ''} ${[...requiredArgNames!]
                            .map(name => `\`${name}\``)
                            .join(', ')}.`,
                    );
                }
            } else {
                // There are more arguments that did not appear as unnamed arguments, but they may have appeared as
                // named arguments. If not, assign their default value.
                for (; cmdArgIndex < cmdArgEntries.length; ++cmdArgIndex) {
                    const [cmdArgName, cmdArgConfig] = cmdArgEntries[cmdArgIndex];
                    if (
                        !argsGivenByName!.has(cmdArgName) &&
                        cmdArgConfig.default !== undefined &&
                        cmdArgConfig.default !== null
                    ) {
                        const result: ArgumentParserResult = {};
                        result.value = cmdArgConfig.default;

                        // Transform the argument as configured.
                        this.runTransformer(cmdArgConfig, result, false);

                        if (result.error && !cmdArgConfig.hidden && !this.suppressArgumentsError) {
                            throw new Error(result.error);
                        }
                        // @ts-ignore
                        parsed[cmdArgName] = result.value;
                    }
                }
            }
        } else {
            // There are more arguments that surely did not appear, because the bot does not support named arguments.
            // This loop assures all arguments left are not required and get their default value.
            for (; cmdArgIndex < cmdArgEntries.length; ++cmdArgIndex) {
                const [cmdArgName, cmdArgConfig] = cmdArgEntries[cmdArgIndex];
                if (cmdArgConfig.required) {
                    if (cmdArgConfig.named) {
                        throw new Error(
                            `Missing required named argument \`${cmdArgName}\`, but named argument parsing is turned off! This command is impossible to run.`,
                        );
                    } else {
                        throw new Error(`Missing required argument \`${cmdArgName}\`.`);
                    }
                }

                const result: ArgumentParserResult = {};
                result.value = cmdArgConfig.default;

                // Transform the argument as configured.
                this.runTransformer(cmdArgConfig, result, false);

                if (result.error && !cmdArgConfig.hidden && !this.suppressArgumentsError) {
                    throw new Error(result.error);
                }
                // @ts-ignore
                parsed[cmdArgName] = result.value;
            }
        }

        await this.run(params, parsed as Args);
        return true;
    }
}

/**
 * A command that implements its own parsing within the command itself.
 * Some commands have very complex parsing methods that must be manually specified.
 *
 * Use named arguments on `ComplexCommand`s in place of `LegacyCommand`.
 */
export abstract class LegacyCommand<Bot extends PandaDiscordBot, Args, Shared = never> extends ParameterizedCommand<
    Bot,
    Args,
    Shared
> {
    /**
     * Custom parser for chat commands.
     * @param params Chat command parameters.
     */
    protected abstract parseChatArgs(params: ChatCommandParameters<Bot>): Args;

    public async runChat(params: ChatCommandParameters<Bot>): Promise<boolean> {
        await this.run(params, this.parseChatArgs(params));
        return true;
    }
}

export interface NestedCommand<Bot extends PandaDiscordBot, Shared = never> {
    /**
     * A flag signalling that the command listed on the help page should be flattened down at this level. In other
     * words, all subcommands will not appear as sepearate entries in the list of commands per category.
     *
     * Subcommands can be still searched for on their own in the help command.
     */
    readonly flattenHelpForSubCommands?: boolean;

    /**
     * Creates the object that will be shared with all children of this nested command.
     */
    initializeShared?(): Shared;
}

/**
 * A command that delegates to subcommands.
 * Currently only one level of nesting is supported.
 */
export abstract class NestedCommand<Bot extends PandaDiscordBot, Shared = never> extends BaseChatInputCommand<
    Bot,
    Shared
> {
    public args: never;

    public isParameterized(): false {
        return false;
    }

    public isNested(): true {
        return true;
    }

    /**
     * Configuration array of subcommand types to initialize internally.
     */
    public abstract subcommands: CommandTypeArray<Bot, Shared>;

    /**
     * Map of subcommands by name.
     */
    public readonly subcommandMap: CommandMap<string, Bot, Shared>;

    public argsString(bot: Bot) {
        return `(${[...this.subcommandMap.keys()].join(' | ')})`;
    }

    public initialize() {
        super.initialize();

        // If depth is currently 2, then the next level of commands will be depth 3, which is not supported by Discord.
        if (this.nestedDepth >= 2) {
            this.throwConfigurationError(`Nested commands only support two levels of nesting.`);
        }

        // Some extra validations for the Discord API. We check them here just to provide
        // nicer error messages for invalid commands.
        if (this.subcommands.length === 0) {
            this.throwConfigurationError(`Subcommand array cannot be empty.`);
        }
        if (this.subcommands.length > 25) {
            this.throwConfigurationError(`Command can only have up to 25 subcommands.`);
        }

        // Set up shared data for all subcommands if this is the top level.
        if (!this.parentCommand && this.initializeShared) {
            InternalCommandModifiers.setShared(this, this.initializeShared());
        }

        InternalCommandModifiers.setSubcommandMap(this, new Map());
        for (const cmd of this.subcommands) {
            const instance = new cmd();
            InternalCommandModifiers.setShared(instance, this.shared);
            InternalCommandModifiers.setParent(instance, this);
            InternalCommandModifiers.setNestedDepth(instance, this.nestedDepth + 1);
            instance.initialize();

            this.subcommandMap.set(instance.name, instance);
        }
    }

    public commandData(): ChatInputApplicationCommandData {
        const data = {} as ChatInputApplicationCommandData;

        data.name = this.name;
        data.description = this.description;
        data.defaultMemberPermissions = this.memberPermissions ?? this.permission.memberPermissions ?? null;
        data.dmPermission = this.guildId ? undefined : !!this.enableInDM;
        data.options = [];

        for (const [key, cmd] of [...this.subcommandMap.entries()]) {
            const subData = cmd.commandData();
            // We only support two levels of nesting, so this logic is adequate.
            // If the command is nested, then this level should be the subcommand group.
            // If the command is not nested, then this level should be the subcommand.
            const type = cmd.isNested()
                ? ApplicationCommandOptionType.SubcommandGroup
                : ApplicationCommandOptionType.Subcommand;
            data.options.push({
                name: cmd.name,
                description: cmd.description,
                type,
                options: subData.options?.length !== 0 ? subData.options : [] ?? [],
            } as ApplicationCommandSubGroupData | ApplicationCommandSubCommandData);
        }

        return data;
    }

    public addHelpFields(embed: EmbedBuilder) {
        embed.addFields({
            name: 'Subcommands',
            value: [...this.subcommandMap.keys()].map(key => `\`${key}\``).join(', '),
        });
    }

    // Delegates a chat command to a subcommand.
    public async runChat(params: ChatCommandParameters<Bot>): Promise<boolean> {
        // Check for help named argument first, in case it was specified.
        if (this.shouldParseNamedArgs(params)) {
            const { named } = params.bot.extractNamedArgs(params.args);
            if (
                params.bot.options.runHelpNamedArg &&
                named.has(params.bot.options.runHelpNamedArg) &&
                params.bot.helpService
            ) {
                // User is asking for help on how to use this command.
                const helpEmbed = await params.bot.helpService.help(params, { query: this.fullName() });
                await params.src.send({ embeds: [helpEmbed] });
                return true;
            }
        }

        if (params.args.length === 0) {
            throw new Error(`Missing subcommand for command \`${this.name}\`.`);
        }

        const subName = params.args.shift()!;

        if (this.subcommandMap.has(subName)) {
            const subNameIndex = params.content.indexOf(subName);
            if (subNameIndex === -1) {
                throw new Error(`Could not find subcommand name in content field.`);
            }
            params.content = params.content.substring(subNameIndex).trimStart();

            const subcommand = this.subcommandMap.get(subName)!;
            if (params.bot.validate(params, subcommand)) {
                return await subcommand.executeChat(params);
            }
        } else {
            throw new Error(`Invalid subcommand for command \`${this.name}\`.`);
        }

        return true;
    }

    private getSubcommand(params: SlashCommandParameters<Bot>): string | null {
        switch (params.level) {
            case SlashCommandArgumentLevel.SubcommandGroup:
                // Inside subcommand group, must have a subcommand.
                params.level = SlashCommandArgumentLevel.Subcommand;
                return params.options.getSubcommand(false);
            case SlashCommandArgumentLevel.Subcommand:
                // Inside subcommand, no more nesting!
                return null;
            default:
                // Top level command, could be a group or subcommand.
                const subcommandGroup = params.options.getSubcommandGroup(false);
                if (subcommandGroup) {
                    params.level = SlashCommandArgumentLevel.SubcommandGroup;
                    return subcommandGroup;
                }

                const subcommand = params.options.getSubcommand(false);
                if (subcommand) {
                    params.level = SlashCommandArgumentLevel.Subcommand;
                    return subcommand;
                }
        }
        return null;
    }

    // Delegates a slash command to a subcommand
    public async runSlash(params: SlashCommandParameters<Bot>): Promise<boolean> {
        const subcommandSelected = this.getSubcommand(params);
        if (!subcommandSelected) {
            throw new Error(`Missing subcommand for command \`${this.name}\`.`);
        }

        const subcommand = this.subcommandMap.get(subcommandSelected);
        if (!subcommand) {
            throw new Error(`Invalid subcommand for command \`${this.name}\`.`);
        }

        if (!params.bot.validate(params, subcommand)) {
            return false;
        }

        return await subcommand.executeSlash(params);
    }
}
