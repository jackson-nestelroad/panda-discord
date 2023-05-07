import { PandaDiscordBot } from '../../bot';
import { ArgumentType, ArgumentsConfig } from '../arguments';
import { DefaultCommandCategory } from '../category';
import { ComplexCommand, StandardCooldowns } from '../chat-input';
import { CommandParameters } from '../params';
import { DefaultCommandPermission } from '../permission';

interface HelpArgs {
    query?: string;
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
            autocomplete: ({ bot, guildId, value }) => {
                return bot.helpService?.autocomplete({ bot, guildId }, value) ?? [];
            },
        },
    };

    public async run({ bot, src, guildId }: CommandParameters<Bot>, args: HelpArgs) {
        if (!bot.helpService) {
            throw new Error(`No help service is installed on the bot.`);
        }

        const embed = await bot.helpService.help({ bot, guildId }, { query: args.query ?? '' });
        await src.send({ embeds: [embed] });
    }
}
