import { Plugin, build } from 'vite';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderAwsCloudFrontTemplate, renderAwsDeployReadme } from './aws-cloudfront-template.js';
import {
  MATCHA_CLIENT_QUERY,
  transformRouteModuleForClient,
  transformRoutesModuleForClient,
} from './client-module-transform.js';

interface Route {
  path: string;
  getServerSideProps?: unknown;
}

interface RenderResult {
  html: string;
  props: Record<string, unknown>;
}

const PROPS_ENDPOINT = '/__matcha_props';

export default function matcha(): Plugin {
  let root: string;
  let outDir: string;

  return {
    name: 'matcha',
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },

    transform(code, id, options) {
      if (options?.ssr) {
        return null;
      }

      const cleanId = stripQuery(id);
      if (isRoutesModule(cleanId)) {
        return {
          code: transformRoutesModuleForClient(code, id),
          map: null,
        };
      }

      if (hasClientQuery(id)) {
        return {
          code: transformRouteModuleForClient(code, id),
          map: null,
        };
      }

      return null;
    },

    async closeBundle() {
      const distDir = resolve(root, outDir);
      const serverOutDir = resolve(root, 'dist/server');
      const deployOutDir = resolve(root, 'dist/deploy/aws');

      await rm(serverOutDir, { recursive: true, force: true });
      await rm(deployOutDir, { recursive: true, force: true });

      await build({
        configFile: false,
        root,
        ssr: {
          noExternal: true,
        },
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
        render: (target: string) => Promise<RenderResult>;
        loadStaticProps: (target: string) => Promise<Record<string, unknown>>;
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

      const staticPropsByRoute: Record<string, Record<string, unknown>> = {};

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
          staticPropsByRoute[route.path] = staticProps;
          console.log(`[matcha] ${route.path} → SSR runtime`);
          continue;
        }

        const { html: appHtml, props } = await render(route.path);
        const propsScript = createPropsScript(props);
        const finalHtml = template
          .replace('<!--ssr-outlet-->', appHtml)
          .replace('</head>', `${propsScript}${ssrRoutesScript}</head>`);

        const htmlPath = resolve(routeDir, 'index.html');
        await writeFile(htmlPath, finalHtml);

        renderedCount += 1;
        console.log(`[matcha] ${route.path} → ${htmlPath.replace(root + '/', '')}`);
      }

      const ssrRuntimePath = resolve(serverOutDir, 'ssr-runtime.js');
      const ssrRuntimeCode = `import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerSideProps, renderWithProps } from './entry-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, './ssr-template.html');
const ssrRoutes = ${JSON.stringify(ssrRoutes)};
const propsEndpoint = ${JSON.stringify(PROPS_ENDPOINT)};
const staticPropsByRoute = ${JSON.stringify(staticPropsByRoute)};

function normalizePath(routePath) {
  return routePath === '/' ? routePath : routePath.replace(/\\/$/, '');
}

function toRouteTarget(routeTarget) {
  const parsed = new URL(routeTarget, 'https://matcha.local');
  const pathname = normalizePath(parsed.pathname);
  return {
    pathname,
    target: \`\${pathname}\${parsed.search}\`,
  };
}

function escapeInlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\\\u003c');
}

function isSsrRoute(routeTarget) {
  return ssrRoutes.includes(toRouteTarget(routeTarget).pathname);
}

function loadCachedStaticProps(routePath) {
  return staticPropsByRoute[normalizePath(routePath)] ?? {};
}

export async function renderSsrPage(routeTarget) {
  const { pathname, target } = toRouteTarget(routeTarget);
  const [template, serverProps] = await Promise.all([
    readFile(templatePath, 'utf-8'),
    loadServerSideProps(target),
  ]);
  const staticProps = loadCachedStaticProps(pathname);
  const props = { ...staticProps, ...serverProps };
  const { html: appHtml } = renderWithProps(target, props);
  const propsScript = \`<script>window.__INITIAL_PROPS__=\${escapeInlineJson(props)}</script>\`;
  const routesScript = ${JSON.stringify(ssrRoutesScript)};

  return template
    .replace('<!--ssr-outlet-->', appHtml)
    .replace('</head>', \`\${propsScript}\${routesScript}</head>\`);
}

export async function renderRouteProps(routeTarget) {
  const { pathname, target } = toRouteTarget(routeTarget);
  const staticProps = loadCachedStaticProps(pathname);
  const serverProps = await loadServerSideProps(target);
  return { ...staticProps, ...serverProps };
}

export async function handleRequest(input) {
  const requestUrl = typeof input === 'string'
    ? new URL(input, 'https://matcha.local')
    : input;
  const routeTarget = \`\${requestUrl.pathname}\${requestUrl.search}\`;

  if (requestUrl.pathname === propsEndpoint) {
    const routePath = requestUrl.searchParams.get('path') ?? '/';
    if (!routePath.startsWith('/')) {
      return {
        statusCode: 400,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({ error: 'Invalid path' }),
      };
    }

    if (!isSsrRoute(routePath)) {
      return {
        statusCode: 404,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({ error: 'Route is not SSR' }),
      };
    }

    const props = await renderRouteProps(routePath);
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: JSON.stringify(props),
    };
  }

  if (isSsrRoute(routeTarget)) {
    const html = await renderSsrPage(routeTarget);
    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: html,
    };
  }

  return {
    statusCode: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: 'Not Found',
  };
}

export { isSsrRoute, propsEndpoint, ssrRoutes };`;
      await writeFile(ssrRuntimePath, ssrRuntimeCode);

      const lambdaHandlerPath = resolve(serverOutDir, 'lambda-handler.js');
      const lambdaHandlerCode = `import { handleRequest } from './ssr-runtime.js';

function getPath(event) {
  return event.rawPath ?? event.requestContext?.http?.path ?? event.path ?? '/';
}

function getQueryString(event) {
  if (typeof event.rawQueryString === 'string' && event.rawQueryString.length > 0) {
    return \`?\${event.rawQueryString}\`;
  }

  const params = event.queryStringParameters ?? {};
  const pairs = Object.entries(params)
    .filter((entry) => entry[1] !== undefined && entry[1] !== null)
    .map(([key, value]) => [key, String(value)]);

  if (pairs.length === 0) {
    return '';
  }

  return \`?\${new URLSearchParams(pairs).toString()}\`;
}

export async function handler(event) {
  const url = \`https://matcha.lambda\${getPath(event)}\${getQueryString(event)}\`;
  const response = await handleRequest(url);
  return {
    statusCode: response.statusCode ?? 200,
    headers: response.headers ?? {},
    body: response.body ?? '',
    isBase64Encoded: false,
  };
}`;
      await writeFile(lambdaHandlerPath, lambdaHandlerCode);

      const awsManifest = {
        propsEndpoint: PROPS_ENDPOINT,
        ssrRoutes,
        lambdaHandler: 'lambda-handler.handler',
        staticOutputDir: 'dist/public',
        lambdaOutputDir: 'dist/server',
      };

      await mkdir(deployOutDir, { recursive: true });
      await writeFile(resolve(deployOutDir, 'manifest.json'), JSON.stringify(awsManifest, null, 2));
      await writeFile(
        resolve(deployOutDir, 'cloudfront-template.yaml'),
        renderAwsCloudFrontTemplate({ propsEndpoint: PROPS_ENDPOINT, ssrRoutes })
      );
      await writeFile(
        resolve(deployOutDir, 'README.md'),
        renderAwsDeployReadme({ propsEndpoint: PROPS_ENDPOINT, ssrRoutes })
      );

      await writeFile(
        resolve(serverOutDir, 'package.json'),
        JSON.stringify(
          {
            type: 'module',
          },
          null,
          2
        )
      );

      if (ssrRoutes.length > 0) {
        console.log(`[matcha] Lambda handler: ${lambdaHandlerPath.replace(root + '/', '')}`);
        console.log(`[matcha] AWS deploy artifacts: ${deployOutDir.replace(root + '/', '')}`);
      }

      console.log(`[matcha] Static pages: ${renderedCount}, SSR pages: ${ssrRoutes.length}`);
      console.log(`[matcha] SSR runtime: ${ssrRuntimePath.replace(root + '/', '')}`);
    },
  };
}

function createPropsScript(props: Record<string, unknown>) {
  return `<script>window.__INITIAL_PROPS__=${JSON.stringify(props).replace(/</g, '\\u003c')}</script>`;
}

function stripQuery(id: string) {
  const queryStart = id.indexOf('?');
  return queryStart === -1 ? id : id.slice(0, queryStart);
}

function hasClientQuery(id: string) {
  return id.includes(`?${MATCHA_CLIENT_QUERY}`) || id.includes(`&${MATCHA_CLIENT_QUERY}`);
}

function isRoutesModule(id: string) {
  return /\/src\/routes\.(ts|tsx|js|jsx)$/.test(id);
}
