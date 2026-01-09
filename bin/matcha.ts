#!/usr/bin/env node

/**
 * MatchaStack CLI
 * 
 * Usage:
 *   matcha build    - Compile TypeScript and generate static HTML
 *   matcha help     - Show this help message
 * 
 * Future commands (scaffolded for expansion):
 *   matcha dev      - Build + serve with file watching
 *   matcha serve    - Serve the dist/ folder
 */

import { build } from '../lib/build.js';

// Command definitions - easy to extend
type Command = {
  description: string;
  run: () => Promise<void> | void;
};

const commands: Record<string, Command> = {
  build: {
    description: 'Compile TypeScript and generate static HTML',
    run: runBuild,
  },
  help: {
    description: 'Show this help message',
    run: showHelp,
  },
};

// --- Command Implementations ---

async function runBuild() {
  console.log('[matcha] Building...\n');

  try {
    const result = await build();
    console.log(result.html);
    console.log('\n[matcha] Build complete!');
  } catch (err) {
    console.error('[matcha] Build failed:', err);
    process.exit(1);
  }
}

function showHelp() {
  console.log('MatchaStack CLI\n');
  console.log('Usage: matcha <command>\n');
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(12)} ${cmd.description}`);
  }
  console.log('\nFuture commands:');
  console.log('  dev          Build + serve with file watching');
  console.log('  serve        Serve the dist/ folder');
}

// --- CLI Entry Point ---

async function main() {
  const args = process.argv.slice(2);
  const commandName = args[0];

  if (!commandName) {
    showHelp();
    process.exit(0);
  }

  const command = commands[commandName];
  if (!command) {
    console.error(`Unknown command: ${commandName}\n`);
    showHelp();
    process.exit(1);
  }

  await command.run();
}

main();
