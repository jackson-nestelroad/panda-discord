import { ArgumentType, ArgumentsConfig, CommandParameters, ComplexCommand, StandardCooldowns } from '../../src';
import { CommandCategory, CommandPermission, ExampleBot } from '../example-bot';

enum EightBallResponse {
    Positive,
    Neutral,
    Negative,
}

interface EightBallArgs {
    question?: string;
    response?: EightBallResponse;
}

export class EightBallCommand extends ComplexCommand<ExampleBot, EightBallArgs> {
    public name = '8ball';
    public description = 'Shakes the Magic 8-ball for a glimpse into the future.';
    public category = CommandCategory.Fun;
    public permission = CommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public args: ArgumentsConfig<EightBallArgs> = {
        question: {
            description: 'Question to ask.',
            type: ArgumentType.RestOfContent,
            required: false,
        },
        response: {
            description: 'Type of response',
            type: ArgumentType.Integer,
            required: false,
            hidden: true,
            choices: [
                { name: 'Positive', value: EightBallResponse.Positive },
                { name: 'Neutral', value: EightBallResponse.Neutral },
                { name: 'Negative', value: EightBallResponse.Negative },
            ],
        },
    };

    public readonly options = [
        'It is certain.',
        'It is decidedly so.',
        'Without a doubt.',
        'Yes, definitely.',
        'You may rely on it.',
        'As I see it, yes.',
        'Most likely.',
        'Outlook good.',
        'Yes.',
        'Signs point to yes.',
        'Reply hazy, try again.',
        'Ask again later.',
        'Better not tell you now.',
        'Cannot predict now.',
        'Concentrate and ask again.',
        "Don't count on it.",
        'My reply is no.',
        'My sources say no.',
        'Outlook not so good.',
        'Very doubtful.',
    ];

    public async run({ src }: CommandParameters<ExampleBot>, args: EightBallArgs) {
        let start = 0;
        let length = this.options.length;
        if (args.response !== undefined) {
            switch (args.response) {
                case EightBallResponse.Positive:
                    start = 0;
                    length = 10;
                    break;
                case EightBallResponse.Neutral:
                    start = 10;
                    length = 5;
                    break;
                case EightBallResponse.Neutral:
                    start = 15;
                    length = 5;
                    break;
            }
        }
        const response = this.options[start + Math.floor(Math.random() * length)];
        await src.send(':8ball: - ' + response);
    }
}
