import { createServer, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface SsrRuntimeModule {
  handleRequest: (requestUrl: string | URL) => Promise<{
    statusCode: number;
    headers?: Record<string, string>;
    body?: string;
  }>;
  isSsrRoute: (routeTarget: string) => boolean;
  propsEndpoint: string;
}

export const description = 'Serve the production build with static + SSR routes';

export async function run() {
  const root = process.cwd();
  const distPath = path.resolve(root, 'dist/public');
  const ssrRuntimePath = path.resolve(root, 'dist/server/ssr-runtime.js');

  let ssrRuntime: SsrRuntimeModule | null = null;
  if (fs.existsSync(ssrRuntimePath)) {
    ssrRuntime = await import(pathToFileURL(ssrRuntimePath).href) as SsrRuntimeModule;
  }

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost:3000'}`);
    const routeTarget = `${requestUrl.pathname}${requestUrl.search}`;

    const staticFilePath = await resolveStaticFile(distPath, requestUrl.pathname);
    if (staticFilePath) {
      return sendFile(res, staticFilePath);
    }

    if (
      ssrRuntime &&
      (requestUrl.pathname === ssrRuntime.propsEndpoint || ssrRuntime.isSsrRoute(routeTarget))
    ) {
      try {
        const response = await ssrRuntime.handleRequest(requestUrl);
        res.writeHead(response.statusCode, response.headers);
        res.end(response.body ?? '');
        return;
      } catch (error) {
        console.error(error);
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end((error as Error).message);
        return;
      }
    }

    const fallbackPath = path.resolve(distPath, 'index.html');
    return sendFile(res, fallbackPath);
  });

  server.listen(3000, () => {
    console.log('Serving dist/public/ at http://localhost:3000');
  });
}

async function resolveStaticFile(distPath: string, pathname: string) {
  const cleanPath = decodeURIComponent(pathname);
  const candidatePaths = new Set<string>();

  if (cleanPath === '/') {
    candidatePaths.add(path.resolve(distPath, 'index.html'));
  } else {
    const relativePath = cleanPath.replace(/^\/+/, '');
    candidatePaths.add(path.resolve(distPath, relativePath));
    candidatePaths.add(path.resolve(distPath, relativePath, 'index.html'));
  }

  for (const candidatePath of candidatePaths) {
    try {
      const stat = await fs.promises.stat(candidatePath);
      if (stat.isFile()) {
        return candidatePath;
      }
    } catch {
      // Ignore missing paths and continue trying candidates.
    }
  }

  return null;
}

async function sendFile(res: ServerResponse, filePath: string) {
  const body = await readFile(filePath);
  res.writeHead(200, { 'content-type': contentTypeForFile(filePath) });
  res.end(body);
}

function contentTypeForFile(filePath: string) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}
