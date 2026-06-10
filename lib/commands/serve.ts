import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { pathToFileURL } from 'node:url';

interface RscFunctionModule {
  isRscRoute: (path: string) => boolean;
  renderRscPageStream: (path: string) => Promise<{
    pipe: (destination: NodeJS.WritableStream) => void;
    abort: () => void;
  }>;
  renderRscPayloadStream: (path: string) => Promise<{
    pipe: (destination: NodeJS.WritableStream) => void;
    abort: () => void;
  }>;
}

export const description = 'Serve the production build with RSC routes';

export async function run() {
  const app = express();
  const root = process.cwd();
  const distPath = path.resolve(root, 'dist/public');
  const rscFunctionPath = path.resolve(root, 'dist/server/ssr-function.js');

  let rscFunction: RscFunctionModule | null = null;
  if (fs.existsSync(rscFunctionPath)) {
    rscFunction = await import(pathToFileURL(rscFunctionPath).href) as RscFunctionModule;
  }

  app.use(express.static(distPath, { index: false, redirect: false }));

  app.get('/__matcha_rsc', async (req, res) => {
    if (!rscFunction) {
      res.status(404).end('RSC runtime not available');
      return;
    }

    const rawPath = req.query.path;
    const routeTarget = typeof rawPath === 'string' && rawPath.startsWith('/') ? rawPath : '/';

    try {
      const stream = await rscFunction.renderRscPayloadStream(routeTarget);
      const status = rscFunction.isRscRoute(routeTarget) ? 200 : 404;
      res
        .status(status)
        .set({
          'Content-Type': 'text/x-component; charset=utf-8',
          'Cache-Control': 'no-store',
        });

      res.flushHeaders();

      let completed = false;
      res.on('finish', () => {
        completed = true;
      });
      req.on('close', () => {
        if (!completed) {
          stream.abort();
        }
      });

      stream.pipe(res);
    } catch (e) {
      console.error(e);
      res.status(500).end((e as Error).message);
    }
  });

  app.use('*all', async (req, res) => {
    const requestUrl = req.originalUrl;

    if (rscFunction) {
      try {
        const stream = await rscFunction.renderRscPageStream(requestUrl);
        const status = rscFunction.isRscRoute(requestUrl) ? 200 : 404;
        res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8' });
        res.flushHeaders();

        let completed = false;
        res.on('finish', () => {
          completed = true;
        });
        req.on('close', () => {
          if (!completed) {
            stream.abort();
          }
        });

        stream.pipe(res);
        return;
      } catch (e) {
        console.error(e);
        return res.status(500).end((e as Error).message);
      }
    }

    const html = await readFile(path.resolve(distPath, 'index.html'), 'utf-8');
    res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
  });

  app.listen(3000, () => {
    console.log('Serving dist/public/ at http://localhost:3000');
  });
}
