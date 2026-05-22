import type * as React from 'react';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-server-dom-webpack/server.node';
import HomePage from './rsc/HomePage.js';
import AboutPage from './rsc/AboutPage.js';
import UserProfilePage from './rsc/UserProfilePage.js';
import { ClientManifest } from './rsc/client-reference-runtime.js';

interface RscRoute {
  path: string;
  render: () => React.ReactNode;
}

export const rscRoutes: RscRoute[] = [
  { path: '/', render: () => <HomePage /> },
  { path: '/about', render: () => <AboutPage /> },
  { path: '/user-profile', render: () => <UserProfilePage /> },
];

function normalizePath(routePath: string): string {
  return routePath === '/' ? routePath : routePath.replace(/\/$/, '');
}

function toPathname(routeTarget: string): string {
  return normalizePath(new URL(routeTarget, 'http://localhost').pathname);
}

export function matchRscRoute(routeTarget: string): RscRoute | undefined {
  const pathname = toPathname(routeTarget);
  return rscRoutes.find((route) => route.path === pathname);
}

export function renderRoute(routeTarget: string) {
  const route = matchRscRoute(routeTarget);
  if (!route) {
    return (
      <div>
        <h1>404 - Not Found</h1>
        <p>No RSC route matched {toPathname(routeTarget)}.</p>
      </div>
    );
  }

  return route.render();
}

async function renderFlightPayloadToString(
  model: React.ReactNode,
  moduleMap: ClientManifest['serverModuleMap'],
): Promise<string> {
  const stream = renderToPipeableStream(model, moduleMap);

  return await new Promise((resolve, reject) => {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];

    sink.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    sink.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    sink.on('error', reject);

    try {
      stream.pipe(sink);
    } catch (error) {
      reject(error);
    }
  });
}

export async function renderRoutePayload(
  routeTarget: string,
  manifest: ClientManifest,
): Promise<string> {
  return await renderFlightPayloadToString(renderRoute(routeTarget), manifest.serverModuleMap);
}
