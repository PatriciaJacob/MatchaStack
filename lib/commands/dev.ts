import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { buildDevClientManifest, collectClientModules } from '../rsc/client-manifest.js';
import { createRscDevPlugin } from '../plugin.js';

export const description = 'Start development server with HMR and RSC rendering';

export async function run() {
  const app = express();
  const root = process.cwd();

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [createRscDevPlugin(root)],
  });

  app.use(vite.middlewares);

  app.use('*all', async (req, res) => {
    const url = req.originalUrl;

    try {
      let template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);

      const [rscEntry, rscDocumentEntry, clientModules] = await Promise.all([
        vite.ssrLoadModule('/src/entry-rsc-server.tsx?matcha-rsc'),
        vite.ssrLoadModule('/src/entry-rsc-document.tsx'),
        collectClientModules(root),
      ]);
      const route = (rscEntry as {
        matchRscRoute: (routeTarget: string) => unknown;
      }).matchRscRoute(url);
      const manifest = buildDevClientManifest(root, clientModules);
      const payload = await (rscEntry as {
        renderRoutePayload: (
          routeTarget: string,
          manifest: ReturnType<typeof buildDevClientManifest>,
        ) => Promise<string>;
      }).renderRoutePayload(url, manifest);
      const html = await (rscDocumentEntry as {
        renderRscDocument: (
          template: string,
          manifest: ReturnType<typeof buildDevClientManifest>,
          payload: string,
        ) => Promise<string>;
      }).renderRscDocument(template, manifest, payload);

      res.status(route ? 200 : 404).set({ 'Content-Type': 'text/html' }).end(html);
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
