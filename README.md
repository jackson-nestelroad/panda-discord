# Panda
<a href="https://www.npmjs.com/package/panda-discord"><img src="https://img.shields.io/npm/v/panda-discord.svg?maxAge=3600" alt="NPM version" /></a>

**Panda** is a command framework for building Discord bots on **[discord.js](https://discord.js.org/)**. Panda provides a strongly-typed class-based structure for writing complex commands.

Panda provides a wide set of extendible classes for bots, commands, events, and services that allow anyone to rapidly spin up a complex Discord bot with a large set of commands. The primary motivation behind this command framework is the ability to handle chat (message) and slash (interaction) commands in the exact same way. Panda commands only require a single `run()` method for both. Panda takes care of all argument parsing behind the scenes, making complex commands much easier to implement.

A small example bot can be found in the [example folder](https://github.com/jackson-nestelroad/panda/tree/main/example).

Panda is also the framework that powers [Spinda](https://github.com/jackson-nestelroad/spinda-discord-bot).

## Get Started
```
npm install --save panda-discord
```

## Tutorial
Coming soon!

## Features
* Bot
  * Easily-configured options.
  * Automatic slash command uploading and updating.
  * Enable and disable chat and slash commands with a single setting.
  * Consistent embed and error formatting.
  * Easily refreshable without bot restart.
  * Consistent argument parsing with grouping by quotations or code blocks.
  * Named argument parsing (such as `--help` and `--timeout=20`).
  * Utility methods for parsing mentions and fetching users, channels, and roles.
  * Guild-specific command prefixes.
  * Run command using bot mention.
* Commands
  * Run chat and slash commands using a single `run()` method.
  * Easily extendable classes for defining simple commands, parameterized commands, and nested commands (command with subcommands).
  * Fields for automatically generating help pages.
  * Simple and long descriptions.
  * Argument configuration with validators and transformers.
  * Required, named, and hidden arguments.
  * Command categories.
  * Hidden command categories.
  * Command permissions based on member permissions and/or custom validation.
  * Command timeouts.
  * Command examples.
  * Command handlers receive context, including bot, command source, arguments, and guild.
  * Different command configurations for commands and subcommands.
  * Enable or disable chat and slash at the command level.
  * Default member permissions.
  * Register command only in a specific guild.
  * Allow commands to run in DMs.
  * Get help by specifying `--help` named argument.
  * Default eval, help, and ping commands.
* Services
  * Help service for listing commands by category and giving command usage.
  * Extensible help service using custom help handlers.
  * Member list service for caching entire guild member lists.
  * Timeout service for automatically timing out users that violate command timeouts.
* Events
  * Default `messageCreate` event for running chat commands.
  * Default `interactionCreate` event for running slash commands.
  * Default `ready` and `shardResume` events for setting bot presence.
* Utility
  * Argument splitting.
  * Discord-specific parsing methods.
  * Eval contexts.
  * Named argument parsing.
  * Timed cache.
