declare module 'react-server-dom-webpack/server.node' {
  import type { ReactNode } from 'react';
  import type { Writable } from 'node:stream';

  export interface PipeableStream {
    pipe(destination: Writable): void;
  }

  export function renderToPipeableStream(
    model: ReactNode,
    webpackMap: unknown,
    options?: {
      onError?: (error: unknown) => void;
    },
  ): PipeableStream;

  export function registerClientReference<T>(
    proxyImplementation: T,
    id: string,
    exportName: string,
  ): T;
}

declare module 'react-server-dom-webpack/client.edge' {
  import type { ReactNode } from 'react';

  export function createFromReadableStream(
    stream: ReadableStream<Uint8Array>,
    options?: {
      serverConsumerManifest?: {
        moduleMap: unknown;
        serverModuleMap: unknown;
        moduleLoading: unknown;
      };
    },
  ): Promise<ReactNode>;
}

declare module 'react-server-dom-webpack/client.node' {
  import type { ReactNode } from 'react';
  import type { Readable } from 'node:stream';

  export function createFromNodeStream(
    stream: Readable,
    options?: {
      moduleMap: unknown;
      serverModuleMap: unknown;
      moduleLoading: unknown;
    },
  ): Promise<ReactNode>;
}
