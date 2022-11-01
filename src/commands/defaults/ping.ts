import { PandaDiscordBot } from '../../bot';
import { DefaultCommandCategory } from '../category';
import { SimpleCommand, StandardCooldowns } from '../chat-input';
import { CommandParameters } from '../params';
import { DefaultCommandPermission } from '../permission';

/**
 * Ping command for checking if the bot is still alive.
 */
export class PingCommand extends SimpleCommand<PandaDiscordBot> {
    public name = 'ping';
    public description = 'Checks if the bot is still alive.';
    public category = DefaultCommandCategory.Utility;
    public permission = DefaultCommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public async run({ bot, src }: CommandParameters<PandaDiscordBot>) {
        const start = new Date();
        const newMsg = await src.send('Pong!');
        const end = new Date();
        await newMsg.edit(`Pong! (${end.valueOf() - start.valueOf()} ms)`);
    }
}
