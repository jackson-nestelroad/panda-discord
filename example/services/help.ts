import { EmbedBuilder } from 'discord.js';

import {
    BaseHelpService,
    BuiltInHelpHandlers,
    HelpHandler,
    HelpHandlerMatcherReturnType,
    HelpServiceArgs,
    HelpServiceContext,
} from '../../src';
import { ExampleBot } from '../example-bot';

class BotNameHelpHandler extends HelpHandler<ExampleBot> {
    public async match({ bot }: HelpServiceContext, { query }: HelpServiceArgs): Promise<HelpHandlerMatcherReturnType> {
        return bot.name.localeCompare(query, undefined, { sensitivity: 'base' }) === 0;
    }

    public async run({ bot }: HelpServiceContext, args: HelpServiceArgs, embed: EmbedBuilder): Promise<void> {
        embed.setDescription(
            `Hello! I am ${bot.name}. I was created as an example of using the Panda command framework.`,
        );
    }
}

export class HelpService extends BaseHelpService {
    public handlers = [
        BuiltInHelpHandlers.BlankHelpHandler,
        BuiltInHelpHandlers.CategoryHelpHandler,
        BuiltInHelpHandlers.CommandHelpHandler,
        BotNameHelpHandler,
        BuiltInHelpHandlers.CatchAllHandler,
    ];
}
