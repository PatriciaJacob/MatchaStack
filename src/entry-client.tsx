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
let navigationVersion = 0;

type CreateFromReadableStream = typeof import('react-server-dom-webpack/client.edge').createFromReadableStream;
type RscTree =
  | { status: 'ready'; node: React.ReactNode }
  | { status: 'pending'; response: Promise<React.ReactNode> };
type SetRscTree = React.Dispatch<React.SetStateAction<RscTree>>;
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

async function decodeRscStream(stream: ReadableStream<Uint8Array>): Promise<React.ReactNode> {
  const createFromReadableStream = await getCreateFromReadableStream();
  return createRscResponse(stream, createFromReadableStream);
}

function createRscResponse(
  stream: ReadableStream<Uint8Array>,
  createFromReadableStream: CreateFromReadableStream,
): Promise<React.ReactNode> {
  const manifest = getManifest();
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

  return response;
}

async function decodeInitialRscPayload(): Promise<React.ReactNode> {
  const payload = window.__MATCHA_RSC_PAYLOAD__;
  if (!payload) {
    throw new Error('MatchaStack expected an RSC payload.');
  }

  return await decodeRscStream(createStreamFromBase64(payload));
}

async function fetchRscTree(routeTarget: string): Promise<{ tree: Promise<React.ReactNode> }> {
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

  const createFromReadableStream = await getCreateFromReadableStream();
  return {
    tree: createRscResponse(response.body, createFromReadableStream),
  };
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

async function navigateTo(url: URL, mode: 'push' | 'restore', setTree: SetRscTree) {
  const version = navigationVersion + 1;
  navigationVersion = version;

  try {
    const { tree } = await fetchRscTree(routeTargetFromUrl(url));
    if (version !== navigationVersion) {
      return;
    }

    if (mode === 'push') {
      window.history.pushState({ __matchaRsc: true }, '', url);
      window.scrollTo({ left: 0, top: 0 });
    }

    React.startTransition(() => {
      setTree({ status: 'pending', response: tree });
    });
  } catch (error) {
    if (mode === 'restore') {
      window.location.reload();
      return;
    }

    window.location.href = url.href;
  }
}

function installRscNavigation(setTree: SetRscTree): () => void {
  window.history.replaceState({ __matchaRsc: true }, '', window.location.href);

  function handleClick(event: MouseEvent) {
    const url = shouldHandleLinkClick(event);
    if (!url) {
      return;
    }

    event.preventDefault();
    void navigateTo(url, 'push', setTree);
  }

  function handlePopState() {
    void navigateTo(new URL(window.location.href), 'restore', setTree);
  }

  window.addEventListener('click', handleClick);
  window.addEventListener('popstate', handlePopState);

  return () => {
    window.removeEventListener('click', handleClick);
    window.removeEventListener('popstate', handlePopState);
  };
}

function RscRouteSlot({ tree }: { tree: RscTree }) {
  if (tree.status === 'ready') {
    return tree.node;
  }

  return React.use(tree.response);
}

function MatchaRoot({ initialTree }: { initialTree: React.ReactNode }) {
  const [tree, setTree] = React.useState<RscTree>({ status: 'ready', node: initialTree });

  React.useEffect(() => {
    return installRscNavigation(setTree);
  }, []);

  return (
    <div data-matcha-rsc-root>
      <React.Suspense fallback={<p data-matcha-route-pending>Loading route...</p>}>
        <RscRouteSlot tree={tree} />
      </React.Suspense>
    </div>
  );
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

  ReactDOM.hydrateRoot(
    appRoot,
    <React.StrictMode>
      <MatchaRoot initialTree={resolvedNode} />
    </React.StrictMode>,
  );
}

if (!window.__MATCHA_RSC_ENABLED__ || !window.__MATCHA_RSC_MANIFEST__ || !window.__MATCHA_RSC_PAYLOAD__) {
  throw new Error('MatchaStack expected an RSC document bootstrap.');
}

void bootstrapRsc();
