#!/usr/bin/env node

/**
 * MatchaStack CLI
 * 
 * Usage:
 *   matcha build    - Compile TypeScript and generate static HTML
 *   matcha serve    - Serve the dist/ folder
 *   matcha help     - Show this help message
 */

import { build } from '../lib/build.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
  serve: {
    description: 'Serve the dist/ folder',
    run: runServe,
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

async function runServe() {
  const port = 3000;
  const distDir = path.resolve(process.cwd(), 'dist');

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
  };

  const server = createServer(async (req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url!;
    const filePath = path.join(distDir, url);
    const ext = path.extname(filePath);

    try {
      const content = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log(`[matcha] Serving dist/ at http://localhost:${port}`);
  });
}

function showHelp() {
  console.log('MatchaStack CLI\n');
  console.log('Usage: matcha <command>\n');
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(12)} ${cmd.description}`);
  }
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
