import { Channel, Client, ClientOptions, GuildMember, Intents, MessageEmbed, Role, Snowflake, User } from 'discord.js';
import { CommandConfig, CommandMap, CommandTypeArray } from './commands/config';
import { CommandSource } from './commands/command-source';
import { CommandParameters } from './commands/params';
import { EmbedOptions, EmbedProps, EmbedTemplates } from './embeds/options';
import { BaseEvent } from './events/base';
import { DefaultInteractionCreateEvent } from './events/defaults/interaction-create';
import { DefaultMessageCreateEvent } from './events/defaults/message-create';
import { MemberListService } from './services/member-list';
import { TimeoutService } from './services/timeout';
import { DiscordUtil, Mentionable } from './util/discord';
import { ExpireAgeConversion, TimedCache } from './util/timed-cache';
import { EventConfig, EventMap, EventTypeArray } from './events/config';
import { DefaultReadyEvent } from './events/defaults/ready';
import { HelpCommand } from './commands/defaults/help';
import { PingCommand } from './commands/defaults/ping';
import { CommandPermissionValidatorConfig, DefaultCommandPermission } from './commands/permission';
import { BaseCommand } from './commands/base';

/**
 * Options for setting up the underlying PandaDiscordBot instance.
 */
export interface PandaOptions {
    /**
     * Options that are passed to the Discord.JS client.
     * 
     * If anything, the WebSocket intents are required for setting up which events
     * the bot should receive.
     */
    client: ClientOptions;
    /**
     * Array of command classes that are created to handle commands.
     */
    commands?: CommandTypeArray;
    /**
     * Array of event classes that are used to handle Discord events.
     * 
     * Do not put an "interactionCreate" handler in this array. Instead, use the
     * `interactionEvent` option, because the interaction event is typically set
     * up after slash commands are created, which occurs after the ready event
     * fires.
     */
    events?: EventTypeArray;
    /**
     * The class that is set up to handle "interactionCreate" events, which is
     * typically used for slash commands.
     * 
     * Must be specified separately so that the event can only be attached after 
     * all of the necessary slash commands are created.
     */
    interactionEvent?: new (bot: PandaDiscordBot) => BaseEvent<'interactionCreate'>;
    /**
     * Number of cooldown offenses a user has to make before going on timeout.
     * 
     * A cooldown offense occurs when a user attempts to use a command in its
     * cooldown period. The user is timed out, which means the bot ignores all
     * messages and interactions from them.
     */
    cooldownOffensesForTimeout?: number;
    /**
     * The user ID of the bot owner. Used for the "Owner" command permission.
     */
    owner?: Snowflake;
}

type CompletePandaOptions = { [option in keyof PandaOptions]-?: PandaOptions[option] };

const defaultOptions: CompletePandaOptions = {
    client: {
        intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
    },
    commands: [HelpCommand, PingCommand],
    events: [DefaultMessageCreateEvent, DefaultReadyEvent],
    interactionEvent: DefaultInteractionCreateEvent,
    cooldownOffensesForTimeout: 5,
    owner: null,
};

export interface PandaDiscordBot {
    /**
     * Maps a command permission string to how it should be validated by
     * the bot.
     */
    readonly permissionValidators?: CommandPermissionValidatorConfig<this>;
}

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

    protected options: CompletePandaOptions;

    private running: boolean = false;
    private slashCommandsEnabled: boolean = false;

    public constructor(options: Partial<PandaOptions> = {}) {
        this.mergeOptionsIn(options);
        this.client = new Client(this.options.client);
        this.refreshCommands();
        this.refreshEvents();
    }

    private mergeOptionsIn(options: Partial<PandaOptions>) {
        this.options = {} as CompletePandaOptions;
        for (const key in defaultOptions) {
            this.options[key] = options[key] ?? defaultOptions[key];
        }
    }

    private assertRunning(message: string) {
        if (!this.running) {
            throw new Error(message);
        }
    }

    /**
     * The bot's username, as it is currently cached on the Discord client object.
     */
    public get name(): string {
        this.assertRunning(`PandaDiscordBot.run() must be called before accessing bot name.`);
        return this.client.user.username;
    }

    /**
     * The bot's avatar URL, as it is currently cached on the Discord client object.
     */
    public get avatarUrl(): string {
        this.assertRunning(`PandaDiscordBot.run() must be called before accessing bot avatar.`);
        return this.client.user.avatarURL();
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

    /**
     * Sets the default command permission validators if they are not set by
     * the deriving class.
     */
    protected setDefaultPermissionValidators() {
        // Deriving class did not set an object at all, so we must set it ourselves.
        if (!this.permissionValidators) {
            this['permissionValidators' as string] = {};
        }

        if (!this.permissionValidators[DefaultCommandPermission.Everyone]) {
            this.permissionValidators[DefaultCommandPermission.Everyone] = () => {
                return true;
            };
        }
        if (!this.permissionValidators[DefaultCommandPermission.Owner]) {
            this.permissionValidators[DefaultCommandPermission.Owner] = params => {
                return params.src.author.id === this.options.owner;
            };
        }
    }

    /**
     * Enables receiving slash commands on the bot.
     */
    public enableSlashCommands() {
        if (!this.slashCommandsEnabled) {
            const interactionEvent = new DefaultInteractionCreateEvent(this);
            this.events.set(interactionEvent.name, interactionEvent);
            this.slashCommandsEnabled = true;
        }
    }

    /**
     * Creates an embed using a template or options object.
     * @param options Options for the embed.
     * @returns New message embed instance.
     */
    public createEmbed(options: EmbedProps | EmbedOptions = new EmbedOptions()): MessageEmbed {
        if (!(options instanceof EmbedOptions)) {
            options = new EmbedOptions(options);
        }
        return (options as EmbedOptions).create(this);
    }

    /**
     * Formats an error and sends it back to the command source.
     * @param src Source of the error to respond to.
     * @param error Error object or message.
     */
    public async sendError(src: CommandSource, error: any) {
        const embed = this.createEmbed(EmbedTemplates.Error);
        embed.setDescription(error.message || error.toString());
        await src.send({ embeds: [embed], ephemeral: true });
    }

    /**
     * Splits a string into arguments to be consumed by a command.
     *
     * By default, strings are split by spaces. However, quotes can be used
     * to keep multiple words together. Quotes can also be escaped using
     * backslashes (`\`).
     * @param str String to split.
     * @returns Array of arguments.
     */
    public splitIntoArgs(str: string): string[] {
        if (!str) {
            return [];
        }
        const args: string[] = [];
        let escaped = false;
        let quoted = false;
        let nextArg: string = '';
        for (const nextChar of str) {
            switch (nextChar) {
                case '\\':
                    escaped = !escaped;
                    // Escaped backslash, add it to the argument.
                    if (!escaped) {
                        nextArg += nextChar;
                    }
                    break;
                case '"':
                    if (quoted) {
                        // End of quoted argument.
                        if (!escaped) {
                            args.push(nextArg);
                            nextArg = '';
                            quoted = false;
                            // Escaped quote, add it to the argument.
                        } else {
                            nextArg += nextChar;
                            escaped = false;
                        }
                        // Escaped quote, not the beginning of a quoted argument.
                    } else if (escaped) {
                        nextArg += nextChar;
                        escaped = false;
                        // Beginning of a quoted argument.
                    } else {
                        // Some argument existed before this quoted segment,
                        // so add it here.
                        if (nextArg) {
                            args.push(nextArg);
                            nextArg = '';
                        }
                        quoted = true;
                    }
                    break;
                // Spaces are used to separate non-quoted arguments.
                // In quotes, spaces are trated like any other character.
                case ' ':
                case '\f':
                case '\n':
                case '\r':
                case '\t':
                case '\v':
                    if (!quoted) {
                        // Only push if we have a meaningful next argument.
                        if (nextArg) {
                            args.push(nextArg);
                            nextArg = '';
                        }
                        break;
                    }
                // Fall through.
                default:
                    // Simply add to the argument.
                    escaped = false;
                    nextArg += nextChar;
                    break;
            }
        }

        // Quote mismatch.
        if (quoted) {
            throw new Error('Could not split content into arguments: quotation mismatch.');
        } else if (nextArg) {
            args.push(nextArg);
        }

        return args;
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
     * First checks if the string is a mention, then checks if the string is a user ID, then
     * checks if the string is a username.
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
        if (members.has(str as Snowflake)) {
            return members.get(str as Snowflake);
        }
        return (
            members.find(
                member => member.user.username.localeCompare(str, undefined, { sensitivity: 'accent' }) === 0,
            ) || null
        );
    }

    /**
     * Parses a TextChannel instance from the input string.
     * First checks if the string is a mention, then checks if the string is a channel ID, then
     * checks if the string is a channel name.
     * @param str Input string.
     * @param guildId Guild ID context.
     * @returns TextChannel instance if found, null if not found.
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
     * First checks if the string is a mention, then checks if the string is a role ID, then
     * checks if the string is a role name.
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
     * Asynchronously wait for the given number of milliseconds.
     * @param ms Number of milliseconds to wait.
     * @returns Promise that resolves when time is up.
     */
    public async wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Validates if the given command and parameters should run.
     * @param params Command parameters.
     * @param command Command attempting to run.
     * @returns Promise for if the command should run.
     * True to run, false to not run.
     */
    public validate(params: CommandParameters<this>, command: BaseCommand): boolean {
        const validator = this.permissionValidators[command.permission];
        if (!validator) {
            throw new Error(`No validation found for command permission "${command.permission}".`);
        }
        return validator(params);
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
            const offenses = cooldownSet.get(id);
            if (offenses === undefined) {
                cooldownSet.set(id, 0);
            } else {
                if (offenses === 0) {
                    cooldownSet.update(id, 1);
                    const slowDownMessage =
                        cooldownSet.expireAge > 60000
                            ? `This command can only be run once every ${ExpireAgeConversion.toString(
                                  cooldownSet.expireAge,
                              )}.`
                            : 'Slow down!';
                    const reply = await src.reply({ content: slowDownMessage, ephemeral: true });
                    if (reply.isMessage()) {
                        await this.wait(10000);
                        await reply.delete();
                    }
                } else if (this.timeoutService && offenses >= this.options.cooldownOffensesForTimeout) {
                    await this.timeoutService.timeout(author);
                } else {
                    cooldownSet.update(id, offenses + 1);
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
     * Simply return a single string to use a universal prefix.
     * @param guildId
     */
    public abstract getPrefix(guildId: Snowflake): Promise<string>;

    /**
     * Run the bot, logging in with the given bot token.
     * @param token Bot token. This should be a secret!
     */
    public async run(token: string) {
        try {
            this.setDefaultPermissionValidators();
            if (this.initialize) {
                await this.initialize();
            }
            await this.client.login(token);
            this.running = true;
        } catch (error) {
            console.error(error);
            process.exit(1);
        }
    }
}
