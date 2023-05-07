import { CommandParameters, NestedCommand, SimpleCommand, StandardCooldowns } from '../../src';
import { CommandCategory, CommandPermission, ExampleBot } from '../example-bot';

class Timer {
    public constructor() {
        this.reset();
    }

    public start(): void {
        this.running = true;
        this.startTime = new Date().valueOf();
    }

    public stop(): void {
        this.running = false;
        this.internalValue += new Date().valueOf() - this.startTime;
        this.startTime = 0;
    }

    public reset(): void {
        this.running = false;
        this.internalValue = 0;
        this.startTime = 0;
    }

    public value(): number {
        return this.internalValue + (this.running ? new Date().valueOf() - this.startTime : 0);
    }

    public running: boolean;
    public internalValue: number;
    public startTime: number;
}

class StartSubcommand extends SimpleCommand<ExampleBot, Timer> {
    public name = 'start';
    public description = 'Starts the stopwatch.';
    public category = CommandCategory.Inherit;
    public permission = CommandPermission.Everyone;

    public async run({ src }: CommandParameters) {
        if (this.shared.running) {
            throw new Error('Stopwatch already running.');
        }
        this.shared.start();
        await src.send({ content: 'Stopwatch started.' });
    }
}

class StopSubcommand extends SimpleCommand<ExampleBot, Timer> {
    public name = 'stop';
    public description = 'Stops the stopwatch.';
    public category = CommandCategory.Inherit;
    public permission = CommandPermission.Everyone;

    public async run({ src }: CommandParameters) {
        if (!this.shared.running) {
            throw new Error('Stopwatch not running.');
        }
        this.shared.stop();
        await src.send({ content: `Stopwatch stopped at ${this.shared.value()}ms.` });
    }
}

class ResetSubcommand extends SimpleCommand<ExampleBot, Timer> {
    public name = 'reset';
    public description = 'Resets the stopwatch. Only moderators can use this subcommand.';
    public category = CommandCategory.Inherit;
    public permission = CommandPermission.Mod;

    public async run({ src }: CommandParameters) {
        this.shared.reset();
        await src.send({ content: `Stopwatch reset.` });
    }
}

class ValueSubcommand extends SimpleCommand<ExampleBot, Timer> {
    public name = 'value';
    public description = "Displays the stopwatch's value.";
    public category = CommandCategory.Inherit;
    public permission = CommandPermission.Everyone;

    public async run({ src }: CommandParameters) {
        await src.send({ content: `${this.shared.value()}ms` });
    }
}

export class StopwatchCommand extends NestedCommand<ExampleBot, Timer> {
    public name = 'stopwatch';
    public description = 'Starts and stops a stopwatch.';
    public category = CommandCategory.Utility;
    public permission = CommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public initializeShared(): Timer {
        return new Timer();
    }

    public subcommands = [StartSubcommand, StopSubcommand, ResetSubcommand, ValueSubcommand];
}
