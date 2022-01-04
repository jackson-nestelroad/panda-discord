import {
    ArgumentType,
    ArgumentsConfig,
    CommandParameters,
    ComplexCommand,
    EmbedTemplates,
    SplitArgumentArray,
    StandardCooldowns,
} from '../../src';
import { CommandCategory, CommandPermission, ExampleBot } from '../example-bot';

interface ShowArgsArgs {
    args: SplitArgumentArray;
}

export class ShowArgsCommand extends ComplexCommand<ExampleBot, ShowArgsArgs> {
    public name = 'show-args';
    public description = 'Shows the chat command arguments and how they were split by the bot.';
    public category = CommandCategory.Utility;
    public permission = CommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public args: ArgumentsConfig<ShowArgsArgs> = {
        args: {
            type: ArgumentType.SplitArguments,
            description: 'Arguments to parse.',
            required: false,
        },
    };

    public async run({ bot, src }: CommandParameters, args: ShowArgsArgs) {
        const embed = bot.createEmbed(EmbedTemplates.Bare);
        embed.setTitle('Command Arguments');
        if (!args.args || args.args.length === 0) {
            embed.setDescription('None!');
        } else {
            for (let i = 0; i < args.args.length; ++i) {
                embed.addField(`Argument ${i}`, args.args.get(i), true);
            }
        }
        await src.send({ embeds: [embed] });
    }
}
