import * as React from 'react';
import { PassThrough, Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { renderToPipeableStream } from 'react-dom/server';
import { createFromNodeStream } from 'react-server-dom-webpack/client.node';
import { ClientManifest, installWebpackClientReferenceRuntime } from './rsc/client-reference-runtime.js';

declare global {
  // eslint-disable-next-line no-var
  var __webpack_chunk_load__: ((chunkId: string) => Promise<unknown>) | undefined;
  // eslint-disable-next-line no-var
  var __webpack_require__: (((moduleId: string) => unknown) & { m?: Record<string, unknown> }) | undefined;
}

async function renderHtmlToString(node: React.ReactNode): Promise<string> {
  const stream = renderToPipeableStream(node);

  return await new Promise((resolve, reject) => {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];

    sink.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    sink.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    sink.on('error', reject);

    stream.pipe(sink);
  });
}

function createRscBootstrapScript(manifest: ClientManifest, payload: string): string {
  const base64Payload = Buffer.from(payload, 'utf8').toString('base64');
  return `<script>window.__MATCHA_RSC_ENABLED__=true;window.__MATCHA_RSC_MANIFEST__=${JSON.stringify(manifest).replace(/</g, '\\u003c')};window.__MATCHA_RSC_PAYLOAD__=${JSON.stringify(base64Payload)};</script>`;
}

async function renderHomeHtml(payload: string, manifest: ClientManifest): Promise<string> {
  installWebpackClientReferenceRuntime(globalThis, async (chunkId) => {
    const chunkPath = manifest.ssrChunkMap?.[chunkId];
    if (!chunkPath) {
      throw new Error(`Unknown SSR client chunk "${chunkId}"`);
    }

    return await import(pathToFileURL(chunkPath).href);
  });

  const response = createFromNodeStream(Readable.from([payload]), {
    moduleMap: manifest.moduleMap,
    serverModuleMap: manifest.serverModuleMap,
    moduleLoading: null,
  }) as Promise<React.ReactNode>;
  const resolvedNode = await response;

  return await renderHtmlToString(
    <div data-matcha-rsc-root>
      {resolvedNode}
    </div>,
  );
}

export async function renderHomeDocument(
  template: string,
  manifest: ClientManifest,
  payload: string,
): Promise<string> {
  const html = await renderHomeHtml(payload, manifest);
  const bootstrapScript = createRscBootstrapScript(manifest, payload);

  return template
    .replace('<!--ssr-outlet-->', html)
    .replace('</head>', `${bootstrapScript}</head>`);
}
