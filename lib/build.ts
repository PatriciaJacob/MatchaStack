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

  // Step 2: Dynamically import the compiled app component
  // Convert source path to compiled path (app/app -> dist/app/app.js)
  const compiledPath = path.resolve(process.cwd(), 'dist', `${appEntry}.js`);
  const appUrl = pathToFileURL(compiledPath).href;

  console.log(`[build] Loading app from ${appEntry}...`);
  const AppModule = await import(appUrl);
  const App = AppModule.default || AppModule;

  // Step 3: Read the HTML template
  const html = fs.readFileSync(templatePath, 'utf8');

  // Step 4: Render React component to static HTML string
  console.log('[build] Rendering to static HTML...');
  const appHtml = renderToString(createElement(App));

  // Step 5: Inject rendered HTML into template
  const finalHtml = html.replace('{{app-holder}}', appHtml);

  // Step 6: Ensure output directory exists and write
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, finalHtml);

  console.log(`[build] Written to ${outputPath}`);
  return { outputPath, html: finalHtml };
}
