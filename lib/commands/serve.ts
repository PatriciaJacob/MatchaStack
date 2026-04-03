import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { pathToFileURL } from 'node:url';

interface Route {
  path: string;
  getServerSideProps?: unknown;
}

interface RenderResult {
  html: string;
  props: Record<string, unknown>;
}

interface RouteDataResult {
  route: Route | undefined;
  props: Record<string, unknown>;
}

export const description = 'Serve the built app with static pages and SSR routes';

export async function run() {
  const app = express();
  const root = process.cwd();
  const publicDir = path.resolve(root, 'dist/public');
  const serverEntryPath = path.resolve(root, 'dist/server/entry-server.js');
  const templatePath = path.resolve(publicDir, '_template.html');

  const template = await readFile(templatePath, 'utf-8');
  const serverEntryUrl = pathToFileURL(serverEntryPath).href;
  const { render, getRouteData } = await import(serverEntryUrl) as {
    render: (target: string) => Promise<RenderResult>;
    getRouteData: (target: string) => Promise<RouteDataResult>;
  };

  app.use(express.static(publicDir, { index: false, redirect: false }));

  app.get('/_matcha/data', async (req, res) => {
    const target = typeof req.query.url === 'string' ? req.query.url : null;

    if (!target) {
      return res.status(400).json({ error: 'Missing url query parameter' });
    }

    try {
      const { route, props } = await getRouteData(target);

      if (!route?.getServerSideProps) {
        return res.status(404).json({ error: 'No getServerSideProps for route' });
      }

      res.status(200).json(props);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.use('*all', async (req, res) => {
    const requestUrl = req.originalUrl;
    const parsed = new URL(requestUrl, 'http://localhost');
    const urlPath = parsed.pathname;

    const indexPath = path.resolve(publicDir, urlPath.slice(1), 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = await readFile(indexPath, 'utf-8');
      return res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    }

    try {
      const { html: appHtml, props } = await render(requestUrl);
      const propsScript = `<script>window.__INITIAL_PROPS__=${JSON.stringify(props).replace(/</g, '\\u003c')}</script>`;
      const html = template
        .replace('<!--ssr-outlet-->', appHtml)
        .replace('</head>', `${propsScript}</head>`);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      console.error(e);
      res.status(500).end((e as Error).message);
    }
  });

  app.listen(3000, () => {
    console.log('Serving MatchaStack at http://localhost:3000');
  });
}
