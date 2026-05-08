import { Plugin, build } from 'vite';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { analyzeModule, stripServerCode, toModuleId } from './rsc/module-classifier.js';
import { collectClientModules } from './rsc/client-manifest.js';

interface Route {
  path: string;
  getServerSideProps?: unknown;
}

interface RenderResult {
  html: string;
  props: Record<string, unknown>;
}

interface ClientReferenceManifest {
  moduleMap: Record<string, Record<string, { id: string; chunks: string[]; name: string; async?: boolean }>>;
  serverModuleMap: Record<string, { id: string; chunks: string[]; name: string; async?: boolean }>;
  chunkMap: Record<string, string>;
  ssrChunkMap: Record<string, string>;
}

interface ClientModuleRecord {
  exports: string[];
}

function toSsrClientEntryName(root: string, filePath: string): string {
  return toModuleId(root, filePath).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isSourceModule(id: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(id);
}

function createClientReferenceModuleCode(moduleId: string, exportNames: string[]): string {
  const lines = [
    `import { registerClientReference } from 'react-server-dom-webpack/server.node';`,
    '',
    `function createClientReference(exportName) {`,
    `  return registerClientReference(`,
    `    function clientReferenceProxy() {`,
    `      throw new Error(\`Cannot call the client export "\${exportName}" from "${moduleId}" on the server.\`);`,
    `    },`,
    `    ${JSON.stringify(moduleId)},`,
    `    exportName,`,
    `  );`,
    `}`,
    '',
  ];

  if (exportNames.includes('default')) {
    lines.push(`const __matcha_default__ = createClientReference('default');`);
    lines.push(`export default __matcha_default__;`);
  }

  for (const exportName of exportNames) {
    if (exportName === 'default') {
      continue;
    }

    lines.push(`export const ${exportName} = createClientReference(${JSON.stringify(exportName)});`);
  }

  if (exportNames.length === 0) {
    lines.push(`export default createClientReference('default');`);
  }

  return `${lines.join('\n')}\n`;
}

function createRscBuildPlugin(root: string): Plugin {
  return {
    name: 'matcha-rsc-server-build',

    transform(code, id) {
      const cleanId = id.split('?', 1)[0] ?? id;
      if (!cleanId.includes('/src/') || !isSourceModule(cleanId)) {
        return;
      }

      const analysis = analyzeModule(code, cleanId);
      if (!analysis.useClient) {
        return;
      }

      return {
        code: createClientReferenceModuleCode(toModuleId(root, cleanId), analysis.exports),
        map: null,
      };
    },
  };
}

export default function matcha(): Plugin {
  let root: string;
  let outDir: string;
  let isSsr: boolean;
  let command: 'build' | 'serve';
  const clientModules = new Map<string, ClientModuleRecord>();
  const emittedClientEntries = new Set<string>();

  return {
    name: 'matcha',

    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
      isSsr = Boolean(config.build.ssr);
      command = config.command;
    },

    async buildStart() {
      if (command !== 'build' || isSsr) {
        return;
      }

      const modules = await collectClientModules(root);
      for (const moduleInfo of modules) {
        clientModules.set(moduleInfo.filePath, {
          exports: moduleInfo.exports,
        });

        if (!emittedClientEntries.has(moduleInfo.filePath)) {
          emittedClientEntries.add(moduleInfo.filePath);
          this.emitFile({
            type: 'chunk',
            id: moduleInfo.filePath,
            name: path.basename(moduleInfo.filePath, path.extname(moduleInfo.filePath)),
            preserveSignature: 'strict',
          });
        }
      }
    },

    transform(code, id) {
      const cleanId = id.split('?', 1)[0] ?? id;
      if (!cleanId.includes('/src/') || !isSourceModule(cleanId)) {
        return;
      }

      const analysis = analyzeModule(code, cleanId);

      if (analysis.useClient && isSsr) {
        return {
          code: createClientReferenceModuleCode(toModuleId(root, cleanId), analysis.exports),
          map: null,
        };
      }

      if (command !== 'build' || isSsr) {
        return;
      }

      const stripped = stripServerCode(code, cleanId);
      if (stripped !== code) {
        return { code: stripped, map: null };
      }
    },

    generateBundle(_, bundle) {
      if (command !== 'build' || isSsr) {
        return;
      }

      const manifest: ClientReferenceManifest = {
        moduleMap: {},
        serverModuleMap: {},
        chunkMap: {},
        ssrChunkMap: {},
      };

      for (const [filePath, record] of clientModules) {
        const moduleId = toModuleId(root, filePath);
        const chunk = Object.values(bundle).find((entry) => {
          return entry.type === 'chunk' && entry.facadeModuleId === filePath;
        });

        if (!chunk || chunk.type !== 'chunk') {
          continue;
        }

        manifest.chunkMap[moduleId] = `/${chunk.fileName}`;
        manifest.moduleMap[moduleId] = {};

        for (const exportName of record.exports) {
          const clientReference = {
            id: moduleId,
            chunks: [moduleId, chunk.fileName],
            name: exportName,
          };

          manifest.moduleMap[moduleId][exportName] = clientReference;
          manifest.serverModuleMap[`${moduleId}#${exportName}`] = clientReference;
        }
      }

      this.emitFile({
        type: 'asset',
        fileName: 'rsc-client-manifest.json',
        source: JSON.stringify(manifest, null, 2),
      });
    },

    async closeBundle() {
      if (command !== 'build' || isSsr) {
        return;
      }

      const distDir = resolve(root, outDir);
      const serverOutDir = resolve(root, 'dist/server');

      await rm(serverOutDir, { recursive: true, force: true });

      await build({
        configFile: false,
        root,
        build: {
          ssr: resolve(root, 'src/entry-server.tsx'),
          outDir: serverOutDir,
          rollupOptions: {
            output: {
              format: 'esm',
            },
          },
        },
      });

      await build({
        configFile: false,
        root,
        build: {
          ssr: resolve(root, 'src/entry-rsc-document.tsx'),
          outDir: serverOutDir,
          emptyOutDir: false,
          rollupOptions: {
            output: {
              entryFileNames: 'entry-rsc-document.js',
              format: 'esm',
            },
          },
        },
      });

      if (clientModules.size > 0) {
        const clientSsrInputs = Object.fromEntries(
          [...clientModules.keys()].map((filePath) => [toSsrClientEntryName(root, filePath), filePath]),
        );

        await build({
          configFile: false,
          root,
          build: {
            ssr: true,
            outDir: serverOutDir,
            emptyOutDir: false,
            rollupOptions: {
              input: clientSsrInputs,
              output: {
                entryFileNames: 'rsc-client/[name].js',
                format: 'esm',
              },
            },
          },
        });
      }

      await build({
        configFile: false,
        root,
        plugins: [createRscBuildPlugin(root)],
        resolve: {
          alias: [
            { find: /^react$/, replacement: resolve(root, 'node_modules/react/react.react-server.js') },
            { find: /^react\/jsx-runtime$/, replacement: resolve(root, 'node_modules/react/jsx-runtime.react-server.js') },
            { find: /^react\/jsx-dev-runtime$/, replacement: resolve(root, 'node_modules/react/jsx-dev-runtime.react-server.js') },
          ],
          conditions: ['react-server', 'node', 'import', 'module', 'default'],
        },
        ssr: {
          noExternal: ['react', 'react-dom', 'react-server-dom-webpack'],
        },
        build: {
          ssr: resolve(root, 'src/entry-rsc-server.tsx'),
          outDir: serverOutDir,
          emptyOutDir: false,
          rollupOptions: {
            output: {
              entryFileNames: 'entry-rsc-server.js',
              format: 'esm',
            },
          },
        },
      });

      const serverEntryPath = resolve(serverOutDir, 'entry-server.js');
      const serverEntryUrl = pathToFileURL(serverEntryPath).href;
      const { render, loadStaticProps, routes } = await import(serverEntryUrl) as {
        render: (url: string) => Promise<RenderResult>;
        loadStaticProps: (url: string) => Promise<Record<string, unknown>>;
        routes: Route[];
      };

      const ssrRoutes = routes
        .filter((route) => Boolean(route.getServerSideProps))
        .map((route) => route.path);

      const ssrRoutesScript = `<script>window.__MATCHA_SSR_ROUTES__=${JSON.stringify(ssrRoutes)}</script>`;
      const templatePath = resolve(distDir, 'index.html');
      const template = await readFile(templatePath, 'utf-8');
      const ssrTemplatePath = resolve(serverOutDir, 'ssr-template.html');
      await writeFile(ssrTemplatePath, template);

      const ssrFunctionPath = resolve(serverOutDir, 'ssr-function.js');
      const ssrFunctionCode = `import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerSideProps, renderWithProps } from './entry-server.js';
import { renderHomePayload } from './entry-rsc-server.js';
import { renderHomeDocument } from './entry-rsc-document.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, './ssr-template.html');
const publicRoot = path.resolve(__dirname, '../public');
const manifestPath = path.resolve(publicRoot, 'rsc-client-manifest.json');
const ssrRoutes = ${JSON.stringify(ssrRoutes)};

function normalizePath(routePath) {
  return routePath === '/' ? routePath : routePath.replace(/\\/$/, '');
}

function toRouteTarget(routeTarget) {
  const parsed = new URL(routeTarget, 'http://localhost');
  const pathname = normalizePath(parsed.pathname);
  return {
    pathname,
    target: \`\${pathname}\${parsed.search}\`,
  };
}

function isSsrRoute(routeTarget) {
  return ssrRoutes.includes(toRouteTarget(routeTarget).pathname);
}

function isRscRoute(routeTarget) {
  return toRouteTarget(routeTarget).pathname === '/';
}

function staticPropsFilePath(routePath) {
  if (routePath === '/') return path.resolve(publicRoot, '_props.json');
  return path.resolve(publicRoot, routePath.slice(1), '_props.json');
}

async function loadCachedStaticProps(routePath) {
  try {
    const file = await readFile(staticPropsFilePath(routePath), 'utf-8');
    return JSON.parse(file);
  } catch {
    return {};
  }
}

async function loadClientManifest() {
  const file = await readFile(manifestPath, 'utf-8');
  return JSON.parse(file);
}

export async function renderRscPage() {
  const [template, manifest] = await Promise.all([
    readFile(templatePath, 'utf-8'),
    loadClientManifest(),
  ]);
  const payload = await renderHomePayload(manifest);

  return renderHomeDocument(template, manifest, payload);
}

export async function renderSsrPage(routeTarget) {
  const { pathname, target } = toRouteTarget(routeTarget);
  const [template, staticProps] = await Promise.all([
    readFile(templatePath, 'utf-8'),
    loadCachedStaticProps(pathname),
  ]);
  const serverProps = await loadServerSideProps(target);
  const props = { ...staticProps, ...serverProps };
  const { html: appHtml } = renderWithProps(target, props);
  const propsScript = \`<script>window.__INITIAL_PROPS__=\${JSON.stringify(props).replace(/</g, '\\\\u003c')}</script>\`;
  const routesScript = ${JSON.stringify(ssrRoutesScript)};

  return template
    .replace('<!--ssr-outlet-->', appHtml)
    .replace('</head>', \`\${propsScript}\${routesScript}</head>\`);
}

export async function renderRouteProps(routeTarget) {
  const { pathname, target } = toRouteTarget(routeTarget);
  const staticProps = await loadCachedStaticProps(pathname);
  const serverProps = await loadServerSideProps(target);
  return { ...staticProps, ...serverProps };
}

export { isSsrRoute, ssrRoutes, isRscRoute };`;
      await writeFile(ssrFunctionPath, ssrFunctionCode);

      const manifestPath = resolve(distDir, 'rsc-client-manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as ClientReferenceManifest;
      manifest.ssrChunkMap = Object.fromEntries(
        [...clientModules.keys()].map((filePath) => {
          const moduleId = toModuleId(root, filePath);
          const entryName = toSsrClientEntryName(root, filePath);
          return [moduleId, resolve(serverOutDir, 'rsc-client', `${entryName}.js`)];
        }),
      );
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      let renderedCount = 0;
      for (const route of routes) {
        const staticProps = await loadStaticProps(route.path);
        const routeDir = route.path === '/'
          ? distDir
          : resolve(distDir, route.path.slice(1));

        await mkdir(routeDir, { recursive: true });
        const propsPath = resolve(routeDir, '_props.json');
        await writeFile(propsPath, JSON.stringify(staticProps));

        if (route.path === '/') {
          console.log('[matcha] / -> RSC document runtime');
          continue;
        }

        if (ssrRoutes.includes(route.path)) {
          console.log(`[matcha] ${route.path} -> SSR runtime`);
          continue;
        }

        const { html: appHtml, props } = await render(route.path);
        const propsScript = `<script>window.__INITIAL_PROPS__=${JSON.stringify(props).replace(/</g, '\\u003c')}</script>`;
        const finalHtml = template
          .replace('<!--ssr-outlet-->', appHtml)
          .replace('</head>', `${propsScript}${ssrRoutesScript}</head>`);

        const htmlPath = resolve(routeDir, 'index.html');
        await writeFile(htmlPath, finalHtml);

        renderedCount += 1;
        console.log(`[matcha] ${route.path} -> ${htmlPath.replace(root + '/', '')}`);
      }

      console.log(`[matcha] Static pages: ${renderedCount}, SSR pages: ${ssrRoutes.length}, RSC pages: 1`);
      console.log(`[matcha] SSR function: ${ssrFunctionPath.replace(root + '/', '')}`);
    },
  };
}
