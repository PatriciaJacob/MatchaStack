export interface ClientReferenceRecord {
  id: string;
  chunks: string[];
  name: string;
  async?: boolean;
}

export interface ClientManifest {
  moduleMap: Record<string, Record<string, ClientReferenceRecord>>;
  serverModuleMap: Record<string, ClientReferenceRecord>;
  chunkMap: Record<string, string>;
  ssrChunkMap?: Record<string, string>;
}

declare global {
  interface Window {
    __webpack_chunk_load__?: (chunkId: string) => Promise<unknown>;
    __webpack_require__?: ((moduleId: string) => unknown) & {
      m?: Record<string, unknown>;
    };
  }
}

interface WebpackRuntimeTarget {
  __webpack_chunk_load__?: (chunkId: string) => Promise<unknown>;
  __webpack_require__?: ((moduleId: string) => unknown) & {
    m?: Record<string, unknown>;
  };
}

export function installWebpackClientReferenceRuntime(
  target: WebpackRuntimeTarget,
  loadChunk: (chunkId: string) => Promise<unknown>,
) {
  const loadedModules = new Map<string, unknown>();
  const loadingModules = new Map<string, Promise<unknown>>();

  target.__webpack_chunk_load__ = async (chunkId: string) => {
    if (loadedModules.has(chunkId)) {
      return loadedModules.get(chunkId);
    }

    const existing = loadingModules.get(chunkId);
    if (existing) {
      return existing;
    }

    const loadPromise = loadChunk(chunkId).then((moduleNamespace) => {
      loadedModules.set(chunkId, moduleNamespace);
      loadingModules.delete(chunkId);
      return moduleNamespace;
    }).catch((error: unknown) => {
      loadingModules.delete(chunkId);
      throw error;
    });

    loadingModules.set(chunkId, loadPromise);
    return loadPromise;
  };

  target.__webpack_require__ = Object.assign(
    (moduleId: string) => {
      if (!loadedModules.has(moduleId)) {
        throw new Error(`Client module "${moduleId}" was required before it finished loading.`);
      }

      return loadedModules.get(moduleId);
    },
    { m: Object.create(null) as Record<string, unknown> },
  );
}
