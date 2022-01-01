import { EvalCommand, HelpCommand, NamedArgsOption, PingCommand } from '../src';

import { EightBallCommand } from './commands/8ball';
import { ExampleBot } from './example-bot';
import { FoodCommand } from './commands/food';
import { Intents } from 'discord.js';
import { PurgeCommand } from './commands/purge';
import { RpsCommand } from './commands/rps';
import { ShowArgsCommand } from './commands/show-args';

(async () => {
    const bot = new ExampleBot({
        owner: '181877391738535936',
        commands: [
            PingCommand,
            HelpCommand,
            EvalCommand,
            EightBallCommand,
            PurgeCommand,
            FoodCommand,
            ShowArgsCommand,
            RpsCommand,
        ],
        client: {
            intents: [
                Intents.FLAGS.GUILDS,
                Intents.FLAGS.GUILD_MEMBERS,
                Intents.FLAGS.GUILD_MESSAGES,
                Intents.FLAGS.DIRECT_MESSAGES,
            ],
        },
        namedArgs: NamedArgsOption.IfNeeded,
    });
    await bot.run('TOKEN_HERE');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
