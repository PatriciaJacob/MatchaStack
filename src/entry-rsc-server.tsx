import type * as React from 'react';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-server-dom-webpack/server.node';
import HomePage from './rsc/HomePage.js';
import { ClientManifest } from './rsc/client-reference-runtime.js';

export function renderHomeRoute() {
  return <HomePage />;
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

export async function renderHomePayload(manifest: ClientManifest): Promise<string> {
  return await renderFlightPayloadToString(renderHomeRoute(), manifest.serverModuleMap);
}
