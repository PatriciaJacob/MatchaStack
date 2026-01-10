import * as buildCmd from './build.js';
import * as serveCmd from './serve.js';
import * as helpCmd from './help.js';

export type { Command } from './types.js';
export { buildCmd, serveCmd, helpCmd };

// Re-export build function for programmatic use
export { build, type BuildOptions } from './build.js';
