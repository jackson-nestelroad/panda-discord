import { ApplicationCommandManager, GuildApplicationCommandManager } from 'discord.js';
import { PandaDiscordBot } from '../../bot';
import { BaseCommand } from '../../commands/base';
import { DiscordUtil } from '../../util/discord';
import { BaseEvent } from '../base';

/**
 * Default event handler for the ready event.
 */
export class DefaultReadyEvent extends BaseEvent<'ready', PandaDiscordBot> {
    constructor(bot: PandaDiscordBot) {
        super(bot, 'ready');
    }

    // Get the proper command manager this command would belong to
    private async getCommandManager(
        cmd: BaseCommand,
    ): Promise<GuildApplicationCommandManager | ApplicationCommandManager> {
        if (cmd.slashGuildId) {
            const cmdGuild = this.bot.client.guilds.cache.get(cmd.slashGuildId);
            if (cmdGuild.commands.cache.size === 0) {
                await cmdGuild.commands.fetch();
            }
            return cmdGuild.commands;
        } else {
            return this.bot.client.application.commands;
        }
    }

    public async run() {
        console.log(`Bot is logged in as ${this.bot.client.user.tag}.`);
        this.bot.client.user.setActivity(`@${this.bot.name} help`, {
            type: 'PLAYING',
        });

        // Store all global commands in the cache.
        await this.bot.client.application.commands.fetch();

        // Look through all of the commands that currently exist as slash commands
        // and delete ones that have been removed from the bot.
        for (const [id, commandData] of this.bot.client.application.commands.cache) {
            // This command has been removed altogether, or it has been moved to a guild.
            const cmd = this.bot.commands.get(commandData.name);
            if (!cmd || !cmd.isSlashCommand || cmd.slashGuildId) {
                console.log(`Deleting slash command "${cmd.name}"`);
                await this.bot.client.application.commands.delete(commandData);
            }
        }

        // We do not currently support deleting commands that previously existed
        // on a guild (using `slashGuildId`) but have been moved to global.
        // If you run into this situation, it is best to first run the bot with
        // the command removed, then run it with the command added with the
        // `slashGuildId` property enabled.

        // Go through every internal command and possibly update its slash command.
        for (const [name, cmd] of this.bot.commands) {
            if (cmd.isSlashCommand) {
                const newData = cmd.commandData();
                const cmdManager = await this.getCommandManager(cmd);

                // Check if command already exists.
                // If so, check if it has been updated in any way.
                const old = cmdManager.cache.find(cmd => cmd.name === name);
                if (old) {
                    if (DiscordUtil.slashCommandNeedsUpdate(old, newData)) {
                        console.log(`Updating slash command "${cmd.name}"`);
                        await cmdManager.edit(old, newData);
                    }
                } else {
                    console.log(`Creating slash command "${cmd.name}"`);
                    await cmdManager.create(newData);
                }
            } else {
                // Remove command if it exists when it should not.
                const cmdManager = await this.getCommandManager(cmd);
                const old = cmdManager.cache.find(cmd => cmd.name === name);
                if (old) {
                    console.log(`Deleting slash command "${cmd.name}"`);
                    await cmdManager.delete(old);
                }
            }
        }

        this.bot.enableSlashCommands();
    }
}
