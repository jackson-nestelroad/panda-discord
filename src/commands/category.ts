/**
 * Default command categories supported by the bot framework.
 *
 * You should use your own enum or set of strings for new
 * category schemes, but still use these values if using
 * default commands.
 *
 * Private command categories (ones that do not appear on the help
 * category page) must be prefixed with an underscore (`_`).
 */
export enum DefaultCommandCategory {
    Utility = 'Utility',
    Secret = '_Secret',
    Inherit = '_Inherit',
}

/**
 * Utility functions for working with command categories.
 */
export namespace CommandCategoryUtil {
    /**
     * Checks if a command is public for the help page.
     * @param category Category string.
     * @returns Is the category public?
     */
    export function isPublic(category: string): boolean {
        return category[0] !== '_';
    }

    /**
     * Returns the real name of a category by removing any underscore
     * prefixes.
     * @param category Category string.
     * @returns Category string with out prefixes.
     */
    export function realName(category: string): string {
        return category[0] === '_' ? (category[1] === '_' ? category.substr(2) : category.substr(1)) : category;
    }
}
