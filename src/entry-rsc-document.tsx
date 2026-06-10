import * as React from 'react';
import { PassThrough, Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { renderToPipeableStream } from 'react-dom/server';
import { createFromNodeStream } from 'react-server-dom-webpack/client.node';
import { ClientManifest, installFlightClientReferenceRuntime } from './rsc/client-reference-runtime.js';

interface FlightPipeableStream {
  pipe: (destination: NodeJS.WritableStream) => void;
  abort: () => void;
}

interface DocumentPipeableStream {
  pipe: (destination: Writable) => void;
  abort: () => void;
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
  const browserManifest: ClientManifest = {
    moduleMap: manifest.moduleMap,
    serverModuleMap: manifest.serverModuleMap,
    chunkMap: manifest.chunkMap,
  };
  const base64Payload = Buffer.from(payload, 'utf8').toString('base64');
  return `<script>window.__MATCHA_RSC_ENABLED__=true;window.__MATCHA_RSC_MANIFEST__=${JSON.stringify(browserManifest).replace(/</g, '\\u003c')};window.__MATCHA_RSC_PAYLOAD__=${JSON.stringify(base64Payload)};</script>`;
}

async function prepareSsrClientReferences(manifest: ClientManifest): Promise<void> {
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
}

function createRscResponse(
  stream: NodeJS.ReadableStream,
  manifest: ClientManifest,
): Promise<React.ReactNode> {
  const response = createFromNodeStream(stream, {
    moduleMap: manifest.moduleMap,
    serverModuleMap: manifest.serverModuleMap,
    moduleLoading: null,
  }) as Promise<React.ReactNode>;

  return response;
}

function RscDocumentRoot({ children }: { children: React.ReactNode }) {
  return (
    <div data-matcha-rsc-root>
      <React.Suspense fallback={<p data-matcha-route-pending>Loading route...</p>}>
        {children}
      </React.Suspense>
    </div>
  );
}

function RscDocumentResponse({ response }: { response: Promise<React.ReactNode> }) {
  return React.use(response);
}

async function renderRscHtml(payload: string, manifest: ClientManifest): Promise<string> {
  await prepareSsrClientReferences(manifest);
  const resolvedNode = await createRscResponse(Readable.from([payload]), manifest);
  return await renderHtmlToString(
    <RscDocumentRoot>
      {resolvedNode}
    </RscDocumentRoot>,
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

function splitStreamingTemplate(template: string): {
  beforeOutlet: string;
  afterOutlet: string;
  moduleScripts: string;
} {
  const moduleScripts: string[] = [];
  const templateWithoutEntryScripts = template.replace(
    /<script\b(?=[^>]*\btype=["']module["'])[^>]*><\/script>\s*/g,
    (script) => {
      moduleScripts.push(script);
      return '';
    },
  );
  const [beforeOutlet, afterOutlet] = templateWithoutEntryScripts.split('<!--ssr-outlet-->');

  if (afterOutlet === undefined) {
    throw new Error('MatchaStack expected an <!--ssr-outlet--> in the HTML template.');
  }

  return {
    beforeOutlet,
    afterOutlet,
    moduleScripts: moduleScripts.join(''),
  };
}

function appendBootstrapScripts(
  afterOutlet: string,
  bootstrapScript: string,
  moduleScripts: string,
): string {
  const scripts = `${bootstrapScript}${moduleScripts}`;

  if (afterOutlet.includes('</body>')) {
    return afterOutlet.replace('</body>', `${scripts}</body>`);
  }

  return `${afterOutlet}${scripts}`;
}

function collectPayload(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

export async function renderRscDocumentStream(
  template: string,
  manifest: ClientManifest,
  flightStream: FlightPipeableStream,
): Promise<DocumentPipeableStream> {
  await prepareSsrClientReferences(manifest);

  const flightReadable = new PassThrough();
  const payloadPromise = collectPayload(flightReadable);
  const response = createRscResponse(flightReadable, manifest);
  const { beforeOutlet, afterOutlet, moduleScripts } = splitStreamingTemplate(template);
  let htmlStream: ReturnType<typeof renderToPipeableStream> | undefined;

  flightStream.pipe(flightReadable);

  return {
    abort() {
      flightStream.abort();
      htmlStream?.abort();
      flightReadable.destroy();
    },
    pipe(destination) {
      const reactOutput = new PassThrough();

      reactOutput.on('data', (chunk) => {
        destination.write(chunk);
      });
      reactOutput.on('end', async () => {
        try {
          const payload = await payloadPromise;
          const bootstrapScript = createRscBootstrapScript(manifest, payload);
          destination.end(appendBootstrapScripts(afterOutlet, bootstrapScript, moduleScripts));
        } catch (error) {
          destination.destroy(error as Error);
        }
      });
      reactOutput.on('error', (error) => {
        destination.destroy(error);
      });

      destination.write(beforeOutlet);
      htmlStream = renderToPipeableStream(
        <RscDocumentRoot>
          <RscDocumentResponse response={response} />
        </RscDocumentRoot>,
        {
          onShellReady() {
            htmlStream?.pipe(reactOutput);
          },
          onError(error) {
            console.error(error);
          },
        },
      );
    },
  };
}
