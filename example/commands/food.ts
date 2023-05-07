import {
    ArgumentType,
    ArgumentsConfig,
    CommandParameters,
    CommandTypeArray,
    ComplexCommand,
    EmbedTemplates,
    NestedCommand,
    SimpleCommand,
    StandardCooldowns,
} from '../../src';
import { CommandCategory, CommandPermission, ExampleBot } from '../example-bot';

// This file contains a detailed example of a nested command with shared data.

/**
 * Each food group. A subcommand group is generated for each group listed here.
 * Thus, these values should be unique and representable as a command name.
 */
enum FoodGroup {
    Fruit = 'Fruit',
    Vegetable = 'Vegetable',
    Grain = 'Grain',
    Meat = 'Meat',
    Dairy = 'Dairy',
    Other = 'Other',
}

/**
 * Object that provides shared access to the data across all commands.
 */
class SharedFoodData {
    private data: Map<FoodGroup, Set<string>> = new Map();

    constructor() {
        this.clear();
    }

    private getAndAssertGroupSet(group: FoodGroup): Set<string> {
        const set = this.data.get(group);
        if (!set) {
            throw new Error(`Food group with key "${group}" does not exist.`);
        }
        return set;
    }

    public addToGroup(group: FoodGroup, food: string) {
        this.getAndAssertGroupSet(group).add(food);
    }

    public removeFromGroup(group: FoodGroup, food: string) {
        this.getAndAssertGroupSet(group).delete(food);
    }

    public groupToString(group: FoodGroup): string {
        const set = this.getAndAssertGroupSet(group);
        if (set.size === 0) {
            return 'None!';
        }
        return [...set].join(', ');
    }

    public clear() {
        for (const key in FoodGroup) {
            // @ts-ignore
            this.data.set(FoodGroup[key], new Set());
        }
    }
}

interface FoodNameArgs {
    food: string;
}

/**
 * Generates all subcommands for a single food group.
 * @param group Food group.
 * @returns Nested command type for food group.
 */
function makeSubCommandForFoodGroup(group: FoodGroup): new () => NestedCommand<ExampleBot, SharedFoodData> {
    const subcommands: CommandTypeArray<ExampleBot, SharedFoodData> = [];

    subcommands.push(
        class AddSubCommand extends ComplexCommand<ExampleBot, FoodNameArgs, SharedFoodData> {
            public name = 'add';
            public description = 'Adds a food to this group.';
            public category = CommandCategory.Inherit;
            public permission = CommandPermission.Inherit;
            public args: ArgumentsConfig<FoodNameArgs> = {
                food: {
                    description: 'Food name.',
                    type: ArgumentType.RestOfContent,
                    required: true,
                },
            };
            public async run({ bot, src }: CommandParameters<ExampleBot>, args: FoodNameArgs) {
                this.shared.addToGroup(group, args.food);
                const embed = bot.createEmbed(EmbedTemplates.Success);
                embed.setDescription(`Added "${args.food}" to ${group}.`);
                await src.send({ embeds: [embed] });
            }
        },
    );

    subcommands.push(
        class RemoveSubCommand extends ComplexCommand<ExampleBot, FoodNameArgs, SharedFoodData> {
            public name = 'remove';
            public description = 'Removes a food from this group.';
            public category = CommandCategory.Inherit;
            public permission = CommandPermission.Inherit;
            public args: ArgumentsConfig<FoodNameArgs> = {
                food: {
                    description: 'Food name.',
                    type: ArgumentType.RestOfContent,
                    required: true,
                },
            };
            public async run({ bot, src }: CommandParameters<ExampleBot>, args: FoodNameArgs) {
                this.shared.removeFromGroup(group, args.food);
                const embed = bot.createEmbed(EmbedTemplates.Success);
                embed.setDescription(`Removed "${args.food}" from ${group}.`);
                await src.send({ embeds: [embed] });
            }
        },
    );

    subcommands.push(
        class ListSubCommand extends SimpleCommand<ExampleBot, SharedFoodData> {
            public name = 'list';
            public description = 'Lists all of the food in this group.';
            public category = CommandCategory.Inherit;
            public permission = CommandPermission.Inherit;

            public async run({ bot, src }: CommandParameters<ExampleBot>) {
                const embed = bot.createEmbed(EmbedTemplates.Bare);
                embed.setTitle(`Food Group: ${group}`);
                embed.setDescription(this.shared.groupToString(group));
                await src.send({ embeds: [embed] });
            }
        },
    );

    return class FoodGroupCommand extends NestedCommand<ExampleBot, SharedFoodData> {
        public name = group.toLowerCase();
        public description = `Manages the database for the ${group} food group.`;
        public category = CommandCategory.Inherit;
        public permission = CommandPermission.Inherit;

        public flattenHelpForSubCommands = true;

        public subcommands = subcommands;
    };
}

class ListAllFoodSubCommand extends SimpleCommand<ExampleBot, SharedFoodData> {
    public name = 'list';
    public description = 'List all foods.';
    public category = CommandCategory.Inherit;
    public permission = CommandPermission.Inherit;

    public async run({ bot, src }: CommandParameters) {
        const embed = bot.createEmbed(EmbedTemplates.Bare);
        embed.setTitle(`All Foods`);
        for (const key in FoodGroup) {
            embed.addFields({
                // @ts-ignore
                name: `${FoodGroup[key]} Group`,
                // @ts-ignore
                value: this.shared.groupToString(FoodGroup[key]),
                inline: true,
            });
        }
        await src.send({ embeds: [embed] });
    }
}

class ClearAllFoodSubCommand extends SimpleCommand<ExampleBot, SharedFoodData> {
    public name = 'clear';
    public description = 'Clears all groups.';
    public category = CommandCategory.Inherit;
    public permission = CommandPermission.Inherit;

    public async run({ bot, src }: CommandParameters) {
        this.shared.clear();
        const embed = bot.createEmbed(EmbedTemplates.Success);
        embed.setDescription('Successfully cleared all groups.');
        await src.send({ embeds: [embed] });
    }
}

/**
 * Example of a nested command with subcommands and subcommand groups.
 */
export class FoodCommand extends NestedCommand<ExampleBot, SharedFoodData> {
    public name = 'food';
    public description = 'Manages a food database.';
    public category = CommandCategory.Fun;
    public permission = CommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public initializeShared(): SharedFoodData {
        return new SharedFoodData();
    }

    public subcommands = [
        ...Object.values(FoodGroup).map(group => makeSubCommandForFoodGroup(group)),
        ListAllFoodSubCommand,
        ClearAllFoodSubCommand,
    ];
}
