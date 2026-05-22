import { Plugin, build } from 'vite';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { analyzeModule, stripModuleDirectives, toModuleId } from './rsc/module-classifier.js';
import { collectClientModules } from './rsc/client-manifest.js';

interface RscRoute {
  path: string;
}

interface ClientReferenceManifest {
  moduleMap: Record<string, Record<string, { id: string; chunks: string[]; name: string; async?: boolean }>>;
  serverModuleMap: Record<string, { id: string; chunks: string[]; name: string; async?: boolean }>;
  chunkMap: Record<string, string>;
  ssrChunkMap?: Record<string, string>;
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

function replaceModuleSpecifiers(
  code: string,
  fileName: string,
  mapSpecifier: (specifier: string) => string,
): string {
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  const addReplacement = (literal: ts.StringLiteral) => {
    const nextValue = mapSpecifier(literal.text);
    if (nextValue === literal.text) {
      return;
    }

    replacements.push({
      start: literal.getStart(sourceFile) + 1,
      end: literal.end - 1,
      value: nextValue,
    });
  };

  for (const statement of sourceFile.statements) {
    if (statement.kind === ts.SyntaxKind.ImportDeclaration) {
      const moduleSpecifier = (statement as import('typescript').ImportDeclaration).moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        addReplacement(moduleSpecifier);
      }
    }

    if (statement.kind === ts.SyntaxKind.ExportDeclaration) {
      const moduleSpecifier = (statement as import('typescript').ExportDeclaration).moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        addReplacement(moduleSpecifier);
      }
    }
  }

  return replacements
    .reverse()
    .reduce((nextCode, replacement) => {
      return `${nextCode.slice(0, replacement.start)}${replacement.value}${nextCode.slice(replacement.end)}`;
    }, code);
}

const RSC_DEV_QUERY = '?matcha-rsc';

function isRscDevId(id: string | undefined): id is string {
  return Boolean(id?.includes(RSC_DEV_QUERY));
}

function stripRscDevQuery(id: string): string {
  return id.replace(RSC_DEV_QUERY, '');
}

export function createRscBuildPlugin(root: string): Plugin {
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

export function createRscDevPlugin(root: string): Plugin {
  const rscRuntimeAliases = new Map<string, string>([
    ['react', resolve(root, 'lib/rsc/react-server-runtime/react.js')],
    ['react/jsx-runtime', resolve(root, 'lib/rsc/react-server-runtime/jsx-runtime.js')],
    ['react/jsx-dev-runtime', resolve(root, 'lib/rsc/react-server-runtime/jsx-dev-runtime.js')],
    ['react-server-dom-webpack/server.node', resolve(root, 'lib/rsc/react-server-runtime/rsc-server-node.js')],
  ]);
  const mapRscSpecifier = (specifier: string): string => {
    const runtimeAlias = rscRuntimeAliases.get(specifier);
    if (runtimeAlias) {
      return runtimeAlias;
    }

    if (specifier.startsWith('.') || specifier.startsWith('/src/')) {
      return specifier.includes(RSC_DEV_QUERY) ? specifier : `${specifier}${RSC_DEV_QUERY}`;
    }

    return specifier;
  };

  return {
    name: 'matcha-rsc-dev',
    enforce: 'pre',

    async resolveId(source, importer) {
      if (rscRuntimeAliases.has(source) && isRscDevId(importer)) {
        return rscRuntimeAliases.get(source);
      }

      if (!source.includes(RSC_DEV_QUERY) && !isRscDevId(importer)) {
        return;
      }

      const cleanSource = stripRscDevQuery(source);
      const cleanImporter = importer ? stripRscDevQuery(importer) : undefined;
      const resolved = await this.resolve(cleanSource, cleanImporter, { skipSelf: true });
      if (!resolved) {
        return;
      }

      const cleanResolvedId = stripRscDevQuery(resolved.id);
      if (!cleanResolvedId.includes('/src/') || !isSourceModule(cleanResolvedId)) {
        return cleanResolvedId;
      }

      return `${cleanResolvedId}${RSC_DEV_QUERY}`;
    },

    transform(code, id) {
      if (!isRscDevId(id)) {
        return;
      }

      const cleanId = stripRscDevQuery(id);
      if (!cleanId.includes('/src/') || !isSourceModule(cleanId)) {
        return;
      }

      const analysis = analyzeModule(code, cleanId);
      if (!analysis.useClient) {
        return {
          code: replaceModuleSpecifiers(code, cleanId, mapRscSpecifier),
          map: null,
        };
      }

      return {
        code: replaceModuleSpecifiers(
          createClientReferenceModuleCode(toModuleId(root, cleanId), analysis.exports),
          cleanId,
          mapRscSpecifier,
        ),
        map: null,
      };
    },
  };
}

function createClientSsrBuildPlugin(root: string): Plugin {
  return {
    name: 'matcha-rsc-client-ssr-build',

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
        code: stripModuleDirectives(code, cleanId, ['use client']),
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

      return;
    },

    generateBundle(_, bundle) {
      if (command !== 'build' || isSsr) {
        return;
      }

      const manifest: ClientReferenceManifest = {
        moduleMap: {},
        serverModuleMap: {},
        chunkMap: {},
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
          plugins: [createClientSsrBuildPlugin(root)],
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

      const rscEntryPath = resolve(serverOutDir, 'entry-rsc-server.js');
      const rscEntryUrl = pathToFileURL(rscEntryPath).href;
      const { rscRoutes } = await import(rscEntryUrl) as {
        rscRoutes: RscRoute[];
      };

      const rscRoutePaths = rscRoutes.map((route) => route.path);
      const templatePath = resolve(distDir, 'index.html');
      const template = await readFile(templatePath, 'utf-8');
      const ssrTemplatePath = resolve(serverOutDir, 'ssr-template.html');
      await writeFile(ssrTemplatePath, template);

      const ssrFunctionPath = resolve(serverOutDir, 'ssr-function.js');
      const ssrFunctionCode = `import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRoutePayload } from './entry-rsc-server.js';
import { renderRscDocument } from './entry-rsc-document.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, './ssr-template.html');
const manifestPath = path.resolve(__dirname, './rsc-client-manifest.json');
const rscRoutes = ${JSON.stringify(rscRoutePaths)};

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

function isRscRoute(routeTarget) {
  return rscRoutes.includes(toRouteTarget(routeTarget).pathname);
}

async function loadClientManifest() {
  const file = await readFile(manifestPath, 'utf-8');
  return JSON.parse(file);
}

export async function renderRscPayload(routeTarget) {
  const { target } = toRouteTarget(routeTarget);
  const manifest = await loadClientManifest();
  return renderRoutePayload(target, manifest);
}

export async function renderRscPage(routeTarget) {
  const { target } = toRouteTarget(routeTarget);
  const [template, manifest] = await Promise.all([
    readFile(templatePath, 'utf-8'),
    loadClientManifest(),
  ]);
  const payload = await renderRoutePayload(target, manifest);

  return renderRscDocument(template, manifest, payload);
}

export { rscRoutes, isRscRoute };`;
      await writeFile(ssrFunctionPath, ssrFunctionCode);

      const publicManifestPath = resolve(distDir, 'rsc-client-manifest.json');
      const serverManifestPath = resolve(serverOutDir, 'rsc-client-manifest.json');
      const manifest = JSON.parse(await readFile(publicManifestPath, 'utf-8')) as ClientReferenceManifest;
      const serverManifest: ClientReferenceManifest = {
        ...manifest,
        ssrChunkMap: Object.fromEntries(
          [...clientModules.keys()].map((filePath) => {
            const moduleId = toModuleId(root, filePath);
            const entryName = toSsrClientEntryName(root, filePath);
            return [moduleId, resolve(serverOutDir, 'rsc-client', `${entryName}.js`)];
          }),
        ),
      };
      await writeFile(serverManifestPath, JSON.stringify(serverManifest, null, 2));

      for (const routePath of rscRoutePaths) {
        console.log(`[matcha] ${routePath} -> RSC document runtime`);
      }

      console.log(`[matcha] RSC pages: ${rscRoutePaths.length}`);
      console.log(`[matcha] SSR function: ${ssrFunctionPath.replace(root + '/', '')}`);
    },
  };
}
