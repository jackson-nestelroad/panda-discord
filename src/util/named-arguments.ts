import { SplitArgumentArray } from './argument-splitter';

export interface NamedArgumentPattern {
    prefix: string;
    separator: string;
    separatorRequired?: boolean;
}

export interface NamedArgument {
    name: string;
    value: string;
}

export interface ExtractedArgs {
    named: NamedArgument[];
    unnamed: SplitArgumentArray;
}

export function validateNamedArgsPattern(pattern: NamedArgumentPattern): void {
    if (/\s/g.test(pattern.prefix) || /\s/g.test(pattern.separator)) {
        throw new Error(`Named argument pattern cannot contain whitespace.`);
    }
}

/**
 * Extracts named arguments out of the split argument array for separate processing.
 * @param args Original split arguments.
 * @param pattern Pattern to detect named arguments by.
 * @returns An array of named arguments and the leftover unnamed arguments.
 */
export function extractNamedArgs(args: SplitArgumentArray, pattern: NamedArgumentPattern): ExtractedArgs {
    const named: NamedArgument[] = [];
    for (let i = 0; i < args.length; ++i) {
        const arg = args.args[i];
        // Named arguments must not start in a group.
        if (arg.isNormal() && arg.content.startsWith(pattern.prefix)) {
            // Found a named argument.
            let name: string;
            let value: string;
            const separatorIndex = arg.content.indexOf(pattern.separator);
            if (separatorIndex > pattern.prefix.length) {
                name = arg.content.substring(pattern.prefix.length, separatorIndex);
                // There should be a value after the separator, but this is not guaranteed.
                value = arg.content.substr(separatorIndex + 1);
                if (!value) {
                    // Try using the next argument.
                    // Only use it if it is some kind of group.
                    const nextArg = args.args[i + 1];
                    if (nextArg && !nextArg.isNormal()) {
                        value = nextArg.content;
                        args = args.remove(i + 1);
                    } else {
                        // No value, just ignore it completely.
                        continue;
                    }
                }
            } else if (!pattern.separatorRequired && separatorIndex === -1) {
                // No separator, must be a boolean.
                name = arg.content.substr(pattern.prefix.length);
                value = 'true';
            } else {
                continue;
            }

            // Record the named argument.
            named.push({ name, value });
            // Remove the argument.
            args = args.remove(i--);
        }
    }
    return {
        named,
        unnamed: args,
    };
}