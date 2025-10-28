import {
    BaseInteraction,
    BaseMessageOptionsWithPoll,
    CommandInteraction,
    Guild,
    GuildMember,
    InteractionReplyOptions,
    Message,
    MessageCreateOptions,
    MessageEditOptions,
    MessageReplyOptions,
    RepliableInteraction,
    Snowflake,
    TextBasedChannel,
    User,
    WebhookMessageEditOptions,
} from 'discord.js';

type DisableSplit = { split?: false };
type CommonReplyOptions = MessageReplyOptions & InteractionReplyOptions & DisableSplit;
type CommonSendOptions = MessageCreateOptions & InteractionReplyOptions & DisableSplit;
type CommonEditOptions = MessageEditOptions & WebhookMessageEditOptions;

export type ReplyResponse = string | CommonReplyOptions;
export type SendResponse = string | CommonSendOptions;
export type EditResponse = string | CommonEditOptions;

/**
 * Parameters for creating a mock command source.
 */
export interface MockCommandSourceParams {
    member: GuildMember;
    channel: TextBasedChannel;
    guild: Guild;
}

/**
 * Base class for a mock command source, which mocks the functionality of a real command source.
 *
 * Subclasses may override the defined methods for custom functionality.
 */
export class MockCommandSourceBase implements MockCommandSourceParams {
    constructor(public data: MockCommandSourceParams) {}

    public get member(): GuildMember {
        return this.data.member;
    }
    public get channel(): TextBasedChannel {
        return this.data.channel;
    }
    public get guild(): Guild {
        return this.data.guild;
    }

    public get guildId(): Snowflake {
        return this.guild?.id;
    }

    public get channelId(): Snowflake {
        return this.channel?.id;
    }

    public get content(): string {
        return '';
    }

    public async delete(): Promise<void> {}

    public async reply(res: ReplyResponse): Promise<Receivable> {
        return this;
    }

    public async send(res: SendResponse): Promise<Receivable> {
        return this;
    }
    public async edit(res: EditResponse): Promise<Receivable> {
        return this;
    }

    public async append(res: string): Promise<Receivable> {
        return this;
    }

    public async sendDirect(res: SendResponse): Promise<Receivable> {
        return this;
    }
}

export type Receivable = Message | RepliableInteraction | MockCommandSourceBase;

/**
 * All possible options for an underlying command source.
 */
enum CommandSourceType {
    Message,
    Interaction,
    Mock,
    Unsupported, // Default case.
}

interface CommandSourceTypeMetadata {
    type: any;
    field: string;
}

// Metadata for each command source type.
const CommandSourceTypeMap: Record<CommandSourceType, CommandSourceTypeMetadata> = {
    [CommandSourceType.Message]: {
        type: Message,
        field: 'message',
    },
    [CommandSourceType.Interaction]: {
        type: BaseInteraction,
        field: 'interaction',
    },
    [CommandSourceType.Mock]: {
        type: MockCommandSourceBase,
        field: 'mock',
    },
    [CommandSourceType.Unsupported]: {
        type: null as never,
        field: 'unsupported',
    },
} as const;

export type MessageCommandSource = CommandSource & { message: Message };
export type InteractionCommandSource = CommandSource & { interaction: RepliableInteraction };
export type CommandInteractionCommandSource = CommandSource & { interaction: CommandInteraction };
export type MockCommandSource = CommandSource & { mock: MockCommandSourceBase };

/**
 * A wrapper around a message or an interaction, whichever receives the command.
 *
 * This class provides a common interface for replying to a command.
 * All replies or messages sent through this interface produce another interface.
 * If an ephemeral reply is sent to an interaction, the same interaction is exposed.
 * In any other case, the sent message is exposed, which is easier to work with.
 */
export class CommandSource {
    private deferredEphemeral: boolean = false;
    // A single variable records the type of the internal instance so that the actual
    // type is only checked once.
    private readonly type: CommandSourceType;
    protected native: Receivable;

    public constructor(received: Receivable) {
        this.native = received;
        for (const type in CommandSourceTypeMap) {
            // @ts-ignore
            const metadata = CommandSourceTypeMap[type] as CommandSourceTypeMetadata;
            if (metadata.type === null || received instanceof metadata.type) {
                this.type = parseInt(type);
                // @ts-ignore
                this[metadata.field] = this.native;
                break;
            }
        }
    }

    /**
     * Checks if the command originates from a message.
     * @returns Is the command source a message?
     */
    public isMessage(): this is MessageCommandSource {
        return this.type === CommandSourceType.Message;
    }

    /**
     * Checks if the command originates from an interaction.
     * @returns Is the command source an interaction?
     */
    public isInteraction(): this is InteractionCommandSource {
        return this.type === CommandSourceType.Interaction;
    }

    /**
     * Checks if the command originates from a command interaction.
     * @returns Is the command source an interaction?
     */
    public isCommandInteraction(): this is CommandInteractionCommandSource {
        return this.isInteraction() && this.interaction.isCommand();
    }

    /**
     * Checks if the command originates from a mock object.
     * @returns Is the command source a mock?
     */
    public isMock(): this is MockCommandSource {
        return this.type === CommandSourceType.Mock;
    }

    /**
     * Checks if the command orginates from an unsupported source.
     * @returns Is the command source unsupported?
     */
    public isUnsupported(): boolean {
        return this.type === CommandSourceType.Unsupported;
    }

    private throwUnsupported(): never {
        throw new Error(`Unsupported command source: ${this.native.constructor.name}.`);
    }

    /**
     * The author of the command.
     */
    public get author(): User {
        if (this.isMessage()) {
            return this.message.author;
        } else if (this.isInteraction()) {
            return this.interaction.user;
        } else if (this.isMock()) {
            return this.mock.member.user;
        }
        this.throwUnsupported();
    }

    /**
     * The content of the command source.
     * May require additional fetching.
     * @returns Promise for a string.
     */
    public async content(): Promise<string> {
        if (this.isMessage()) {
            return this.message.content;
        } else if (this.isInteraction()) {
            this.assertReplied();
            return (await this.interaction.fetchReply()).content;
        } else if (this.isMock()) {
            return this.mock.content;
        }
        this.throwUnsupported();
    }

    /**
     * Guild member who initiated the command.
     */
    public get member(): GuildMember {
        return this.native.member as GuildMember;
    }

    /**
     * Guild the command was initiated in.
     */
    public get guild(): Guild | null {
        return this.native.guild;
    }

    /**
     * Guild ID the command was initiated in.
     */
    public get guildId(): Snowflake | null {
        return this.native.guildId;
    }

    /**
     * Channel the command was initiated in.
     *
     * Guaranteed to be a text channel because commands are only text-based.
     */
    public get channel(): TextBasedChannel {
        return this.native.channel as TextBasedChannel;
    }

    /**
     * Channel ID the command was initiated in.
     */
    public get channelId(): Snowflake | null {
        return this.native.channelId;
    }

    /**
     * Checks if the command can be deleted.
     *
     * Only messages can be deleted.
     */
    public get deletable(): boolean {
        return this.isMessage() && this.message.deletable;
    }

    /**
     * Deletes the source of the command.
     *
     * Only messages can be deleted.
     */
    public async delete(): Promise<void> {
        if (this.isMessage()) {
            await this.message.delete();
        } else if (this.isInteraction()) {
            await this.interaction.deleteReply();
        } else if (this.isMock()) {
            await this.mock.delete();
        }
    }

    /**
     * Defers the command response.
     *
     * Only interactions can be deferred. No-op for messages.
     * @param ephemeral Will the command response be ephemeral?
     */
    public async deferReply(ephemeral: boolean = false): Promise<void> {
        if (this.isInteraction() && !this.interaction.deferred && !this.interaction.replied) {
            this.deferredEphemeral = ephemeral;
            await this.interaction.deferReply({ ephemeral });
            this.interaction.deferred = true;
        }
    }

    /**
     * Assert an interaction has been replied to.
     */
    private assertReplied(): void {
        if (this.isInteraction() && !this.interaction.replied) {
            throw new Error(`No reply content available for this interaction. Make sure to reply first.`);
        }
    }

    /**
     * Responds to the command source as an interaction.
     * @param res Response object.
     * @returns New command source for next response.
     */
    private async respondInteraction(res: string | BaseMessageOptionsWithPoll): Promise<CommandSource> {
        if (!this.isInteraction()) {
            throw new Error(`Attempted to respond to a ${CommandSourceType[this.type]} command as an Interaction.`);
        }

        const interaction = (this as InteractionCommandSource).interaction;
        const ephemeral = typeof res !== 'string' && (res as any).ephemeral === true;

        // No initial reply sent.
        if (!interaction.replied) {
            // Interaction has not been deferred, so we use the original reply method.
            if (!interaction.deferred) {
                await interaction.reply(res);

                if (ephemeral || this.deferredEphemeral) {
                    return new CommandSource(interaction);
                } else {
                    const reply = await interaction.fetchReply();
                    return new CommandSource(reply as Message);
                }
            } else {
                // Interaction was deferred, use editReply.
                const reply = (await interaction.editReply(res)) as Message;

                // For consistency, set that the interaction has been replied to.
                // If we don't do this, future responses on this interaction will also call editReply causing all
                // messages to blend together.
                // This is very likely to not be intentional by the command, so it makes more sense to split things up.
                interaction.replied = true;

                return new CommandSource(ephemeral || this.deferredEphemeral ? interaction : reply);
            }
        } else {
            // Send a follow-up message.
            const reply = (await interaction.followUp(res)) as Message;
            return new CommandSource(ephemeral || this.deferredEphemeral ? interaction : reply);
        }
    }

    /**
     * Inline reply for message, reply/follow up for interaction.
     * @param res Response object.
     * @returns New command source for next response.
     */
    public async reply(res: ReplyResponse): Promise<CommandSource> {
        if (this.isMessage()) {
            return new CommandSource(await this.message.reply(res));
        } else if (this.isInteraction()) {
            return await this.respondInteraction(res);
        } else if (this.isMock()) {
            return new CommandSource(await this.mock.reply(res));
        }
        this.throwUnsupported();
    }

    /**
     * Send to channel for message, reply/follow up for interaction.
     * @param res Response object.
     * @returns New command source for next response.
     */
    public async send(res: SendResponse): Promise<CommandSource> {
        if (this.isMessage()) {
            if (!this.message.channel.isSendable()) {
                return this.throwUnsupported();
            }
            return new CommandSource(await this.message.channel.send(res));
        } else if (this.isInteraction()) {
            return await this.respondInteraction(res);
        } else if (this.isMock()) {
            return new CommandSource(await this.mock.send(res));
        }
        return this.throwUnsupported();
    }

    /**
     * Edit message or interaction reply.
     * @param res Response object.
     * @returns New command source for next response.
     */
    public async edit(res: EditResponse): Promise<CommandSource> {
        let edited: Receivable;

        if (this.isMessage()) {
            edited = await this.message.edit(res);
        } else if (this.isInteraction()) {
            // Having a replied interaction here means the reply must be ephemeral
            this.assertReplied();
            edited = (await this.interaction.editReply(res)) as Message;
        } else if (this.isMock()) {
            edited = await this.mock.edit(res);
        } else {
            this.throwUnsupported();
        }

        return new CommandSource(edited);
    }

    /**
     * Append to message content or interaction reply.
     * @param res Response object.
     * @returns New command source for next response.
     */
    public async append(res: string): Promise<CommandSource> {
        if (this.isMessage()) {
            return new CommandSource(await this.message.edit(this.message.content + res));
        } else if (this.isInteraction()) {
            this.assertReplied();
            const content = (await this.interaction.fetchReply()).content;
            await this.interaction.editReply(content + res);
        } else if (this.isMock()) {
            return new CommandSource(await this.mock.append(res));
        }
        this.throwUnsupported();
    }

    /**
     * Direct message, ephemeral reply for interaction.
     * @param res Response object.
     * @returns New command source for next response.
     */
    public async sendDirect(res: SendResponse): Promise<CommandSource> {
        if (typeof res !== 'string') {
            res.ephemeral = true;
        }
        if (this.isMessage()) {
            return new CommandSource(await this.message.author.send(res));
        } else if (this.isInteraction()) {
            return await this.respondInteraction(res);
        } else if (this.isMock()) {
            return new CommandSource(await this.mock.sendDirect(res));
        }
        this.throwUnsupported();
    }
}
