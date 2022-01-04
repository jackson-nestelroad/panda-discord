import { ArgumentType, ArgumentsConfig, SingleArgumentConfig } from '../arguments';
import { BaseCommand, ComplexCommand, StandardCooldowns } from '../base';
import { CommandCategoryUtil, DefaultCommandCategory } from '../category';

import { CommandMap } from '../config';
import { CommandParameters } from '../params';
import { DefaultCommandPermission } from '../permission';
import { ExpireAgeConversion } from '../../util/timed-cache';
import { MessageEmbed } from 'discord.js';
import { PandaDiscordBot } from '../../bot';

export interface HelpArgs {
    query?: string;
}

export interface HelpCommand<Bot extends PandaDiscordBot = PandaDiscordBot> {
    /**
     * This method runs before the base help command attempts to match the help query
     * to some command or command category.
     *
     * Your bot can implement special help queries that have higher priority than
     * commands and command categories.
     * @param params Command parameters.
     * @param args Command arguments.
     * @param embed Message embed to add response to.
     * @returns Was the query satisfied?
     */
    handleHelpQueryBeforeCommands?(
        params: CommandParameters<Bot>,
        args: HelpArgs,
        embed: MessageEmbed,
    ): Promise<boolean>;

    /**
     * This method only runs after the help command fails to match the help query to
     * some command or command category.
     *
     * Your bot can implement special help queries that have lower priority than
     * commands and command categories.
     * @param params Command parameters.
     * @param args Command arguments.
     * @param embed Message embed to add response to.
     * @returns Was the query satisfied?
     */
    handleHelpQueryAfterCommands?(
        params: CommandParameters<Bot>,
        args: HelpArgs,
        embed: MessageEmbed,
    ): Promise<boolean>;
}

/**
 * Default help command for displaying commands by category.
 */
export class HelpCommand<Bot extends PandaDiscordBot = PandaDiscordBot> extends ComplexCommand<Bot, HelpArgs> {
    public name = 'help';
    public description = 'Gives information on how to use the bot or a given command.';
    public category = DefaultCommandCategory.Utility;
    public permission = DefaultCommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public args: ArgumentsConfig<HelpArgs> = {
        query: {
            description: 'Command category or individual command.',
            type: ArgumentType.RestOfContent,
            required: false,
        },
    };

    /**
     * Number of commands allowed in a single column before writing them
     * next to each other separated by commads.
     */
    protected readonly singleColumnLimit = 20;

    /**
     * Number of optional named arguments in a command's arguments string
     * before clumping them together under one name.
     */
    protected readonly optionalNamedArgumentsLimit = 3;

    // Cache for list of command names by category.
    // Key is a lowercase, normalized version of the category name.
    private commandListByCategory: Map<string, Map<string, string>> = null;

    private readonly optionalArgsTemplate: SingleArgumentConfig = {
        description: '',
        type: ArgumentType.String,
        required: false,
        named: true,
    } as const;

    protected createCommandArgsString(bot: Bot, cmd: BaseCommand) {
        if (
            !(cmd instanceof ComplexCommand) ||
            this.optionalNamedArgumentsLimit === Infinity ||
            this.optionalNamedArgumentsLimit === undefined ||
            this.optionalNamedArgumentsLimit === null
        ) {
            return cmd.argsString(bot);
        }

        const argEntries = Object.entries(cmd.args).filter(([name, config]) => !config.hidden);
        const optionalNamedArgsCounter = argEntries.filter(([name, config]) => config.named && !config.required).length;
        if (optionalNamedArgsCounter <= this.optionalNamedArgumentsLimit) {
            return argEntries.map(([name, config]) => bot.argString(name, config)).join(' ');
        } else {
            const argsString = argEntries
                .filter(([name, config]) => !config.named || config.required)
                .map(([name, config]) => bot.argString(name, config))
                .join(' ');
            return `${argsString} ${bot.argString('args', this.optionalArgsTemplate)}*`;
        }
    }

    private addCommandsToCommandListByCategory(bot: Bot, map: CommandMap<string>, nameChain: string[] = []): void {
        map.forEach((cmd, name) => {
            if (cmd.isNested && !cmd.flattenHelpForSubCommands) {
                nameChain.push(name);
                this.addCommandsToCommandListByCategory(bot, cmd.subcommandMap, nameChain);
                nameChain.pop();
            } else {
                if (CommandCategoryUtil.isPublic(cmd.category)) {
                    const categoryName = CommandCategoryUtil.realName(cmd.category);
                    if (!this.commandListByCategory.has(categoryName)) {
                        this.commandListByCategory.set(categoryName, new Map());
                    }
                    const fullName = (nameChain.length > 0 ? nameChain.join(' ') + ' ' : '') + name;
                    this.commandListByCategory
                        .get(categoryName)
                        .set(fullName, `${fullName} ${this.createCommandArgsString(bot, cmd)}`);
                }
            }
        });
    }

    private async handleHelpQuery(params: CommandParameters<Bot>, args: HelpArgs, embed: MessageEmbed) {
        const { bot, src, guildId } = params;
        embed.setAuthor({ name: bot.name + ' Commands', iconURL: bot.avatarUrl });
        const prefix = await bot.getPrefix(guildId);
        const query = args.query;

        if (!query) {
            // Blank, give all public command categories.
            embed.setTitle('All Command Categories');
            embed.setDescription(
                `You may also use \`@${bot.name} cmd\` to run any command. Public commands are also available as slash commands.\n\nUse \`${prefix}${this.name}\` to view commands in a specific category.`,
            );

            embed.addField('Categories', [...this.commandListByCategory.keys()].join('\n'));
            return;
        }

        if (this.handleHelpQueryBeforeCommands && (await this.handleHelpQueryBeforeCommands(params, args, embed))) {
            return;
        }

        // Check if query is a category.
        let matchedCategory: string = null;
        for (const category of this.commandListByCategory.keys()) {
            if (category.localeCompare(query, undefined, { sensitivity: 'base' }) === 0) {
                matchedCategory = category;
                break;
            }
        }

        if (matchedCategory !== null) {
            // Query is a category.
            embed.setTitle(`${matchedCategory} Commands`);
            const categoryCommands = this.commandListByCategory.get(matchedCategory);
            let commandsString: string;
            if (categoryCommands.size <= this.singleColumnLimit) {
                commandsString = [...categoryCommands.values()].map(value => `${prefix}${value}`).join('\n');
            } else {
                commandsString = [...categoryCommands.keys()].map(value => `\`${prefix}${value}\``).join(', ');
            }

            if (!commandsString) {
                commandsString = 'No commands!';
            }

            embed.setDescription(commandsString);
            return;
        }

        // Check if query is some global command.
        const queryList = query.split(' ');
        let cmd = bot.commands.get(queryList[0]);
        let i = 1;
        while (cmd && cmd.isNested && i < queryList.length) {
            cmd = cmd.subcommandMap.get(queryList[i++]);
        }

        const fullName = queryList.slice(0, i).join(' ');
        if (cmd) {
            // Query is a global command.
            embed.setTitle(`${prefix}${fullName} ${this.createCommandArgsString(bot, cmd)}`);
            embed.addField('Description', cmd.fullDescription());
            embed.addField('Category', CommandCategoryUtil.realName(cmd.category), true);
            embed.addField('Permission', cmd.permission, true);
            embed.addField('Cooldown', cmd.cooldown ? ExpireAgeConversion.toString(cmd.cooldown) : 'None', true);
            if (cmd.args) {
                const argsEntries = Object.entries(cmd.args);
                const argumentsField: string[] = argsEntries
                    .filter(([name, config]) => !config.hidden)
                    .map(([name, config]) => `\`${bot.argString(name, config)}\` - ${config.description}`);
                if (argumentsField.length > 0) {
                    embed.addField('Arguments', argumentsField.join('\n'), true);
                }
            }
            if (cmd.addHelpFields) {
                cmd.addHelpFields(embed);
            }
            if (cmd.examples && cmd.examples.length > 0) {
                embed.addField('Examples', cmd.examples.map(example => `${prefix}${this.name} ${example}`).join('\n'));
            }
            return;
        }

        // Query is not a global command, let the user-defined handler handle this query if there is one.

        if (this.handleHelpQueryAfterCommands && (await this.handleHelpQueryAfterCommands(params, args, embed))) {
            return;
        }

        embed.setTitle('No Command Found');
        embed.setDescription(`Command "${prefix}${args.query}" does not exist.`);
    }

    public async run(params: CommandParameters<Bot>, args: HelpArgs) {
        const { bot, src } = params;

        // Organize commands by category only once, since category shouldn't ever change.
        if (!this.commandListByCategory) {
            this.commandListByCategory = new Map();
            for (const category of bot.commandCategories) {
                if (CommandCategoryUtil.isPublic(category)) {
                    const categoryName = CommandCategoryUtil.realName(category);
                    this.commandListByCategory.set(categoryName, new Map());
                }
            }
            this.addCommandsToCommandListByCategory(bot, bot.commands);
        }

        const embed = bot.createEmbed();
        await this.handleHelpQuery(params, args, embed);
        await src.send({ embeds: [embed] });
    }
}
