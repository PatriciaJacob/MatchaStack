import * as React from 'react';
import { PassThrough, Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { renderToPipeableStream } from 'react-dom/server';
import { createFromNodeStream } from 'react-server-dom-webpack/client.node';
import { ClientManifest, installFlightClientReferenceRuntime } from './rsc/client-reference-runtime.js';

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
  const browserManifest: ClientManifest = {
    moduleMap: manifest.moduleMap,
    serverModuleMap: manifest.serverModuleMap,
    chunkMap: manifest.chunkMap,
  };
  const base64Payload = Buffer.from(payload, 'utf8').toString('base64');
  return `<script>window.__MATCHA_RSC_ENABLED__=true;window.__MATCHA_RSC_MANIFEST__=${JSON.stringify(browserManifest).replace(/</g, '\\u003c')};window.__MATCHA_RSC_PAYLOAD__=${JSON.stringify(base64Payload)};</script>`;
}

async function renderRscHtml(payload: string, manifest: ClientManifest): Promise<string> {
  installFlightClientReferenceRuntime(globalThis, async (moduleId) => {
    const chunkPath = manifest.ssrChunkMap?.[moduleId];
    if (!chunkPath) {
      throw new Error(`Unknown SSR client module "${moduleId}"`);
    }

    return await import(/* @vite-ignore */ pathToFileURL(chunkPath).href);
  });
  await Promise.all(
    Object.keys(manifest.moduleMap).map((moduleId) => globalThis.__webpack_chunk_load__?.(moduleId)),
  );

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

export async function renderRscDocument(
  template: string,
  manifest: ClientManifest,
  payload: string,
): Promise<string> {
  const html = await renderRscHtml(payload, manifest);
  const bootstrapScript = createRscBootstrapScript(manifest, payload);

  return template
    .replace('<!--ssr-outlet-->', html)
    .replace('</head>', `${bootstrapScript}</head>`);
}
