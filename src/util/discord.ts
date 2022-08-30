import { ApplicationCommand, Channel, ChatInputApplicationCommandData, GuildMember, Role, User } from 'discord.js';

export type Mentionable = GuildMember | User | Role;

export interface DiscordCodeMarkup {
    readonly language?: string;
    readonly content: string;
    readonly isBlock: boolean;
}

/**
 * Collection of utility functions and variables related to Discord.
 */
export namespace DiscordUtil {
    // Parses a single code block.
    export const codeBlockRegex = /```(?:([^\s`]*)\n)?((?:(?:[^`]|`[^`]|``[^`])|\n)+)\n?```/s;
    // Parses a single line of code.
    export const codeLineRegex = /(`{1,2})([^`]*)\1/;
    // Parses a user mention.
    export const userMentionRegex = /^<@!?(\d+)>$/;
    // Parses a channel mention.
    export const channelMentionRegex = /^<#(\d+)>$/;
    // Parses a role mention.
    export const roleMentionRegex = /^<@&(\d+)>$/;
    // Parses an ambiguous mention.
    export const ambiguousMentionRegex = /^<(@(?:!?|&?))(\d+)>$/;

    /**
     * Common result interface for parsing data from a message.
     */
    export interface RegexMatchResult<T> {
        // Did the regex match?
        match: boolean;
        // Index the regex matched at.
        index: number;
        // Data parsed from the match.
        result?: T;
    }

    /**
     * Parses the content of the first code block in the string.
     * @param content Content to parse.
     * @returns Result object.
     */
    export function getCodeBlock(content: string): RegexMatchResult<DiscordCodeMarkup> {
        const result: RegexMatchResult<DiscordCodeMarkup> = { match: false, index: -1 };
        const match = codeBlockRegex.exec(content);
        if (match) {
            result.match = true;
            result.index = match.index;
            result.result = { language: match[1], content: match[2], isBlock: true };
        }
        return result;
    }

    /**
     * Parses the content of the first code line in the string.
     * @param content Content to parse.
     * @returns Result object.
     */
    export function getCodeLine(content: string): RegexMatchResult<DiscordCodeMarkup> {
        const result: RegexMatchResult<DiscordCodeMarkup> = { match: false, index: -1 };
        const match = codeLineRegex.exec(content);
        if (match) {
            result.match = true;
            result.index = match.index;
            result.result = { content: match[2], isBlock: false };
        }
        return result;
    }

    /**
     * Parses the content of the first code block or code line in the string.
     * Checks for code blocks first, then for code lines.
     * @param content Content to parse.
     * @returns Result object.
     */
    export function getCodeBlockOrLine(content: string): RegexMatchResult<DiscordCodeMarkup> {
        const codeBlock = DiscordUtil.getCodeBlock(content);
        if (codeBlock.match) {
            return codeBlock;
        } else {
            const codeLine = DiscordUtil.getCodeLine(content);
            if (codeLine.match) {
                return codeLine;
            }
        }
        return { match: false, index: -1 };
    }

    /**
     * Checks deep equality of two objects.
     * @param a First object.
     * @param b Second object.
     * @returns Equal?
     */
    function deepEqual(a: object, b: object): boolean {
        if (a && b && typeof a === 'object' && typeof b === 'object') {
            // Use the keys in the object with the most keys. We do this to account
            // for keys that may be set to undefined in one object but not present in
            // another. Both shoulde evaluate to undefined, but this logic makes sure
            // no key is overlooked.
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            const maxKeys = keysA.length > keysB.length ? keysA : keysB;

            for (const key of maxKeys) {
                if (!deepEqual(a[key], b[key])) {
                    return false;
                }
            }
            return true;
        } else {
            return a === b;
        }
    }

    /**
     * Checks if an application command needs an update based on its old data and new data.
     * @param old Old command data.
     * @param newData New command data.
     * @returns Should the command be updated (are they different)?
     */
    export function slashCommandNeedsUpdate(
        old: ApplicationCommand,
        newData: ChatInputApplicationCommandData,
    ): boolean {
        // First check description and options length.
        let needsUpdate = old.name !== newData.name;
        needsUpdate ||= old.description !== newData.description;
        needsUpdate ||= !(
            old.defaultMemberPermissions?.equals(newData.defaultMemberPermissions) ??
            newData.defaultMemberPermissions === null
        );
        needsUpdate ||= old.dmPermission !== newData.dmPermission;
        needsUpdate ||= old.options.length !== (newData.options?.length ?? 0);

        // Options lengths are the same, so check every option.
        for (let i = 0; !needsUpdate && i < old.options.length; ++i) {
            const a = old.options[i];
            const b = newData.options[i];

            // Check base fields.
            needsUpdate ||=
                a.name !== b.name ||
                a.description !== b.description ||
                !!a['required'] !== !!b['required'] ||
                // Old command stores a string, new data can store an integer or string
                // Just make sure to store a string so this comparison works!
                a.type !== b.type ||
                // Compare the choices and nested options themselves.
                !deepEqual(a['choices'] ?? [], b['choices'] ?? []) ||
                !deepEqual(a['options'] ?? [], b['options'] ?? []);
        }
        return needsUpdate;
    }
}
