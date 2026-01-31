import type { Command } from './types.js';

export const description = 'Show this help message';

export function run(commands: Record<string, Command>) {
  console.log('MatchaStack CLI\n');
  console.log('Usage: matcha <command>\n');
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(12)} ${cmd.description}`);
  }
}
