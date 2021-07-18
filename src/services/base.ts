import { PandaDiscordBot } from '../bot';

/**
 * A service is a class instance attached to the global bot object that can
 * be accessed by multiple commands. Services are the most consistent way
 * to store state and common methods across multiple commands.
 */
export abstract class BaseService<Bot extends PandaDiscordBot> {
    constructor(protected bot: Bot) {}
}
