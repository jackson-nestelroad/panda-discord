import {
    ArgumentType,
    ArgumentsConfig,
    CommandParameters,
    ComplexCommand,
    EmbedTemplates,
    StandardCooldowns,
} from '../../src';
import { CommandCategory, CommandPermission, ExampleBot } from '../example-bot';
import { GuildMember, TextChannel } from 'discord.js';

interface PurgeArgs {
    user: GuildMember;
    count: number;
    channel?: TextChannel;
}

export class PurgeCommand extends ComplexCommand<ExampleBot, PurgeArgs> {
    public name = 'purge';
    public description = 'Purges the most recent chunk of messages from a given user in a channel.';
    public category = CommandCategory.Staff;
    public permission = CommandPermission.Mod;
    public cooldown = StandardCooldowns.High;

    public readonly defaultNumberToDelete: number = 100;

    public args: ArgumentsConfig<PurgeArgs> = {
        user: {
            description: 'Author of messages to delete.',
            type: ArgumentType.User,
            required: true,
        },
        count: {
            description: `Number of messages to delete. Default is ${this.defaultNumberToDelete}.`,
            type: ArgumentType.Integer,
            required: false,
            default: this.defaultNumberToDelete,
        },
        channel: {
            description: 'Text channel to delete messages from. Default is current channel.',
            type: ArgumentType.Channel,
            required: false,
            transformers: {
                any: (channel, result) => {
                    if (channel.type !== 'GUILD_TEXT') {
                        result.error = 'Channel must be a text channel.';
                    } else {
                        result.value = channel as TextChannel;
                    }
                },
            },
        },
    };

    public async run({ bot, src }: CommandParameters<ExampleBot>, args: PurgeArgs) {
        if (args.count <= 0) {
            throw new Error('Number of messages to delete must be a positive integer.');
        }
        if (!args.channel) {
            args.channel = src.channel;
        }

        const channelHistory = await args.channel.messages.fetch({ limit: 100 });
        const toDelete = channelHistory.filter(msg => msg.author.id === args.user.id).first(args.count);

        const deleted = await args.channel.bulkDelete(toDelete, true);
        const embed = bot.createEmbed(EmbedTemplates.Success);
        embed.setDescription(
            `Purged ${deleted.size} messages from ${args.user.user.username} in ${args.channel.toString()}.`,
        );
        await src.reply({ embeds: [embed] });
    }
}
