import * as DiscordJS from 'discord.js';

import { ArgumentType, ArgumentsConfig } from '../arguments';
import { ChatCommandParameters, CommandParameters } from '../params';
import { ComplexCommand, LegacyCommand } from '../base';

import { DefaultCommandCategory } from '../category';
import { DefaultCommandPermission } from '../permission';
import { DiscordUtil } from '../../util/discord';
import { EvalUtil } from '../../util/eval';
import { PandaDiscordBot } from '../../bot';

interface EvalArgs {
    code: string;
    silent: boolean;
}

// This command is heavily unsafe, use at your own risk
export class EvalCommand extends ComplexCommand<PandaDiscordBot, EvalArgs> {
    public name = 'eval';
    public description = 'Executes arbitrary JavaScript and returns the result. Be careful!';
    public category = DefaultCommandCategory.Secret;
    public permission = DefaultCommandPermission.Owner;

    public disableSlash = true;

    public args: ArgumentsConfig<EvalArgs> = {
        code: {
            description: 'Code to run. May be put in a code line or code block.',
            type: ArgumentType.RestOfContent,
            required: true,
        },
        silent: {
            description: 'Silence result output?',
            type: ArgumentType.Boolean,
            required: false,
            named: true,
            default: false,
        },
    };

    public readonly maxLength = 1900;
    public sensitivePattern: RegExp = null;

    public async run(params: CommandParameters, args: EvalArgs) {
        const { bot, src } = params;

        if (!this.sensitivePattern) {
            this.sensitivePattern = new RegExp(`${bot.client.token}`, 'g');
        }

        // Parse code from code blocks/lines
        const code = DiscordUtil.getCodeBlockOrLine(args.code)?.result?.content ?? args.code;

        let res = await EvalUtil.runCodeToString(code, {
            params,
            bot,
            src,
            discord: DiscordJS,
            setTimeout,
            setInterval,
            clearInterval,
        });
        if (res.length > this.maxLength) {
            res = res.substr(0, this.maxLength) + '...';
        }
        res = res.replace(this.sensitivePattern, '???');
        if (!args.silent) {
            await src.send(`\`\`\`javascript\n${res}\n\`\`\``);
        }
    }
}
