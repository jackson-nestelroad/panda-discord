import { GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';

import { EnabledCommandType, EvalCommand, HelpCommand, NamedArgsOption, PingCommand } from '../src';
import { EightBallCommand } from './commands/8ball';
import { FoodCommand } from './commands/food';
import { GreetCommand } from './commands/greet';
import { PurgeCommand } from './commands/purge';
import { RenameFileCommand } from './commands/rename-file';
import { RpsCommand } from './commands/rps';
import { ShowArgsCommand } from './commands/show-args';
import { TopicCommand } from './commands/topic';
import { ExampleBot } from './example-bot';

config();

(async () => {
    const bot = new ExampleBot({
        owner: '181877391738535936',
        commands: [
            PingCommand,
            HelpCommand,
            EvalCommand,
            EightBallCommand,
            GreetCommand,
            PurgeCommand,
            FoodCommand,
            ShowArgsCommand,
            RpsCommand,
            TopicCommand,
            RenameFileCommand,
        ],
        client: {
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
        },
        namedArgs: NamedArgsOption.Always,
        commandType: EnabledCommandType.Chat | EnabledCommandType.Application,
    });
    await bot.run(process.env.TOKEN);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
