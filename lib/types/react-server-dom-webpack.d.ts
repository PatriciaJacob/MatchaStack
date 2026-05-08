declare module 'react-server-dom-webpack/server.node' {
  import type * as React from 'react';
  import type { Writable } from 'node:stream';

  export interface ClientReferenceRecord {
    id: string;
    chunks: string[];
    name: string;
    async?: boolean;
  }

  export interface PipeableStream {
    pipe(destination: Writable): void;
  }

  export function registerClientReference<T>(proxy: T, moduleId: string, exportName: string): T;

  export function renderToPipeableStream(
    model: React.ReactNode,
    moduleMap: Record<string, ClientReferenceRecord>,
  ): PipeableStream;
}

declare module 'react-server-dom-webpack/client.edge' {
  import type * as React from 'react';

  export interface ClientReferenceRecord {
    id: string;
    chunks: string[];
    name: string;
    async?: boolean;
  }

  export function createFromReadableStream(
    stream: ReadableStream<Uint8Array>,
    options: {
      serverConsumerManifest: {
        moduleMap: Record<string, Record<string, ClientReferenceRecord>>;
        serverModuleMap?: Record<string, ClientReferenceRecord>;
        moduleLoading?: unknown;
      };
    },
  ): Promise<React.ReactNode>;
}
