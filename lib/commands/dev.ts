import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { buildDevClientManifest, collectClientModules } from '../rsc/client-manifest.js';

export const description = 'Start development server with HMR and SSR';

export async function run() {
  const app = express();
  const root = process.cwd();

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const rscVite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
    resolve: {
      alias: [
        { find: /^react$/, replacement: path.resolve(root, 'node_modules/react/react.react-server.js') },
        { find: /^react\/jsx-runtime$/, replacement: path.resolve(root, 'node_modules/react/jsx-runtime.react-server.js') },
        { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(root, 'node_modules/react/jsx-dev-runtime.react-server.js') },
      ],
      conditions: ['react-server', 'node', 'import', 'module', 'default'],
    },
    ssr: {
      noExternal: ['react', 'react-dom', 'react-server-dom-webpack'],
    },
  });

  app.get('/__matcha_props', async (req, res) => {
    const rawPath = req.query.path;
    const routePath = typeof rawPath === 'string' ? rawPath : '/';

    if (!routePath.startsWith('/')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    try {
      const { loadStaticProps, loadServerSideProps } = await vite.ssrLoadModule('/src/entry-server.tsx');
      const props = {
        ...(await loadStaticProps(routePath)),
        ...(await loadServerSideProps(routePath)),
      };

      res
        .status(200)
        .set({
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        })
        .end(JSON.stringify(props));
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      console.error(e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.use(vite.middlewares);

  app.use('*all', async (req, res) => {
    const url = req.originalUrl;

    try {
      let template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);

      if ((req.path === '/' || req.path === '') && req.method === 'GET') {
        const [rscEntry, rscDocumentEntry, clientModules] = await Promise.all([
          rscVite.ssrLoadModule('/src/entry-rsc-server.tsx'),
          vite.ssrLoadModule('/src/entry-rsc-document.tsx'),
          collectClientModules(root),
        ]);
        const manifest = buildDevClientManifest(root, clientModules);
        const payload = await (rscEntry as {
          renderHomePayload: (
            manifest: ReturnType<typeof buildDevClientManifest>,
          ) => Promise<string>;
        }).renderHomePayload(manifest);
        const html = await (rscDocumentEntry as {
          renderHomeDocument: (
            template: string,
            manifest: ReturnType<typeof buildDevClientManifest>,
            payload: string,
          ) => Promise<string>;
        }).renderHomeDocument(
          template,
          manifest,
          payload,
        );

        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        return;
      }

      const { render, routes } = await vite.ssrLoadModule('/src/entry-server.tsx');
      const { html: appHtml, props } = await render(url);

      const propsScript = `<script>window.__INITIAL_PROPS__=${JSON.stringify(props).replace(/</g, '\\u003c')}</script>`;
      const ssrRoutes = (routes as Array<{ path: string; getServerSideProps?: unknown }>)
        .filter((route) => Boolean(route.getServerSideProps))
        .map((route) => route.path);
      const ssrRoutesScript = `<script>window.__MATCHA_SSR_ROUTES__=${JSON.stringify(ssrRoutes)}</script>`;
      const html = template
        .replace('<!--ssr-outlet-->', appHtml)
        .replace('</head>', `${propsScript}${ssrRoutesScript}</head>`);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      console.error(e);
      res.status(500).end((e as Error).message);
    }
  });

  app.listen(3000, () => {
    console.log('Dev server running at http://localhost:3000');
  });
}
