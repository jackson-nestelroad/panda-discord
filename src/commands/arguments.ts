import {
    ApplicationCommandOptionAllowedChannelTypes,
    ApplicationCommandOptionChoiceData,
    Attachment,
    CommandInteractionOption,
    GuildBasedChannel,
    GuildMember,
    Role,
    Snowflake,
    User,
} from 'discord.js';

import { PandaDiscordBot } from '../bot';
import { ArgumentSplitter, SplitArgumentArray } from '../util/argument-splitter';
import { Mentionable } from '../util/discord';
import { BaseChatInputCommand } from './chat-input';
import { ChatCommandParameters, CommandParameters } from './params';

/**
 * Argument types supported by the internal parser.
 */
export enum ArgumentType {
    String = 3, // A single string.
    // Chat commands will parse as one string with no spaces.
    // Slash commands will allow spaces.

    Integer = 4, // An integer.

    Boolean = 5, // A boolean value.
    // Slash commands give "True" or "False".
    // Chat commands allow any capitalization of those word.

    User = 6, // A valid member of the current guild.
    // Slash commands will give a mention, which corresponds to a GuildObject.
    // Chat commands will allow a mention, user ID, or username.

    Channel = 7, // A channel in the currnt guild.
    // Slash commands will give a mention, which corresponds to a Channel.
    // Chat commands will allow a mention, channel ID, or channel name.

    Role = 8, // A role in the current guild.
    // Slash commands will give a mention, which corresponds to a Role.
    // Chat commands will allow a mention, role ID, or role name.

    Mentionable = 9, // Any mentionable entity (user or role).
    // Slash commmands will give a mention.
    // Chat commands will allow a mention for any of the options.

    Number = 10, // A floating point number.

    Attachment = 11, // An attachment.

    RestOfContent = 100, // The rest of the content in the message that has not been parsed.
    // Chat commands implement this trivially in parsing.
    // Slash commands implement this as a string, since they can take spaces.

    SplitArguments = 102, // An array of split arguments that have been parsed by ArgumentSplitter.
    // Chat commands implement this by simply passing the rest of the split args array.
    // Slash commands implement this by manually splitting the string given by the user.

    // Unsupported types:
    // SUB_COMMAND
    // SUB_COMMAND_GROUP
    //
    // If you would like to specify a subcommand, use the `NestedCommand` command class.
}

// Conditional type explicitly used for mapping an argument type to its parsed value type.
type ArgumentTypeResultMap<A extends ArgumentType> = A extends ArgumentType.String
    ? string
    : A extends ArgumentType.Integer
      ? number
      : A extends ArgumentType.Boolean
        ? boolean
        : A extends ArgumentType.User
          ? GuildMember
          : A extends ArgumentType.Channel
            ? GuildBasedChannel
            : A extends ArgumentType.Role
              ? Role
              : A extends ArgumentType.Mentionable
                ? Mentionable
                : A extends ArgumentType.RestOfContent
                  ? string
                  : A extends ArgumentType.Number
                    ? number
                    : A extends ArgumentType.Attachment
                      ? Attachment
                      : A extends ArgumentType.SplitArguments
                        ? SplitArgumentArray
                        : never;

// Conditional type explicitly used for mapping an argument type to its native value type, prior to parsing.
//
// In other words, an argument of type A is accepted as a value of type ArgumentTypeNativeMap<A> and parsed into a value
// of type ArgumentTypeResultMap<A>.
type ArgumentTypeNativeMap<A extends ArgumentType> = A extends ArgumentType.String
    ? string
    : A extends ArgumentType.Integer
      ? number
      : A extends ArgumentType.Boolean
        ? boolean
        : A extends ArgumentType.User
          ? GuildMember
          : A extends ArgumentType.Channel
            ? GuildBasedChannel
            : A extends ArgumentType.Role
              ? Role
              : A extends ArgumentType.Mentionable
                ? Mentionable
                : A extends ArgumentType.RestOfContent
                  ? string
                  : A extends ArgumentType.Number
                    ? number
                    : A extends ArgumentType.Attachment
                      ? Attachment
                      : A extends ArgumentType.SplitArguments
                        ? string
                        : never;

// The default value, which is a union of the above types.
type DefaultT = ArgumentTypeResultMap<ArgumentType>;

/**
 * Base parsing context for commands that give their arguments as text.
 */
export interface BaseArgumentParsingContext {
    // The value given by the user.
    value?: string;
    // The name of the argument.
    name: string;
    // The config data set up for the argument in the command.
    config: SingleArgumentConfig;
}

/**
 * Parsing context for a chat command argument.
 */
export interface ChatCommandArgumentParsingContext<Bot extends PandaDiscordBot> extends BaseArgumentParsingContext {
    // If the argument is given as a named argument.
    isNamed: boolean;
    // The current index in the params.args array.
    i: number;
    // The current index in the params.src.attachments collection.
    attachmentIndex: number;
    // Parameters for the chat command.
    params: ChatCommandParameters<Bot>;
}

/**
 * Parsing context for parsing a string into an argument.
 */
export interface StringArgumentParsingContext<Bot extends PandaDiscordBot> extends BaseArgumentParsingContext {
    // Parameters that should always be available.
    params: CommandParameters<Bot>;
}

/**
 * Result from an argument parser.
 */
export interface ArgumentParserResult<T = DefaultT> {
    // The parsed value to use as the argument.
    value?: T;
    // Any error that occurred in parsing.
    // Empty for no error.
    error?: string;
}

interface SlashArgumentParsers<A extends ArgumentType = ArgumentType> {
    slash: (option: CommandInteractionOption, out: ArgumentParserResult<ArgumentTypeResultMap<A>>) => void;
}

interface ChatArgumentParsers<Bot extends PandaDiscordBot = PandaDiscordBot, A extends ArgumentType = ArgumentType> {
    string: (
        context: StringArgumentParsingContext<Bot>,
        out: ArgumentParserResult<ArgumentTypeResultMap<A>>,
    ) => void | Promise<void>;
    chat?: (
        context: ChatCommandArgumentParsingContext<Bot>,
        out: ArgumentParserResult<ArgumentTypeResultMap<A>>,
    ) => void | Promise<void>;
}

type ArgumentParsers<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    A extends ArgumentType = ArgumentType,
> = SlashArgumentParsers<A> & ChatArgumentParsers<Bot, A>;

export interface ArgumentTypeMetadata<Bot extends PandaDiscordBot, A extends ArgumentType = ArgumentType> {
    readsFromArgs?: boolean;
    parsers: ArgumentParsers<Bot, A>;
}

/**
 * Config data for each ArgumentType.
 * Specifically used for parsing arguments of each type.
 */
export const ArgumentTypeConfig: { [type in ArgumentType]: ArgumentTypeMetadata<PandaDiscordBot, type> } = {
    [ArgumentType.String]: {
        parsers: {
            string: (context, out) => {
                if (context.config.choices) {
                    out.value = context.config.choices.find(
                        choice => choice.name.localeCompare(context.value!, undefined, { sensitivity: 'accent' }) === 0,
                    )?.value as string;
                    if (out.value === undefined || out.value === null) {
                        out.error = `Invalid value \`${context.value}\` for argument \`${context.name}\`.`;
                    }
                } else {
                    out.value = context.value;
                }
            },
            slash: (option, out) => {
                out.value = option.value?.toString();
            },
        },
    },
    [ArgumentType.Integer]: {
        parsers: {
            string: (context, out) => {
                if (context.config.choices) {
                    out.value = context.config.choices.find(
                        choice => choice.name.localeCompare(context.value!, undefined, { sensitivity: 'accent' }) === 0,
                    )?.value as number;
                    if (out.value === undefined || out.value === null) {
                        out.error = `Invalid value \`${context.value}\` for argument \`${context.name}\`.`;
                    }
                } else {
                    out.value = parseInt(context.value!);
                    if (isNaN(out.value)) {
                        out.error = `Invalid integer value \`${context.value}\` for argument \`${context.name}\`.`;
                    }
                }
            },
            slash: (option, out) => {
                out.value = option.value as number;
            },
        },
    },
    [ArgumentType.Boolean]: {
        parsers: {
            string: (context, out) => {
                if ('true'.localeCompare(context.value!, undefined, { sensitivity: 'accent' }) === 0) {
                    out.value = true;
                } else if ('false'.localeCompare(context.value!, undefined, { sensitivity: 'accent' }) === 0) {
                    out.value = false;
                } else {
                    out.error = `Invalid boolean value \`${context.value}\` for argument \`${context.name}\`.`;
                }
            },
            slash: (option, out) => {
                out.value = option.value as boolean;
            },
        },
    },
    [ArgumentType.User]: {
        parsers: {
            string: async (context, out) => {
                if (!context.params.guildId) {
                    out.error = 'Cannot lookup guild member outside of guild.';
                    return;
                }
                out.value =
                    (await context.params.bot.getMemberFromString(context.value!, context.params.guildId)) ?? undefined;
                if (!out.value) {
                    out.error = `Invalid guild member \`${context.value}\` for argument \`${context.name}\`.`;
                }
            },
            slash: (option, out) => {
                out.value = option.member as GuildMember;
            },
        },
    },
    [ArgumentType.Channel]: {
        parsers: {
            string: (context, out) => {
                if (!context.params.guildId) {
                    out.error = 'Cannot lookup channel outside of guild.';
                    return;
                }
                const channel = context.params.bot.getChannelFromString(context.value!, context.params.guildId);
                if (!channel || channel.isDMBased()) {
                    out.error = `Invalid channel \`${context.value}\` for argument \`${context.name}\`.`;
                }
                out.value = channel as GuildBasedChannel;
            },
            slash: (option, out) => {
                out.value = option.channel as GuildBasedChannel;
            },
        },
    },
    [ArgumentType.Role]: {
        parsers: {
            string: (context, out) => {
                if (!context.params.guildId) {
                    out.error = 'Cannot lookup role outside of guild.';
                    return;
                }
                out.value = context.params.bot.getRoleFromString(context.value!, context.params.guildId) ?? undefined;
                if (!out.value) {
                    out.error = `Invalid role \`${context.value}\` for argument \`${context.name}\`.`;
                }
            },
            slash: (option, out) => {
                out.value = option.role as Role;
            },
        },
    },
    [ArgumentType.Mentionable]: {
        parsers: {
            string: (context, out) => {
                if (!context.params.guildId) {
                    out.error = 'Cannot lookup mentionable outside of guild.';
                    return;
                }
                out.value = context.params.bot.getAmbiguousMention(context.value!, context.params.guildId) ?? undefined;
                if (!out.value) {
                    out.error = `Invalid mention \`${context.value}\` for argument \`${context.name}\`.`;
                }
            },
            slash: (option, out) => {
                out.value = (option?.member as GuildMember) ?? (option?.user as User) ?? (option?.role as Role) ?? null;
                if (!out.value) {
                    out.error = `Invalid mention for argument \`${option.name}\`.`;
                }
            },
        },
    },
    [ArgumentType.Number]: {
        parsers: {
            string: (context, out) => {
                if (context.config.choices) {
                    out.value = context.config.choices.find(
                        choice => choice.name.localeCompare(context.value!, undefined, { sensitivity: 'accent' }) === 0,
                    )?.value as number;
                    if (out.value === undefined || out.value === null) {
                        out.error = `Invalid value \`${context.value}\` for argument \`${context.name}\`.`;
                    }
                } else {
                    out.value = parseFloat(context.value!);
                    if (isNaN(out.value)) {
                        out.error = `Invalid number value \`${context.value}\` for argument \`${context.name}\`.`;
                    }
                }
            },
            slash: (option, out) => {
                out.value = option.value as number;
            },
        },
    },
    [ArgumentType.Attachment]: {
        readsFromArgs: false,
        parsers: {
            string: (context, out) => {
                out.error = `Cannot parse attachment from string.`;
            },
            chat: (context, out) => {
                if (!context.params.src.isMessage()) {
                    return;
                }
                if (context.value && context.params.src.message.attachments.has(context.value)) {
                    out.value = context.params.src.message.attachments.get(context.value);
                } else {
                    const nextAttachment = context.params.src.message.attachments.at(context.attachmentIndex++);
                    if (!nextAttachment) {
                        out.error = `Missing attachment for argument \`${context.name}\`.`;
                    }
                    out.value = nextAttachment;
                }
            },
            slash: (option, out) => {
                out.value = option.attachment;
            },
        },
    },
    [ArgumentType.RestOfContent]: {
        parsers: {
            string: (context, out) => {
                ArgumentTypeConfig[ArgumentType.String].parsers.string(context, out);
            },
            chat: (context, out) => {
                context.value = context.params.args.restore(context.i);
                context.i = context.params.args.length;
                ArgumentTypeConfig[ArgumentType.String].parsers.string(context, out);
            },
            slash: (option, out) => {
                out.value = option.value as string;
            },
        },
    },
    [ArgumentType.SplitArguments]: {
        parsers: {
            string: (context, out) => {
                out.value = context.params.bot.splitIntoArgs(context.value!);
            },
            chat: (context, out) => {
                out.value = context.params.args.slice(context.i);
                context.i = context.params.args.length;
            },
            slash: (option, out) => {
                try {
                    out.value = new ArgumentSplitter().split(option.value as string);
                } catch (error) {
                    out.error = error.toString();
                }
            },
        },
    },
} as const;

// A transformer takes a parsed argument and converts it to a different value and possibly type.
export type SingleArgumentTransformer<T = DefaultT, P = unknown> = (value: T, result: ArgumentParserResult<P>) => void;

/**
 * Option returned from an argument's autocomplete function.
 */
export type ArgumentAutocompleteOption = ApplicationCommandOptionChoiceData<string | number>;

/**
 * Context for an argument autocomplete function.
 */
export interface ArgumentAutocompleteContext<Bot extends PandaDiscordBot = PandaDiscordBot, Shared = any> {
    value: string;
    bot: PandaDiscordBot;
    guildId: Snowflake | null;
    command: BaseChatInputCommand<Bot, Shared>;
}

/**
 * The type of an argument autocomplete function.
 */
export type ArgumentAutocompleteFunction = (context: ArgumentAutocompleteContext) => ArgumentAutocompleteOption[];

// Types where transformers are completely optional.
interface SingleArgumentTransformersOptionalConfig<T = DefaultT, P = T> {
    any?: SingleArgumentTransformer<T, P>;
    chat?: SingleArgumentTransformer<T, P>;
    slash?: SingleArgumentTransformer<T, P>;
}

// Types where transformers, at least one for each type, is required.
type SingleArgumentTransformersRequiredConfig<T = DefaultT, P = unknown> =
    | {
          any: SingleArgumentTransformer<T, P>;
      }
    | {
          chat: SingleArgumentTransformer<T, P>;
          slash: SingleArgumentTransformer<T, P>;
      };

// Parts of the argument config that depend on types.
type SingleTypedSingleArgumentConfig<A extends ArgumentType = ArgumentType, P = unknown> = {
    type: A;
    default?: ArgumentTypeResultMap<A>;
    choices?: ArgumentTypeResultMap<A> extends string | number ? ApplicationCommandOptionChoiceData[] : never;
    channelTypes?: ArgumentTypeResultMap<A> extends GuildBasedChannel
        ? ApplicationCommandOptionAllowedChannelTypes[]
        : never;
    autocomplete?: ArgumentTypeNativeMap<A> extends string | number ? ArgumentAutocompleteFunction : never;
} & (ArgumentTypeResultMap<A> extends P
    ? {
          // If we can assign the type we parse to P, then transformers are optional.
          transformers?: SingleArgumentTransformersOptionalConfig<ArgumentTypeResultMap<A>, P>;
      }
    : {
          // If not, then the user must define at least one transformer to make the conversion possible
          transformers: SingleArgumentTransformersRequiredConfig<ArgumentTypeResultMap<A>, P>;
      });

// Explicitly list out every option for strong typing.
type TypedSingleArgumentConfig<P = unknown> =
    | SingleTypedSingleArgumentConfig<ArgumentType.String, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.Integer, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.Boolean, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.User, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.Channel, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.Role, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.Mentionable, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.RestOfContent, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.Number, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.Attachment, P>
    | SingleTypedSingleArgumentConfig<ArgumentType.SplitArguments, P>;

// Parts of the argument config that do not depend on types.
interface UntypedSingleArgumentConfig {
    description: string;
    required: boolean;
    named?: boolean;
    hidden?: boolean;
}

/**
 * Configuration for a single argument.
 * This is slightly different than what Discord offers since we handle subcommands differently.
 */
export type SingleArgumentConfig<P = unknown> = UntypedSingleArgumentConfig & TypedSingleArgumentConfig<P>;

/**
 * Object for configuring arguments accepted and used by the command.
 */
export type ArgumentsConfig<Args> = { readonly [arg in keyof Args]-?: SingleArgumentConfig<Args[arg]> };

/**
 * Object for arguments that can be parsed into its respective Args object.
 *
 * This object works as if running a chat command, but each argument is already isolated by name. This object can be
 * used to run a command when user input values are accepted from multiple locations, such as a context menu command.
 */
export type ParseableArguments<Args> = { [arg in keyof Args]?: string };
