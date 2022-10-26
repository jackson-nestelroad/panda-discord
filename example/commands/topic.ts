import { ChannelType, GuildBasedChannel, PermissionFlagsBits } from 'discord.js';

import { ArgumentType, ArgumentsConfig, CommandParameters, ComplexCommand, StandardCooldowns } from '../../src';
import { CommandCategory, CommandPermission, ExampleBot } from '../example-bot';

interface TopicArgs {
    topic: string;
    channel?: GuildBasedChannel;
}

export class TopicCommand extends ComplexCommand<ExampleBot, TopicArgs> {
    public name = 'topic';
    public description = 'Sets the topic for the given channel.';
    public category = CommandCategory.Utility;
    public permission = CommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public memberPermissions = PermissionFlagsBits.ManageChannels;

    public args: ArgumentsConfig<TopicArgs> = {
        topic: {
            description: 'New channel topic.',
            type: ArgumentType.RestOfContent,
            required: true,
        },
        channel: {
            description: 'Channel to set topic of. Defaults to current channel.',
            type: ArgumentType.Channel,
            named: true,
            required: false,
            channelTypes: [ChannelType.GuildText],
        },
    };

    public async run({ src }: CommandParameters<ExampleBot>, args: TopicArgs) {
        const channel = args.channel ?? src.channel;
        if (!channel.isTextBased() || channel.isDMBased() || channel.isVoiceBased() || channel.isThread()) {
            throw new Error('Cannot set the topic of that channel.');
        }

        await channel.setTopic(args.topic);
        await src.reply({ content: 'Done!', ephemeral: true });
    }
}
