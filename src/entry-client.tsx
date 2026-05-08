import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app.js';
import { ClientManifest, installFlightClientReferenceRuntime } from './rsc/client-reference-runtime.js';

declare global {
  interface Window {
    __INITIAL_PROPS__?: Record<string, unknown>;
    __MATCHA_SSR_ROUTES__?: string[];
    __MATCHA_RSC_ENABLED__?: boolean;
    __MATCHA_RSC_MANIFEST__?: ClientManifest;
    __MATCHA_RSC_PAYLOAD__?: string;
  }
}

const initialProps = window.__INITIAL_PROPS__ ?? {};
const appRoot = document.getElementById('app')!;

function createStreamFromBase64(base64: string): ReadableStream<Uint8Array> {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function bootstrapRsc() {
  installFlightClientReferenceRuntime(window, async (moduleId) => {
    const chunkUrl = window.__MATCHA_RSC_MANIFEST__.chunkMap[moduleId];
    if (!chunkUrl) {
      throw new Error(`Unknown client module "${moduleId}"`);
    }

    return await import(/* @vite-ignore */ chunkUrl);
  });
  const { createFromReadableStream } = await import('react-server-dom-webpack/client.edge');
  const response = createFromReadableStream(
    createStreamFromBase64(window.__MATCHA_RSC_PAYLOAD__),
    {
      serverConsumerManifest: {
        moduleMap: window.__MATCHA_RSC_MANIFEST__.moduleMap,
        serverModuleMap: window.__MATCHA_RSC_MANIFEST__.serverModuleMap,
        moduleLoading: null,
      },
    },
  ) as Promise<React.ReactNode>;
  const resolvedNode = await response;

  ReactDOM.hydrateRoot(
    appRoot,
    <React.StrictMode>
      <div data-matcha-rsc-root>
        {resolvedNode}
      </div>
    </React.StrictMode>,
  );
}

if (window.__MATCHA_RSC_ENABLED__ && window.__MATCHA_RSC_MANIFEST__ && window.__MATCHA_RSC_PAYLOAD__) {
  void bootstrapRsc();
} else {
  ReactDOM.hydrateRoot(
    appRoot,
    <App path={window.location.pathname} props={initialProps} />
  );
}
