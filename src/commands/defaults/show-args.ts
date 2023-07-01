import { PandaDiscordBot } from '../../bot';
import { EmbedTemplates } from '../../embeds/options';
import { SplitArgumentArray } from '../../util/argument-splitter';
import { ArgumentType, ArgumentsConfig } from '../arguments';
import { DefaultCommandCategory } from '../category';
import { ComplexCommand, StandardCooldowns } from '../chat-input';
import { CommandParameters } from '../params';
import { DefaultCommandPermission } from '../permission';

interface ShowArgsArgs {
    args: SplitArgumentArray;
}

export class ShowArgsCommand extends ComplexCommand<PandaDiscordBot, ShowArgsArgs> {
    public name = 'show-args';
    public description = 'Shows the chat command arguments and how they were split by the bot.';
    public category = DefaultCommandCategory.Utility;
    public permission = DefaultCommandPermission.Everyone;
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
                embed.addFields({ name: `Argument ${i}`, value: args.args.get(i), inline: true });
            }
        }
        await src.send({ embeds: [embed] });
    }
}
