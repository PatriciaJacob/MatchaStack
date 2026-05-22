import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { ClientManifest, installFlightClientReferenceRuntime } from './rsc/client-reference-runtime.js';

declare global {
  interface Window {
    __MATCHA_RSC_ENABLED__?: boolean;
    __MATCHA_RSC_MANIFEST__?: ClientManifest;
    __MATCHA_RSC_PAYLOAD__?: string;
  }
}

const appRoot = document.getElementById('app')!;
let root: ReactDOM.Root | undefined;
let navigationVersion = 0;

type CreateFromReadableStream = typeof import('react-server-dom-webpack/client.edge').createFromReadableStream;
let createFromReadableStreamPromise: Promise<CreateFromReadableStream> | undefined;

function getManifest(): ClientManifest {
  const manifest = window.__MATCHA_RSC_MANIFEST__;
  if (!manifest) {
    throw new Error('MatchaStack expected an RSC client manifest.');
  }

  return manifest;
}

async function getCreateFromReadableStream(): Promise<CreateFromReadableStream> {
  createFromReadableStreamPromise ??= import('react-server-dom-webpack/client.edge')
    .then((module) => module.createFromReadableStream);

  return await createFromReadableStreamPromise;
}

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

function renderRscNode(node: React.ReactNode) {
  if (!root) {
    throw new Error('MatchaStack attempted to render before hydration.');
  }

  root.render(
    <React.StrictMode>
      <div data-matcha-rsc-root>
        {node}
      </div>
    </React.StrictMode>,
  );
}

async function decodeRscStream(stream: ReadableStream<Uint8Array>): Promise<React.ReactNode> {
  const manifest = getManifest();
  const createFromReadableStream = await getCreateFromReadableStream();
  const response = createFromReadableStream(
    stream,
    {
      serverConsumerManifest: {
        moduleMap: manifest.moduleMap,
        serverModuleMap: manifest.serverModuleMap,
        moduleLoading: null,
      },
    },
  ) as Promise<React.ReactNode>;

  return await response;
}

async function decodeInitialRscPayload(): Promise<React.ReactNode> {
  const payload = window.__MATCHA_RSC_PAYLOAD__;
  if (!payload) {
    throw new Error('MatchaStack expected an RSC payload.');
  }

  return await decodeRscStream(createStreamFromBase64(payload));
}

async function fetchRscNode(routeTarget: string): Promise<React.ReactNode> {
  const endpoint = new URL('/__matcha_rsc', window.location.origin);
  endpoint.searchParams.set('path', routeTarget);

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'text/x-component',
    },
  });
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!response.body || !contentType.includes('text/x-component')) {
    throw new Error(`Expected an RSC response for "${routeTarget}".`);
  }

  return await decodeRscStream(response.body);
}

function routeTargetFromUrl(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function shouldHandleLinkClick(event: MouseEvent): URL | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
    return null;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest('a');
  if (!anchor || anchor.target || anchor.hasAttribute('download')) {
    return null;
  }

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) {
    return null;
  }

  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) {
    return null;
  }

  return url;
}

async function navigateTo(url: URL, mode: 'push' | 'replace' | 'restore') {
  const version = navigationVersion + 1;
  navigationVersion = version;

  try {
    const node = await fetchRscNode(routeTargetFromUrl(url));
    if (version !== navigationVersion) {
      return;
    }

    if (mode === 'push') {
      window.history.pushState({ __matchaRsc: true }, '', url);
      window.scrollTo({ left: 0, top: 0 });
    } else if (mode === 'replace') {
      window.history.replaceState({ __matchaRsc: true }, '', url);
    }

    React.startTransition(() => {
      renderRscNode(node);
    });
  } catch (error) {
    if (mode === 'restore') {
      window.location.reload();
      return;
    }

    window.location.href = url.href;
  }
}

function installRscNavigation() {
  window.history.replaceState({ __matchaRsc: true }, '', window.location.href);

  window.addEventListener('click', (event) => {
    const url = shouldHandleLinkClick(event);
    if (!url) {
      return;
    }

    event.preventDefault();
    void navigateTo(url, 'push');
  });

  window.addEventListener('popstate', () => {
    void navigateTo(new URL(window.location.href), 'restore');
  });
}

async function bootstrapRsc() {
  installFlightClientReferenceRuntime(window, async (moduleId) => {
    const chunkUrl = getManifest().chunkMap[moduleId];
    if (!chunkUrl) {
      throw new Error(`Unknown client module "${moduleId}"`);
    }

    return await import(/* @vite-ignore */ chunkUrl);
  });
  const resolvedNode = await decodeInitialRscPayload();

  root = ReactDOM.hydrateRoot(
    appRoot,
    <React.StrictMode>
      <div data-matcha-rsc-root>
        {resolvedNode}
      </div>
    </React.StrictMode>,
  );
  installRscNavigation();
}

if (!window.__MATCHA_RSC_ENABLED__ || !window.__MATCHA_RSC_MANIFEST__ || !window.__MATCHA_RSC_PAYLOAD__) {
  throw new Error('MatchaStack expected an RSC document bootstrap.');
}

void bootstrapRsc();
