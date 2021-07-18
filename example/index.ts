import { EvalCommand, HelpCommand, PingCommand } from '../src';
import { EightBallCommand } from './commands/8ball';
import { PurgeCommand } from './commands/purge';
import { ExampleBot } from './example-bot';

(async () => {
    const bot = new ExampleBot({
        owner: '181877391738535936',
        commands: [PingCommand, HelpCommand, EvalCommand, EightBallCommand, PurgeCommand],
    });
    await bot.run('TOKEN_HERE');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
