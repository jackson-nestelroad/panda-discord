import { Intents } from 'discord.js';
import { EvalCommand, HelpCommand, PingCommand } from '../src';
import { EightBallCommand } from './commands/8ball';
import { FoodCommand } from './commands/food';
import { PurgeCommand } from './commands/purge';
import { ExampleBot } from './example-bot';

(async () => {
    const bot = new ExampleBot({
        owner: '181877391738535936',
        commands: [PingCommand, HelpCommand, EvalCommand, EightBallCommand, PurgeCommand, FoodCommand],
        client: {
            intents: [
                Intents.FLAGS.GUILDS,
                Intents.FLAGS.GUILD_MEMBERS,
                Intents.FLAGS.GUILD_MESSAGES,
                Intents.FLAGS.DIRECT_MESSAGES,
            ],
        },
    });
    await bot.run('MTg0MTU2NTExMzYxMDQwMzg0.V0KDHQ.pWy3m9gQbPnjzs32fypVBAOVu4s');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
