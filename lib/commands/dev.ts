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

  app.get('/_matcha/data', async (req, res) => {
    const target = typeof req.query.url === 'string' ? req.query.url : null;

    if (!target) {
      return res.status(400).json({ error: 'Missing url query parameter' });
    }

    try {
      const { getRouteData } = await vite.ssrLoadModule('/src/entry-server.tsx');
      const { route, props } = await getRouteData(target);

      if (!route?.getServerSideProps) {
        return res.status(404).json({ error: 'No getServerSideProps for route' });
      }

      res.status(200).json(props);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      console.error(e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.use(vite.middlewares);

  app.use('*all', async (req, res) => {
    try {
      // 1. Read index.html
      let template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');

      // 2. Apply Vite HTML transforms (injects HMR client, etc.)
      template = await vite.transformIndexHtml(req.originalUrl, template);

      // 3. Load server entry via Vite (enables HMR for SSR)
      const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');

      // 4. Render the app
      const { html: appHtml, props } = await render(req.originalUrl);

      // Serialize initial props so the client hydrates with the same data.
      const propsScript = `<script>window.__INITIAL_PROPS__=${JSON.stringify(props).replace(/</g, '\\u003c')}</script>`;

      // 5. Inject rendered HTML and initial props
      const html = template
        .replace('<!--ssr-outlet-->', appHtml)
        .replace('</head>', `${propsScript}</head>`);

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
