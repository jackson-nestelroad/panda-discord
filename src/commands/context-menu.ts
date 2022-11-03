import { ApplicationCommandData, ApplicationCommandType, GuildMember, Message, User } from 'discord.js';

import { PandaDiscordBot } from '..';
import { BaseCommand } from './base';
import { ParameterizedCommand } from './chat-input';
import { InteractionCommandParameters } from './params';

/**
 * Base class for all context menu commands.
 *
 * Do not inherit directly from this!
 */
export abstract class BaseContextMenuCommand<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Args = unknown,
    Shared = unknown,
> extends BaseCommand {
    /**
     * The associated command instance.
     */
    public readonly command: ParameterizedCommand<Bot, Args, Shared>;

    constructor(command: ParameterizedCommand<Bot, Args, Shared>) {
        super();
        this.command = command;
    }

    /**
     * Initializes the internal state of the command and performs a few validation tests.
     */
    public initialize(): void {
        if (this.permission?.inherit ?? true) {
            this['permission' as string] = this.command.permission;
        }
    }

    public commandData(): ApplicationCommandData {
        return {
            name: this.name,
            description: '',
            type: this.type,
            defaultMemberPermissions: this.memberPermissions ?? this.permission.memberPermissions ?? null,
            dmPermission: !!this.enableInDM,
        };
    }

    /**
     * Executes the command from the context menu.
     *
     * Before executing the command, this method checks a few preconditions, such as validating permisions and checking
     * if the user is on cooldown for the command. If the user fails any of these preconditions, `false` is returned.
     * Otherwise, the command executes and this method returns `true`. If the command experiences a failure, it should
     * throw an error to be caught by the caller.
     * @param params Command parameters.
     * @returns Promise that resolves when the command finishes. Promise contains `true` if the command executed and
     * `false` if the command did not execute for some reason, such as for validation or cooldown reasons.
     */
    public async execute(params: InteractionCommandParameters<Bot>): Promise<boolean> {
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

        // Steal the base command's cooldown set.
        if (!(await params.bot.handleCooldown(params.src, this.command['cooldownSet']))) {
            return false;
        }

        await this.delegate(params);
        return true;
    }

    /**
     * Delegates the context menu command to the run handler depending on the target.
     * @param params Command parameters.
     */
    protected abstract delegate(params: InteractionCommandParameters<Bot>): Promise<void>;
}

/**
 * Class type for a context menu command.
 */
export type ContextMenuCommandClassType<
    Command extends ParameterizedCommand<Bot, Args, Shared>,
    Bot extends PandaDiscordBot,
    Args,
    Shared,
> = new (command: Command) => BaseContextMenuCommand<Bot, Args, Shared>;

/**
 * Context menu command that targets a message.
 */
export abstract class MessageContextMenuCommand<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Args extends object = object,
    Shared = never,
> extends BaseContextMenuCommand<Bot, Args, Shared> {
    public type = ApplicationCommandType.Message;

    protected delegate(params: InteractionCommandParameters<Bot>): Promise<void> {
        if (!params.src.isInteraction() || !params.src.interaction.isMessageContextMenuCommand()) {
            throw new Error(`Context menu command is misconfigured. Interaction received does not target a message.`);
        }
        return this.run(params, params.src.interaction.targetMessage);
    }

    public abstract run(params: InteractionCommandParameters<Bot>, message: Message): Promise<void>;
}

/**
 * Context menu command that targets a user.
 */
export abstract class UserContextMenuCommand<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Args extends object = object,
    Shared = never,
> extends BaseContextMenuCommand<Bot, Args, Shared> {
    public type = ApplicationCommandType.User;

    protected delegate(params: InteractionCommandParameters<Bot>): Promise<void> {
        if (!params.src.isInteraction() || !params.src.interaction.isUserContextMenuCommand()) {
            throw new Error(`Context menu command is misconfigured. Interaction received does not target a user.`);
        }
        return this.run(params, params.src.interaction.targetUser);
    }

    public abstract run(params: InteractionCommandParameters<Bot>, user: User): Promise<void>;
}

/**
 * Context menu command that targets a guild member.
 *
 * This command is guaranteed to not run in a DM, unless miconfigured.
 */
export abstract class GuildMemberContextMenuCommand<
    Bot extends PandaDiscordBot = PandaDiscordBot,
    Args extends object = object,
    Shared = never,
> extends BaseContextMenuCommand<Bot, Args, Shared> {
    public enableInDM: false;
    public type = ApplicationCommandType.User;

    protected async delegate(params: InteractionCommandParameters<Bot>): Promise<void> {
        if (!params.src.isInteraction() || !params.src.interaction.isUserContextMenuCommand()) {
            throw new Error(`Context menu command is misconfigured. Interaction received does not target a user.`);
        }
        // We fetch the guild member if needed to assure we have the entire object.
        const targetId = params.src.interaction.targetId;
        const member = params.src.guild.members.cache.get(targetId) ?? (await params.src.guild.members.fetch(targetId));
        return this.run(params, member);
    }

    public abstract run(params: InteractionCommandParameters<Bot>, member: GuildMember): Promise<void>;
}
