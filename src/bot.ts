import { Channel, Client, ClientOptions, GuildMember, Intents, MessageEmbed, Role, Snowflake, User } from 'discord.js';
import { BaseCommand } from './commands/base';
import { CommandConfig, CommandMap, CommandTypeArray } from './commands/config';
import { CommandSource } from './commands/command-source';
import { CommandParameters } from './commands/params';
import { EmbedOptions, EmbedProps, EmbedTemplates } from './embeds/options';
import { BaseEvent } from './events/base';
import { DefaultInteractionCreateEvent } from './events/defaults/interaction-create';
import { DefaultMessageCreateEvent } from './events/defaults/message-create';
import { MemberListService } from './services/member-list';
import { TimeoutService } from './services/timeout';
import { DiscordUtil } from './util/discord';
import { ExpireAgeConversion, TimedCache } from './util/timed-cache';
import { EventConfig, EventMap, EventTypeArray } from './events/config';
import { DefaultReadyEvent } from './events/defaults/ready';
import { HelpCommand } from './commands/defaults/help';
import { PingCommand } from './commands/defaults/ping';

/**
 * Options for setting up the underlying PandaDiscordBot instance.
 */
export interface PandaOptions {
    client: ClientOptions;
    commands?: CommandTypeArray;
    events?: EventTypeArray;
    interactionEvent?: { new (bot: PandaDiscordBot): BaseEvent<'interactionCreate'> };
    cooldownOffensesForTimeout?: number;
    owner?: Snowflake;
}

type CompletePandaOptions = { [option in keyof PandaOptions]-?: PandaOptions[option] };

const defaultOptions: CompletePandaOptions = {
    client: {
        intents: [
            Intents.FLAGS.GUILDS,
            Intents.FLAGS.GUILD_BANS,
            Intents.FLAGS.GUILD_MEMBERS,
            Intents.FLAGS.GUILD_MESSAGES,
        ],
    },
    commands: [HelpCommand, PingCommand],
    events: [DefaultMessageCreateEvent, DefaultReadyEvent],
    interactionEvent: DefaultInteractionCreateEvent,
    cooldownOffensesForTimeout: 5,
    owner: null,
};

/**
 * Discord bot that uses the Panda command framework.
 */
export abstract class PandaDiscordBot {
    // Color to appear in normal embeds.
    public abstract readonly color: `#${string}`;
    public abstract readonly commandCategories: string[];
    public readonly startedAt: Date = new Date();
    public readonly client: Client;

    public commands: CommandMap<string>;
    public events: EventMap;

    public memberListService?: MemberListService;
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
        this.assertRunning(`PandaDiscordBot.start() must be called before accessing bot name.`);
        return this.client.user.username;
    }

    /**
     * The bot's avatar URL, as it is currently cached on the Discord client object.
     */
    public get avatarUrl(): string {
        this.assertRunning(`PandaDiscordBot.start() must be called before accessing bot avatar.`);
        return this.client.user.avatarURL();
    }

    /**
     * Refresh the command map by recreating every command.
     * All data inside of each command will be reset.
     */
    public refreshCommands() {
        this.commands = CommandConfig.build(this.options.commands);
    }

    public refreshEvents() {
        this.events = EventConfig.build(this.options.events, this);
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
     * @param str String to split.
     * @returns Array of arguments.
     */
    public splitIntoArgs(str: string): string[] {
        return str.split(' ');
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
     * Validates if the given command and parameters should run.
     * @param params Command parameters.
     * @param command Command attempting to run.
     * @returns Promise for if the command should run.
     * True to run, false to not run.
     */
    public abstract validate(params: CommandParameters<this>, command: BaseCommand): Promise<boolean>;

    /**
     * Run the bot, logging in with the given bot token.
     * @param token Bot token. This should be a secret!
     */
    public async run(token: string) {
        try {
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
