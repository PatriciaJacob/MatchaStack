import { Plugin, build } from 'vite';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Route {
  path: string;
  getServerSideProps?: unknown;
}

interface RenderResult {
  html: string;
  props: Record<string, unknown>;
}

export default function matcha(): Plugin {
  let root: string;
  let outDir: string;

  return {
    name: 'matcha',

    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },

    async closeBundle() {
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, './ssr-template.html');
const publicRoot = path.resolve(__dirname, '../public');
const ssrRoutes = ${JSON.stringify(ssrRoutes)};

function normalizePath(routePath) {
  return routePath === '/' ? routePath : routePath.replace(/\\/$/, '');
}

function isSsrRoute(routePath) {
  return ssrRoutes.includes(normalizePath(routePath));
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

export async function renderSsrPage(routePath) {
  const normalizedPath = normalizePath(routePath);
  const [template, staticProps] = await Promise.all([
    readFile(templatePath, 'utf-8'),
    loadCachedStaticProps(normalizedPath),
  ]);
  const serverProps = await loadServerSideProps(normalizedPath);
  const props = { ...staticProps, ...serverProps };
  const { html: appHtml } = renderWithProps(normalizedPath, props);
  const propsScript = \`<script>window.__INITIAL_PROPS__=\${JSON.stringify(props)}</script>\`;
  const routesScript = ${JSON.stringify(ssrRoutesScript)};

  return template
    .replace('<!--ssr-outlet-->', appHtml)
    .replace('</head>', \`\${propsScript}\${routesScript}</head>\`);
}

export async function renderRouteProps(routePath) {
  const normalizedPath = normalizePath(routePath);
  const staticProps = await loadCachedStaticProps(normalizedPath);
  const serverProps = await loadServerSideProps(normalizedPath);
  return { ...staticProps, ...serverProps };
}

export { isSsrRoute, ssrRoutes };`;
      await writeFile(ssrFunctionPath, ssrFunctionCode);

      let renderedCount = 0;
      for (const route of routes) {
        const staticProps = await loadStaticProps(route.path);
        const routeDir = route.path === '/'
          ? distDir
          : resolve(distDir, route.path.slice(1));

        await mkdir(routeDir, { recursive: true });
        const propsPath = resolve(routeDir, '_props.json');
        await writeFile(propsPath, JSON.stringify(staticProps));

        if (ssrRoutes.includes(route.path)) {
          console.log(`[matcha] ${route.path} → SSR runtime`);
          continue;
        }

        const { html: appHtml, props } = await render(route.path);
        const propsScript = `<script>window.__INITIAL_PROPS__=${JSON.stringify(props)}</script>`;
        const finalHtml = template
          .replace('<!--ssr-outlet-->', appHtml)
          .replace('</head>', `${propsScript}${ssrRoutesScript}</head>`);

        const htmlPath = resolve(routeDir, 'index.html');
        await writeFile(htmlPath, finalHtml);

        renderedCount += 1;
        console.log(`[matcha] ${route.path} → ${htmlPath.replace(root + '/', '')}`);
      }

      console.log(`[matcha] Static pages: ${renderedCount}, SSR pages: ${ssrRoutes.length}`);
      console.log(`[matcha] SSR function: ${ssrFunctionPath.replace(root + '/', '')}`);
    },
  };
}
