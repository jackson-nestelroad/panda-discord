import {
    ArgumentType,
    ArgumentsConfig,
    CommandParameters,
    ComplexCommand,
    PandaDiscordBot,
    StandardCooldowns,
} from '../../src';
import { CommandCategory, CommandPermission } from '../example-bot';

enum RpsChoice {
    Rock,
    Paper,
    Scissors,
}

interface RpsChoiceConfig {
    beats: Set<RpsChoice>;
    loses: Set<RpsChoice>;
}

interface RpsArgs {
    choice: RpsChoice;
    win: boolean;
}

export class RpsCommand extends ComplexCommand<PandaDiscordBot, RpsArgs> {
    public name = 'rps';
    public description = 'Play Rock Paper Scissors against the bot.';
    public category = CommandCategory.Fun;
    public permission = CommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public readonly choiceMap: { [choice in RpsChoice]: RpsChoiceConfig } = {
        [RpsChoice.Rock]: {
            beats: new Set([RpsChoice.Scissors]),
            loses: new Set([RpsChoice.Paper]),
        },
        [RpsChoice.Paper]: {
            beats: new Set([RpsChoice.Rock]),
            loses: new Set([RpsChoice.Scissors]),
        },
        [RpsChoice.Scissors]: {
            beats: new Set([RpsChoice.Paper]),
            loses: new Set([RpsChoice.Rock]),
        },
    } as const;

    public args: ArgumentsConfig<RpsArgs> = {
        choice: {
            description: 'Choice of rock, paper, or scissors.',
            type: ArgumentType.Integer,
            required: true,
            choices: [
                { name: 'Rock', value: RpsChoice.Rock },
                { name: 'Paper', value: RpsChoice.Paper },
                { name: 'Scissors', value: RpsChoice.Scissors },
            ],
        },
        win: {
            description: 'Force a win.',
            type: ArgumentType.Boolean,
            required: false,
            hidden: true,
        },
    };

    private chooseOptionForBot(): RpsChoice {
        const choices = Object.keys(this.choiceMap);
        return parseInt(choices[Math.floor(Math.random() * choices.length)]);
    }

    public async run({ src }: CommandParameters, args: RpsArgs) {
        const choice = this.choiceMap[args.choice];
        if (!choice) {
            throw new Error(`Missing config for valid option: \`${args.choice}\`.`);
        }

        const botChoice = args.win
            ? (choice.beats.keys().next().value as RpsChoice) ?? this.chooseOptionForBot()
            : this.chooseOptionForBot();

        const reply = `You chose **${RpsChoice[args.choice]}**. I chose **${RpsChoice[botChoice]}**.`;
        let result: string;

        if (choice.beats.has(botChoice)) {
            result = 'You win!';
        } else if (choice.loses.has(botChoice)) {
            result = 'You lose!';
        } else {
            result = "It's a tie!";
        }

        await src.send(reply + '\n' + result);
    }
}
