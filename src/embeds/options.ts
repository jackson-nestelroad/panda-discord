import { EmbedBuilder } from 'discord.js';

import { PandaDiscordBot } from '../bot';

/**
 * Types of embeds that can be created from templates.
 */
export enum EmbedType {
    Normal,
    Error,
    Warning,
    Success,
}

type ExcludeFunctionProps<T> = Omit<T, { [K in keyof T]-?: T[K] extends Function ? K : never }[keyof T]>;
type PartialProps<T> = ExcludeFunctionProps<T> | Partial<T>;
export type EmbedProps = PartialProps<EmbedOptions>;

/**
 * Options for creating an embed.
 */
export class EmbedOptions {
    public footer: boolean | string = true;
    public timestamp: boolean = false;
    public type: EmbedType = EmbedType.Normal;
    public color: `#${string}`;

    private readonly defaultColors = {
        error: '#F04947',
        warning: '#FFBE00',
        success: '#43B581',
        blank: '#2F3136',
    } as const;

    public constructor(props?: PartialProps<EmbedProps>) {
        // Assign props after default values have been assigned.
        if (props) {
            Object.assign(this, props);
        }
    }

    /**
     * Create an embed for the given bot.
     * @param bot Panda bot.
     * @returns New message embed.
     */
    public create(bot: PandaDiscordBot): EmbedBuilder {
        const embed = new EmbedBuilder();

        if (this.color) {
            embed.setColor(this.color);
        } else {
            switch (this.type) {
                case EmbedType.Error:
                    embed.setColor(this.defaultColors.error);
                    break;
                case EmbedType.Warning:
                    embed.setColor(this.defaultColors.warning);
                    break;
                case EmbedType.Success:
                    embed.setColor(this.defaultColors.success);
                    break;
                default:
                    embed.setColor(bot.color);
                    break;
            }
        }

        if (this.timestamp) {
            embed.setTimestamp();
        }

        if (this.footer) {
            embed.setFooter({ text: typeof this.footer === 'string' ? this.footer : bot.name, iconURL: bot.avatarUrl });
        }

        return embed;
    }
}

/**
 * Embed templates that can be used to quickly create uniform embeds.
 */
export namespace EmbedTemplates {
    /**
     * An embed communicating a successful operation.
     */
    export const Success = new EmbedOptions({ footer: false, type: EmbedType.Success });

    /**
     * An embed communicating a warning.
     */
    export const Warning = new EmbedOptions({ footer: false, type: EmbedType.Warning });

    /**
     * An embed communicating an error.
     */
    export const Error = new EmbedOptions({ footer: false, type: EmbedType.Error });

    /**
     * A bare embed with nothing added yet.
     */
    export const Bare = new EmbedOptions({ footer: false });

    /**
     * An embed for recording an event at some specific time.
     */
    export const Log = new EmbedOptions({ footer: true, timestamp: true });
}
