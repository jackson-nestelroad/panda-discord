import { Attachment, AttachmentBuilder } from 'discord.js';

import { ArgumentType, ArgumentsConfig, CommandParameters, ComplexCommand, StandardCooldowns } from '../../src';
import { CommandCategory, CommandPermission, ExampleBot } from '../example-bot';

interface RenameFileArgs {
    file: Attachment;
    name: string;
    description?: string;
    spoiler?: boolean;
}

export class RenameFileCommand extends ComplexCommand<ExampleBot, RenameFileArgs> {
    public name = 'rename-file';
    public description = 'Renames the given file by reuploading it with a new name.';
    public category = CommandCategory.Utility;
    public permission = CommandPermission.Everyone;
    public cooldown = StandardCooldowns.Low;

    public args: ArgumentsConfig<RenameFileArgs> = {
        file: {
            description: 'Attachment.',
            type: ArgumentType.Attachment,
            required: true,
        },
        name: {
            description: 'New name.',
            type: ArgumentType.RestOfContent,
            required: true,
        },
        description: {
            description: 'Description',
            type: ArgumentType.RestOfContent,
            named: true,
            required: false,
        },
        spoiler: {
            description: 'Spoiler the new attachment?',
            type: ArgumentType.Boolean,
            named: true,
            required: false,
            default: false,
        },
    };

    public async run({ src }: CommandParameters<ExampleBot>, args: RenameFileArgs) {
        await src.reply({
            files: [
                new AttachmentBuilder(args.file.attachment, {
                    name: args.name,
                    description: args.description,
                }).setSpoiler(args.spoiler),
            ],
        });
    }
}
