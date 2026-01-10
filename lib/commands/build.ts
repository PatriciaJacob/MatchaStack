/**
 * SSG Build Module
 *
 * Compiles TypeScript and renders React components to static HTML.
 *
 * Future: This will be extended to support:
 * - Hydration markers for client-side interactivity
 * - getStaticProps-style data fetching
 * - Multiple page routes
 */

// TODO: try renderToString vs prerenderToNodeStream

import { renderToString } from 'react-dom/server';
import { execSync } from 'node:child_process';
import { createElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

export interface BuildOptions {
  /** Path to the app entry point source file (default: 'app/app') */
  appEntry?: string;
  templatePath?: string;
  outputPath?: string;
}

export async function build(options: BuildOptions = {}) {
  const {
    appEntry = 'app/app',
    templatePath = 'app/index.html',
    outputPath = 'dist/index.html',
  } = options;

  // Step 1: Compile TypeScript
  // TODO: should just type-strip in the future, e.g. esbuild
  console.log('[build] Compiling TypeScript...');
  execSync('npx tsc', { stdio: 'inherit' });

  // Step 2: Bundle entry-client with esbuild
  console.log('[build] Bundling client entry...');
  await esbuild.build({
    entryPoints: ['app/entry-client.tsx'],
    bundle: true,
    outfile: 'dist/entry-client.js',
    format: 'esm',
  });

  // Step 3: Dynamically import the compiled app component
  // Convert source path to compiled path (app/app -> dist/app/app.js)
  const compiledPath = path.resolve(process.cwd(), 'dist', `${appEntry}.js`);
  const appUrl = pathToFileURL(compiledPath).href;

  console.log(`[build] Loading app from ${appEntry}...`);
  const AppModule = await import(appUrl);
  const App = AppModule.default || AppModule;

  // Step 4: Read the HTML template
  const html = fs.readFileSync(templatePath, 'utf8');

  // Step 5: Render React component to static HTML string
  console.log('[build] Rendering to static HTML...');
  const appHtml = renderToString(createElement(App));

  // Step 6: Inject rendered HTML into template
  const htmlWithApp = html.replace('{{app-holder}}', `<div id="root">${appHtml}</div>`);

  // Step 7: Inject client script into template
  const finalHtml = htmlWithApp.replace(
    '{{client-script-holder}}',
    '<script type="module" src="./entry-client.js"></script>'
  );

  // Step 8: Ensure output directory exists and write
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, finalHtml);

  console.log(`[build] Written to ${outputPath}`);
  return { outputPath, html: finalHtml };
}

// CLI command
export const description = 'Compile TypeScript and generate static HTML';

export async function run() {
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
