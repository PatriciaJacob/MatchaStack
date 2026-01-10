#!/usr/bin/env node

/**
 * MatchaStack CLI
 *
 * Usage:
 *   matcha build    - Compile TypeScript and generate static HTML
 *   matcha serve    - Serve the dist/ folder
 *   matcha help     - Show this help message
 */

import { buildCmd, serveCmd, helpCmd } from '../lib/commands/index.js';
import type { Command } from '../lib/commands/types.js';

// Command definitions - easy to extend
const commands: Record<string, Command> = {
  build: buildCmd,
  serve: serveCmd,
  help: {
    description: helpCmd.description,
    run: () => helpCmd.run(commands),
  },
};

// --- CLI Entry Point ---

async function main() {
  const args = process.argv.slice(2);
  const commandName = args[0];

  if (!commandName) {
    helpCmd.run(commands);
    process.exit(0);
  }

  const command = commands[commandName];
  if (!command) {
    console.error(`Unknown command: ${commandName}\n`);
    helpCmd.run(commands);
    process.exit(1);
  }

  await command.run();
}

main();
