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

  app.use('*all', async (req, res) => {
    const url = req.originalUrl;

    try {
      // 1. Read index.html
      let template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');

      console.log('1', template);

      // 2. Apply Vite HTML transforms (injects HMR client, etc.)
      template = await vite.transformIndexHtml(url, template);

      console.log('2', template);

      // 3. Load server entry via Vite (enables HMR for SSR)
      const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');
      console.log('3', render);

      // 4. Render the app
      const { html: appHtml, props } = await render(url);

      console.log('4', appHtml);

      // 5. Inject rendered HTML
      const propsScript = `<script>window.__INITIAL_PROPS__=${JSON.stringify(props)}</script>`;
      const html = template.replace('<!--ssr-outlet-->', appHtml).replace('</head>', `${propsScript}</head>`);

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

