import { inspect } from 'util';
import { createContext, runInContext } from 'vm';

/**
 * Utility functions for running eval JavaScript code.
 */
export namespace EvalUtil {
    /**
     * Runs JavaScript code in the given context.
     * @param code Code to execute.
     * @param context Context to run the code in.
     * @returns Promise for the result of the evaluated code.
     */
    export function runCode(code: string, context: any): Promise<string> {
        return runInContext(code, createContext(context, { codeGeneration: { strings: false, wasm: false } }));
    }

    /**
     * Runs JavaScript code in the given context and formats the result.
     *
     * Objects will be formatted using `inspect`.
     * @param code Code to execute.
     * @param context Context to run the code in.
     * @returns Promise for the result of the evaluated code.
     */
    export async function runCodeToString(code: string, context: any): Promise<string> {
        let res: any;
        try {
            res = await runCode(code, context);
        } catch (error) {
            res = `Error: ${error ? error.message || error : error}`;
        }
        if (typeof res !== 'string') {
            res = inspect(res, { depth: 0 });
        }
        return res;
    }
}
