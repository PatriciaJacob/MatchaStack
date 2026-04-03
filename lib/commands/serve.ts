import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { pathToFileURL } from 'node:url';

interface SsrFunctionModule {
  isSsrRoute: (path: string) => boolean;
  renderSsrPage: (path: string) => Promise<string>;
  renderRouteProps: (path: string) => Promise<Record<string, unknown>>;
}

export const description = 'Serve the production build with static + SSR routes';

export async function run() {
  const app = express();
  const root = process.cwd();
  const distPath = path.resolve(root, 'dist/public');
  const ssrFunctionPath = path.resolve(root, 'dist/server/ssr-function.js');

  let ssrFunction: SsrFunctionModule | null = null;
  if (fs.existsSync(ssrFunctionPath)) {
    ssrFunction = await import(pathToFileURL(ssrFunctionPath).href) as SsrFunctionModule;
  }

  // Serve static files
  app.use(express.static(distPath));

  app.get('/__matcha_props', async (req, res) => {
    if (!ssrFunction) {
      res.status(404).json({ error: 'SSR runtime not available' });
      return;
    }

    const rawPath = req.query.path;
    const routePath = typeof rawPath === 'string' ? rawPath : '/';
    if (!routePath.startsWith('/')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const pathname = new URL(routePath, 'http://localhost').pathname;
    if (!ssrFunction.isSsrRoute(pathname)) {
      res.status(404).json({ error: 'Route is not SSR' });
      return;
    }

    try {
      const props = await ssrFunction.renderRouteProps(pathname);
      res
        .status(200)
        .set({
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        })
        .end(JSON.stringify(props));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Handle clean URLs: /about → /about/index.html
  app.use('*all', async (req, res) => {
    const urlPath = req.originalUrl.split('?')[0] ?? '';

    // Try /path/index.html for clean URLs
    const indexPath = path.resolve(distPath, urlPath.slice(1), 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    if (ssrFunction && ssrFunction.isSsrRoute(urlPath)) {
      try {
        const html = await ssrFunction.renderSsrPage(urlPath);
        return res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        console.error(e);
        return res.status(500).end((e as Error).message);
      }
    }

    // Fallback to root index.html (SPA fallback)
    res.sendFile(path.resolve(distPath, 'index.html'));
  });

  app.listen(3000, () => {
    console.log('Serving dist/public/ at http://localhost:3000');
  });
}
