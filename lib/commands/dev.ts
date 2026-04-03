import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createServer as createViteServer } from 'vite';

export const description = 'Start development server with HMR and SSR';

export async function run() {
  const app = express();
  const root = process.cwd();

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.get('/__matcha_props', async (req, res) => {
    const rawPath = req.query.path;
    const routePath = typeof rawPath === 'string' ? rawPath : '/';

    if (!routePath.startsWith('/')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    try {
      const parsedPath = new URL(routePath, 'http://localhost').pathname;
      const { loadStaticProps, loadServerSideProps } = await vite.ssrLoadModule('/src/entry-server.tsx');
      const props = {
        ...(await loadStaticProps(parsedPath)),
        ...(await loadServerSideProps(parsedPath)),
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

  app.use('*all', async (req, res) => {
    const url = req.originalUrl;

    try {
      const requestUrl = new URL(url, 'http://localhost');

      // 1. Read index.html
      let template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');

      // 2. Apply Vite HTML transforms (injects HMR client, etc.)
      template = await vite.transformIndexHtml(url, template);

      // 3. Load server entry via Vite (enables HMR for SSR)
      const { render, routes } = await vite.ssrLoadModule('/src/entry-server.tsx');

      // 4. Render the app
      const { html: appHtml, props } = await render(requestUrl.pathname);

      // 5. Inject rendered HTML
      const propsScript = `<script>window.__INITIAL_PROPS__=${JSON.stringify(props)}</script>`;
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
