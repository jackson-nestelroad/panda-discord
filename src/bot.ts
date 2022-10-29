import {
    ActivityType,
    ApplicationCommandManager,
    Awaitable,
    Channel,
    Client,
    ClientOptions,
    EmbedBuilder,
    GatewayIntentBits,
    GuildApplicationCommandManager,
    GuildMember,
    Interaction,
    Role,
    Snowflake,
    User,
} from 'discord.js';

import { ArgumentType, SingleArgumentConfig } from './commands/arguments';
import { BaseCommand } from './commands/base';
import { CommandSource } from './commands/command-source';
import { CommandConfig, CommandMap, CommandTypeArray } from './commands/config';
import { HelpCommand } from './commands/defaults/help';
import { PingCommand } from './commands/defaults/ping';
import { CommandParameters } from './commands/params';
import { CommandPermissionOptions } from './commands/permission';
import { EmbedOptions, EmbedProps, EmbedTemplates } from './embeds/options';
import { BaseEvent } from './events/base';
import { EventConfig, EventMap, EventTypeArray } from './events/config';
import { DefaultAutocompleteEvent } from './events/defaults/autocomplete';
import { DefaultInteractionCreateEvent } from './events/defaults/interaction-create';
import { DefaultMessageCreateEvent } from './events/defaults/message-create';
import { DefaultReadyEvent } from './events/defaults/ready';
import { BaseHelpService } from './services/help';
import { MemberListService } from './services/member-list';
import { TimeoutService } from './services/timeout';
import { ArgumentSplitter, SplitArgumentArray } from './util/argument-splitter';
import { DiscordUtil, Mentionable } from './util/discord';
import {
    ExtractedArgs,
    NamedArgumentPattern,
    extractNamedArgs,
    validateNamedArgsPattern,
} from './util/named-arguments';
import { ExpireAgeConversion, TimedCache } from './util/timed-cache';

/**
 * Option for using named arguments on the bot.
 */
export enum NamedArgsOption {
    /**
     * Never use named arguments, disabling them completely.
     */
    Never,
    /**
     * Only parse named arguments if the current command uses them.
     */
    IfNeeded,
    /**
     * Always parse named arguments, regardless of if they are used or not.
     */
    Always,
}

/**
 * Option for the type of commands for the bot to use.
 */
export enum EnabledCommandType {
    /**
     * Chat (message) commands.
     */
    Chat = 1 << 0,
    /**
     * Slash commands.
     */
    Slash = 1 << 1,
}

/**
 * Options for setting up the underlying PandaDiscordBot instance.
 */
export interface PandaOptions {
    /**
     * Options that are passed to the Discord.JS client.
     *
     * If anything, the WebSocket intents are required for setting up which events the bot should receive.
     */
    client: ClientOptions;

    /**
     * Array of command classes that are created to handle commands.
     */
    commands?: CommandTypeArray;

    /**
     * Array of event classes that are used to handle Discord events.
     *
     * Do not put an "interactionCreate" handler in this array. Instead, use the `interactionEvent` option, because the
     * interaction event is typically set up after slash commands are created, which occurs after the ready event fires.
     */
    events?: EventTypeArray;

    /**
     * The class that is set up to handle "interactionCreate" events, which is typically used for slash commands.
     *
     * Must be specified separately so that the event can only be attached after all of the necessary slash commands are
     * created.
     */
    interactionEvent?: new (bot: PandaDiscordBot) => BaseEvent<'interactionCreate'>;

    /**
     * Number of cooldown offenses a user has to make before going on timeout.
     *
     * A cooldown offense occurs when a user attempts to use a command in its cooldown period. The user is timed out,
     * which means the bot ignores all messages and interactions from them.
     */
    cooldownOffensesForTimeout?: number;

    /**
     * The user ID of the bot owner. Used for the "Owner" command permission.
     */
    owner?: Snowflake;

    /**
     * Specifies how the bot should handle arguments in the form `--arg=value`.
     */
    namedArgs?: NamedArgsOption;

    /**
     * The type of commands the bot should serve.
     */
    commandType?: EnabledCommandType;

    /**
     * Specifies if the bot should run the help command when the given named argument is given.
     *
     * Note that this option only works for commands that parse named arguments.
     */
    runHelpNamedArg?: string;
}

type CompletePandaOptions = { [option in keyof PandaOptions]-?: PandaOptions[option] };

const defaultOptions: CompletePandaOptions = {
    client: {
        intents: [GatewayIntentBits.Guilds],
    },
    commands: [HelpCommand, PingCommand],
    events: [DefaultMessageCreateEvent, DefaultReadyEvent, DefaultAutocompleteEvent],
    interactionEvent: DefaultInteractionCreateEvent,
    cooldownOffensesForTimeout: 5,
    owner: null,
    namedArgs: NamedArgsOption.Always,
    commandType: EnabledCommandType.Slash,
    runHelpNamedArg: 'help',
};

/**
 * Discord bot that uses the Panda command framework.
 */
export abstract class PandaDiscordBot {
    /**
     * Color to appear in normal embeds.
     */
    public abstract readonly color: `#${string}`;

    /**
     * All command categories for the bot.
     */
    public abstract readonly commandCategories: string[];

    /**
     * All command permissions for the bot.
     */
    public abstract commandPermissions: CommandPermissionOptions<this>[];

    /**
     * Pattern for detecting and parsing named arguments.
     *
     * For example, `namedArgsPattern = { prefix: '--', separator: '=' };` allows the following:
     *
     *      `>purge @user 50 #general`
     *
     *      `>purge @user --channel=#general`
     *
     *      `>purge @user --count=50`
     *
     *      `>purge @user --count=50 --channel=#general`
     */
    public readonly namedArgsPattern: Readonly<NamedArgumentPattern> = {
        prefix: '--',
        separator: '=',
        stopOnPrefixOnly: true,
    };

    /**
     * The options set on the bot when first created.
     */
    public readonly options: CompletePandaOptions = {} as CompletePandaOptions;

    /**
     * When the bot started.
     */
    public readonly startedAt: Date = new Date();

    /**
     * The Discord.JS client for the bot. Undefined state until the ready event has fired.
     */
    public readonly client: Client;

    /**
     * Maps a command name to the command instance that should handle it.
     */
    public commands: CommandMap<string>;

    /**
     * Maps an event name to the event instance that should handle it.
     */
    public events: EventMap;

    /**
     * Service that provides help about the bot and its commands.
     *
     * Define this property on your bot class to use it for internal methods.
     */
    public helpService?: BaseHelpService;

    /**
     * Service that fetches and caches entire member lists for guilds.
     *
     * Define this property on your bot class to use it for internal methods.
     */
    public memberListService?: MemberListService;

    /**
     * Service that times users out if they repeatedly violate command timeouts.
     *
     * Define this property on your bot class to use it for internal methods.
     */
    public timeoutService?: TimeoutService;

    protected running: boolean = false;

    private slashCommandsEnabled: boolean = false;

    public constructor(options: Partial<PandaOptions> = {}) {
        this.mergeOptionsIn(options);
        this.client = new Client(this.options.client);
    }

    private mergeOptionsIn(options: Partial<PandaOptions>) {
        for (const key in defaultOptions) {
            this.options[key] = options[key] ?? defaultOptions[key];
        }
    }

    private validateInternalAttributes() {
        if (this.namedArgsPattern) {
            validateNamedArgsPattern(this.namedArgsPattern);
        }
    }

    private async internalInitialize(): Promise<void> {
        this.refreshCommands();
        this.refreshEvents();
        await this.refreshServices();
    }

    /**
     * The bot's username, as it is currently cached on the Discord client object.
     */
    public get name(): string {
        return this.client.user?.username;
    }

    /**
     * The bot's avatar URL, as it is currently cached on the Discord client object.
     */
    public get avatarUrl(): string {
        return this.client.user?.avatarURL();
    }

    /**
     * Sets the help presence on the bot.
     */
    public setHelpPresence(): void {
        const helpPrefix = (this.options.commandType & EnabledCommandType.Chat) !== 0 ? `@${this.name} ` : '/';
        this.client.user.setActivity(`${helpPrefix}help`, {
            type: ActivityType.Playing,
        });
    }

    /**
     * Refresh the command map by recreating every command.
     * All data inside of each command will be reset.
     */
    public refreshCommands() {
        this.commands = CommandConfig.build(this.options.commands);
    }

    /**
     * Refresh the events by recreating every event.
     * All data inside of each event will be reset.
     */
    protected refreshEvents() {
        this.events = EventConfig.build(this.options.events, this);
    }

    /** Refresh the services owned by the bot framework.
     *
     * This does not automatically refresh services added by overriding classes.
     * Override this method as needed.
     */
    protected async refreshServices(): Promise<void> {
        await this.helpService?.refresh();
    }

    /**
     * Get the proper command manager this command would belong to.
     * @param cmd Command to search for.
     * @returns Command manager the command should belong to.
     */
    protected async getCommandManager(
        cmd: BaseCommand,
    ): Promise<GuildApplicationCommandManager | ApplicationCommandManager> {
        if (cmd.slashGuildId) {
            const cmdGuild = this.client.guilds.cache.get(cmd.slashGuildId);
            if (cmdGuild.commands.cache.size === 0) {
                await cmdGuild.commands.fetch();
            }
            return cmdGuild.commands;
        } else {
            return this.client.application.commands;
        }
    }

    /**
     * Creates all necessary slash commands from the internal command map.
     */
    protected async createSlashCommands() {
        // Store all global commands in the cache.
        await this.client.application.commands.fetch();

        // Look through all of the commands that currently exist as slash commands and delete ones that have been
        // removed from the bot.
        for (const [_, commandData] of this.client.application.commands.cache) {
            // This command has been removed altogether, or it has been moved to a guild.
            const cmd = this.commands.get(commandData.name);
            if (!cmd || !cmd.isSlashCommand || cmd.slashGuildId) {
                await this.client.application.commands.delete(commandData);
            }
        }

        // We do not currently support deleting commands that previously existed on a guild (using `slashGuildId`) but
        // have been moved to global.
        // If you run into this situation, it is best to first run the bot with the command completely removed, then run
        // it with the command added with the `slashGuildId` property enabled.

        // Go through every internal command and possibly update its slash command.
        for (const [name, cmd] of this.commands) {
            if (cmd.isSlashCommand) {
                const newData = cmd.commandData();
                const cmdManager = await this.getCommandManager(cmd);

                // Check if command already exists.
                // If so, check if it has been updated in any way.
                const old = cmdManager.cache.find(cmd => cmd.name === name);
                if (old) {
                    if (DiscordUtil.slashCommandNeedsUpdate(old, newData)) {
                        console.log(`Editing /${name}`);
                        await cmdManager.edit(old, newData);
                    }
                } else {
                    console.log(`Creating /${name}`);
                    await cmdManager.create(newData);
                }
            } else {
                // Remove command if it exists when it should not.
                const cmdManager = await this.getCommandManager(cmd);
                const old = cmdManager.cache.find(cmd => cmd.name === name);
                if (old) {
                    console.log(`Deleting /${name}`);
                    await cmdManager.delete(old);
                }
            }
        }
    }

    /**
     * Creates and updates slash commands stored in the command map, then enabled the bot to receive slash commands.
     */
    public async createAndEnableSlashCommands() {
        if (!this.slashCommandsEnabled) {
            await this.createSlashCommands();
            console.log('Slash commands ready');
            const interactionEvent = new this.options.interactionEvent(this);
            this.events.set(interactionEvent.name, interactionEvent);
            this.slashCommandsEnabled = true;
        }
    }

    /**
     * Deletes all slash commands.
     *
     * This can be an expensive operation depending on the number of guilds.
     */
    public async deleteAllSlashCommands() {
        await this.client.application.commands.set([]);
        for (const [_, guild] of this.client.guilds.cache) {
            await guild.commands.fetch();
            if (guild.commands.cache.size !== 0) {
                await guild.commands.set([]);
            }
        }
    }

    /**
     * Creates an embed using a template or options object.
     * @param options Options for the embed.
     * @returns New message embed instance.
     */
    public createEmbed(options: EmbedProps | EmbedOptions = new EmbedOptions()): EmbedBuilder {
        if (!(options instanceof EmbedOptions)) {
            options = new EmbedOptions(options);
        }
        return (options as EmbedOptions).create(this);
    }

    /**
     * Creates a common embed for formatting errors for the user.
     * @param error Error object, such as `Error` or string.
     * @returns Formatted embed.
     */
    private createErrorEmbed(error: any): EmbedBuilder {
        const embed = this.createEmbed(EmbedTemplates.Error);
        embed.setDescription(error.message || error.toString());
        return embed;
    }

    /**
     * Formats an error and sends it back to the command source.
     * @param src Source of the error to respond to.
     * @param error Error object or message.
     */
    public async sendError(src: CommandSource, error: any) {
        await src.send({ embeds: [this.createErrorEmbed(error)], ephemeral: true });
    }

    /**
     * Runs the given function, funneling any thrown errors to the given interaction in the same way as `sendError`.
     *
     * If no error occurs, the interaction is not replied to.
     *
     * Useful for commands that move from a command source to another interaction type, such as a modal submit, for
     * responding to the user.
     * @param interaction Next interaction to repy to.
     * @param method Function to run that may throw errors.
     * @returns `true` if no errors thrown, `false` if errors were thrown.
     */
    public async sendErrorsToInteraction(interaction: Interaction, method: () => Promise<void>): Promise<boolean> {
        if (!interaction.isRepliable()) {
            throw new Error('Cannot send errors to non-repliable interaction.');
        }
        try {
            await method();
        } catch (error) {
            const embed = this.createErrorEmbed(error);
            if (interaction.replied) {
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            return false;
        }

        return true;
    }

    /**
     * Splits a string into arguments to be consumed by a command.
     *
     * By default, strings are split by spaces. However, quotes or backticks can be used to keep multiple words
     * together.
     * Quotes and backticks can also be escaped using backslashes (`\`).
     * @param str String to split.
     * @returns Array of arguments.
     */
    public splitIntoArgs(str: string): SplitArgumentArray {
        const splitter = new ArgumentSplitter();
        return splitter.split(str);
    }

    /**
     * Extracts named arguments to be processed separately.
     * @param args Split arguments array.
     * @param pattern Pattern to detect named arguments by. Defaults to the pattern set on the bot.
     * @returns An array of named arguments and the leftover unnamed arguments.
     */
    public extractNamedArgs(
        args: SplitArgumentArray,
        pattern: NamedArgumentPattern = this.namedArgsPattern,
    ): ExtractedArgs {
        if (!pattern) {
            throw new Error(`Named argument pattern required for extraction.`);
        }

        return extractNamedArgs(args, pattern);
    }

    /**
     * Converts a single argument configuration into its stringified form.
     * @param name Name of the argument.
     * @param config Configuration for the argument.
     * @returns String form of the argument.
     */
    public argString(name: string, config: SingleArgumentConfig): string {
        let str: string = config.named
            ? `${this.namedArgsPattern.prefix}${name}${
                  config.type === ArgumentType.Boolean ? '' : `${this.namedArgsPattern.separator}...`
              }`
            : name;
        return config.required ? str : `(${str})`;
    }

    /**
     * Parses a User instance from the mention string.
     * @param mention Mention string.
     * @returns User who was mentioned.
     */
    public getUserFromMention(mention: string): User | null {
        const match = DiscordUtil.userMentionRegex.exec(mention);
        if (match) {
            return this.client.users.cache.get(match[1] as Snowflake) || null;
        }
        return null;
    }

    /**
     * Parses a Channel instance from the mention string.
     * @param mention Mention string.
     * @returns Channel that was mentioned.
     */
    public getChannelFromMention(mention: string): Channel | null {
        const match = DiscordUtil.channelMentionRegex.exec(mention);
        if (match) {
            return this.client.channels.cache.get(match[1] as Snowflake) || null;
        }
        return null;
    }

    /**
     * Parses a Role instance from the mention string.
     *
     * Guild context is required for fetching roles.
     * @param mention Mention string.
     * @param guildId Guild context.
     * @returns Role that was mentioned.
     */
    public getRoleFromMention(mention: string, guildId: Snowflake): Role | null {
        const match = DiscordUtil.roleMentionRegex.exec(mention);
        if (match) {
            return this.client.guilds.cache.get(guildId).roles.cache.get(match[1] as Snowflake) || null;
        }
        return null;
    }

    /**
     * Parses an ambiguous mention from a mention string.
     *
     * Guild context is required for members and roles.
     * @param mention Mention string.
     * @param guildId Guild context.
     * @returns Member or role that was mentioned.
     */
    public getAmbiguousMention(mention: string, guildId: Snowflake): Mentionable | null {
        const match = DiscordUtil.ambiguousMentionRegex.exec(mention);
        if (!match) {
            return null;
        }
        if (match[1] === '@&') {
            return this.client.guilds.cache.get(guildId).roles.cache.get(match[2] as Snowflake) || null;
        }
        return this.client.guilds.cache.get(guildId).members.cache.get(match[2] as Snowflake) || null;
    }

    /**
     * Parses a GuildMember instance from the input string.
     * First checks if the string is a mention, then checks if the string is a user ID, then checks if the string is a
     * username.
     *
     * Uses MemberListService if enabled on the bot. If not, uses guild cache.
     * @param str Input string.
     * @param guildId Guild ID context.
     * @returns GuildMember instance if found, null if not found.
     */
    public async getMemberFromString(str: string, guildId: Snowflake): Promise<GuildMember | null> {
        // Try mention first.
        const guild = this.client.guilds.cache.get(guildId);
        const match = DiscordUtil.userMentionRegex.exec(str);
        if (match) {
            return guild.members.cache.get(match[1] as Snowflake) || null;
        }

        const members = this.memberListService
            ? await this.memberListService.getMemberListForGuild(guildId)
            : guild.members.cache;

        // Try user ID then username.
        const memberById = members.get(str as Snowflake);
        if (memberById) {
            return memberById;
        }
        return (
            members.find(
                member => member.user.username.localeCompare(str, undefined, { sensitivity: 'accent' }) === 0,
            ) || null
        );
    }

    /**
     * Parses a guild channel instance from the input string.
     * First checks if the string is a mention, then checks if the string is a channel ID, then checks if the string is
     * a channel name.
     * @param str Input string.
     * @param guildId Guild ID context.
     * @returns GuildBasedChannel instance if found, null if not found.
     */
    public getChannelFromString(str: string, guildId: Snowflake): Channel | null {
        // Try mention first.
        const guild = this.client.guilds.cache.get(guildId);
        const match = DiscordUtil.channelMentionRegex.exec(str);
        if (match) {
            return guild.channels.cache.get(match[1] as Snowflake) || null;
        }

        // Try channel ID then name.
        if (guild.channels.cache.has(str as Snowflake)) {
            return guild.channels.cache.get(str as Snowflake);
        }
        return (
            guild.channels.cache.find(
                channel => channel.name.localeCompare(str, undefined, { sensitivity: 'accent' }) === 0,
            ) || null
        );
    }

    /**
     * Parses a TextBasedChannel instance from the input string.
     * First checks if the string is a mention, then checks if the string is a role ID, then checks if the string is a
     * role name.
     * @param str Input string.
     * @param guildId Guild ID context.
     * @returns Role instance if found, null if not found.
     */
    public getRoleFromString(str: string, guildId: Snowflake): Role | null {
        // Try mention first.
        const guild = this.client.guilds.cache.get(guildId);
        const match = DiscordUtil.roleMentionRegex.exec(str);
        if (match) {
            return guild.roles.cache.get(match[1] as Snowflake) || null;
        }

        // Try role ID then name.
        if (guild.roles.cache.has(str as Snowflake)) {
            return guild.roles.cache.get(str as Snowflake);
        }
        return (
            guild.roles.cache.find(role => role.name.localeCompare(str, undefined, { sensitivity: 'accent' }) === 0) ||
            null
        );
    }

    /**
     * Returns the command instance, if it exists, by the full name.
     *
     * A command's full name is a path from the top-level command to the lowest subcommand, with each name separated by
     * a single space.
     * @param fullName Full command name, each name separated by a space.
     * @returns Command instance.
     */
    public getCommandFromFullName(fullName: string): BaseCommand {
        const names = fullName.split(' ');
        let cmd = this.commands.get(names[0]);
        let i = 1;
        while (cmd && cmd.isNested && i < names.length) {
            cmd = cmd.subcommandMap.get(names[i++]);
        }
        return cmd;
    }

    /**
     * Returns the command instance, if it exists, by an interaction with the bot.
     * @param interaction Application command.
     * @returns Command instance.
     */
    public getCommandFromInteraction(interaction: Interaction): BaseCommand {
        if (!(interaction.isChatInputCommand() || interaction.isAutocomplete())) {
            throw new Error(`Cannot retrieve command instance from non-command interaction.`);
        }

        let cmd = this.commands.get(interaction.commandName);
        const subcommandGroup = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand(false);
        if (subcommandGroup) {
            if (!cmd.subcommandMap.has(subcommandGroup)) {
                throw new Error(`Invalid subcommand group for command ${cmd.name}.`);
            }
            cmd = cmd.subcommandMap.get(subcommandGroup);
        }
        if (subcommand) {
            if (!cmd.subcommandMap.has(subcommand)) {
                throw new Error(
                    `Invalid subcommand for command ${cmd.name} (interaction command = ${interaction.commandName}).`,
                );
            }
            cmd = cmd.subcommandMap.get(subcommand);
        }
        return cmd;
    }

    /**
     * Asynchronously wait for the given number of milliseconds.
     * @param ms Number of milliseconds to wait.
     * @returns Promise that resolves when time is up.
     */
    public async wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Checks if the given command meets the given permission.
     * @param params Command parameters.
     * @param permission Permission.
     * @returns Meets permission?
     */
    public meetsPermission<Bot extends PandaDiscordBot>(
        params: CommandParameters<Bot>,
        permission: CommandPermissionOptions,
    ): boolean {
        if (permission.validate) {
            return permission.validate(params);
        }
        if (permission.memberPermissions !== null && permission.memberPermissions !== undefined) {
            return params.src.member.permissions.has(permission.memberPermissions, true);
        }
        return true;
    }

    /**
     * Validates if the given command and parameters should run.
     * @param params Command parameters.
     * @param command Command attempting to run.
     * @returns If the command should run.
     * True to run, false to not run.
     */
    public validate(params: CommandParameters<this>, command: BaseCommand): boolean {
        const permission = command.permission;
        if (permission.validate) {
            return permission.validate(params);
        }
        if (command.memberPermissions) {
            return params.src.member.permissions.has(command.memberPermissions, true);
        }
        if (permission.memberPermissions !== null && permission.memberPermissions !== undefined) {
            return params.src.member.permissions.has(permission.memberPermissions, true);
        }
        return true;
    }

    /**
     * Handles a cooldown for the given command source in the given cooldown set.
     * This method is used by all commands to properly store and enforce cooldowns.
     * @param src Source of the command.
     * @param cooldownSet Cooldown set to store and enforce.
     * @returns Promise for a boolean, which indicates if the command should proceed or not.
     * True means the command should execute, false means the command should not.
     */
    public async handleCooldown(src: CommandSource, cooldownSet: TimedCache<Snowflake, number>): Promise<boolean> {
        if (cooldownSet) {
            const author = src.author;
            const id = author.id;
            const entry = cooldownSet.getEntry(id);
            if (entry === undefined) {
                cooldownSet.set(id, 0);
            } else {
                const { expireAt, data: offenses } = entry;
                if (this.timeoutService && offenses >= this.options.cooldownOffensesForTimeout) {
                    await this.timeoutService.timeout(author);
                } else {
                    if (offenses === 0) {
                        cooldownSet.update(id, 1);
                    } else {
                        cooldownSet.update(id, offenses + 1);
                    }

                    if (offenses === 0 || src.isInteraction()) {
                        const slowDownMessage =
                            cooldownSet.expireAge > 60000
                                ? `This command can only be run once every ${ExpireAgeConversion.toString(
                                      cooldownSet.expireAge,
                                  )}.`
                                : 'Slow down!';

                        const reply = await src.reply({
                            content: `Slow down! You are on cooldown for another ${ExpireAgeConversion.toString(
                                expireAt - Date.now(),
                                false,
                            )}.`,
                            ephemeral: true,
                        });
                        if (reply.isMessage()) {
                            await this.wait(10000);
                            await reply.delete();
                        }
                    }
                }
                return false;
            }
        }
        return true;
    }

    /**
     * Asynchronously initializes the underlying bot instance.
     * Add this method to force the bot to call this method before running.
     */
    protected async initialize?(): Promise<void>;

    /**
     * Fetches the prefix for the guild.
     *
     * Allows different prefixes to be supported for different guilds.
     *
     * Simply return a single string to use a universal prefix.
     *
     * Return `undefined` to use no prefix, which means chat commands are disabled unless the bot is mentioned.
     * @param guildId Guild ID.
     * @returns Prefix for the guild
     */
    public abstract getPrefix(guildId: Snowflake): string;

    /**
     * Run the bot, logging in with the given bot token.
     * @param token Bot token. This should be a secret!
     */
    public async run(token: string) {
        try {
            this.validateInternalAttributes();
            if (this.initialize) {
                await this.initialize();
            }
            await this.internalInitialize();
            await this.client.login(token);
            this.running = true;
        } catch (error) {
            console.error(error);
            process.exit(1);
        }
    }
}
