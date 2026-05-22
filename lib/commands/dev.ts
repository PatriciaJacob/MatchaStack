import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { buildDevClientManifest, collectClientModules } from '../rsc/client-manifest.js';
import { createRscDevPlugin } from '../plugin.js';

export const description = 'Start development server with HMR and RSC rendering';

type DevClientManifest = ReturnType<typeof buildDevClientManifest>;

interface RscServerEntry {
  matchRscRoute: (routeTarget: string) => unknown;
  renderRoutePayload: (
    routeTarget: string,
    manifest: DevClientManifest,
  ) => Promise<string>;
}

interface RscDocumentEntry {
  renderRscDocument: (
    template: string,
    manifest: DevClientManifest,
    payload: string,
  ) => Promise<string>;
}

export async function run() {
  const app = express();
  const root = process.cwd();

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [createRscDevPlugin(root)],
  });

  async function loadRscRuntime(): Promise<{
    rscEntry: RscServerEntry;
    rscDocumentEntry: RscDocumentEntry;
    manifest: DevClientManifest;
  }> {
    const [rscEntry, rscDocumentEntry, clientModules] = await Promise.all([
      vite.ssrLoadModule('/src/entry-rsc-server.tsx?matcha-rsc'),
      vite.ssrLoadModule('/src/entry-rsc-document.tsx'),
      collectClientModules(root),
    ]);

    return {
      rscEntry: rscEntry as RscServerEntry,
      rscDocumentEntry: rscDocumentEntry as RscDocumentEntry,
      manifest: buildDevClientManifest(root, clientModules),
    };
  }

  app.get('/__matcha_rsc', async (req, res) => {
    const rawPath = req.query.path;
    const routeTarget = typeof rawPath === 'string' && rawPath.startsWith('/') ? rawPath : '/';

    try {
      const { rscEntry, manifest } = await loadRscRuntime();
      const route = rscEntry.matchRscRoute(routeTarget);
      const payload = await rscEntry.renderRoutePayload(routeTarget, manifest);

      res
        .status(route ? 200 : 404)
        .set({
          'Content-Type': 'text/x-component; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        .end(payload);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      console.error(e);
      res.status(500).end((e as Error).message);
    }
  });

  app.use(vite.middlewares);

  app.use('*all', async (req, res) => {
    const url = req.originalUrl;

    try {
      let template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);

      const { rscEntry, rscDocumentEntry, manifest } = await loadRscRuntime();
      const route = rscEntry.matchRscRoute(url);
      const payload = await rscEntry.renderRoutePayload(url, manifest);
      const html = await rscDocumentEntry.renderRscDocument(template, manifest, payload);

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
