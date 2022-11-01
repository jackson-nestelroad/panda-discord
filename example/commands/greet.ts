import {
    ActionRowBuilder,
    GuildMember,
    ModalActionRowComponentBuilder,
    ModalBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';

import {
    ArgumentType,
    ArgumentsConfig,
    CommandParameters,
    CommandSource,
    ComplexCommand,
    GuildMemberContextMenuCommand,
    InteractionCommandParameters,
    StandardCooldowns,
} from '../../src';
import { CommandCategory, CommandPermission, ExampleBot } from '../example-bot';

interface GreetArgs {
    target: GuildMember;
    greeting: string;
}

class GreetContextMenuCommand extends GuildMemberContextMenuCommand<ExampleBot, GreetArgs> {
    public name = 'Greet User';

    public async run(params: InteractionCommandParameters<ExampleBot>, member: GuildMember) {
        const { bot, src } = params;
        const modal = new ModalBuilder().setCustomId('greetModal').setTitle(`Greet ${member.user.tag}`);
        modal.addComponents(
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('greetingInput')
                    .setLabel('Greeting')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(),
            ),
        );
        await src.interaction.showModal(modal);
        let modalSubmit: ModalSubmitInteraction;
        try {
            modalSubmit = await src.interaction.awaitModalSubmit({
                filter: interaction => {
                    return interaction.customId === 'greetModal' && interaction.user.id === src.author.id;
                },
                time: 5 * 60 * 1000,
            });
        } catch (error) {
            throw new Error('You did not respond in time. Please try again.');
        }

        const greeting = modalSubmit.fields.getTextInputValue('greetingInput').trim();

        const newParams: CommandParameters<ExampleBot> = params;
        newParams.src = new CommandSource(modalSubmit);
        try {
            await this.command.run(
                newParams,
                await this.command.parseArguments(newParams, { greeting }, { target: member }),
            );
        } catch (error) {
            bot.sendError(newParams.src, error);
        }
    }
}

export class GreetCommand extends ComplexCommand<ExampleBot, GreetArgs> {
    public name = 'greet';
    public description = 'Greets another user.';
    public category = CommandCategory.Fun;
    public permission = CommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public contextMenu = [GreetContextMenuCommand];

    public args: ArgumentsConfig<GreetArgs> = {
        target: {
            description: 'User to greet.',
            type: ArgumentType.User,
            required: true,
        },
        greeting: {
            description: 'Greeting to send.',
            type: ArgumentType.RestOfContent,
            required: false,
            default: 'Hello!',
        },
    };

    public async run({ src }: CommandParameters<ExampleBot>, args: GreetArgs) {
        await src.send({ content: `${args.target.toString()}, ${src.author.toString()} says "${args.greeting}"` });
    }
}
