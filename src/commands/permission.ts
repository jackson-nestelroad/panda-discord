/**
 * Default command permissions supported by the bot framework.
 *
 * You should use your own enum or set of strings for new
 * permission schemes, but still use these values if using
 * default commands.
 */
export enum DefaultCommandPermission {
    Everyone = 'Everyone',
    Owner = 'Owner',
    Inherit = '_Inherit',
}
