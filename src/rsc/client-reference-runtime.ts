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

export function installFlightClientReferenceRuntime(
  target: WebpackRuntimeTarget,
  loadModule: (moduleId: string) => Promise<unknown>,
) {
  const loadedModules = new Map<string, unknown>();
  const loadingModules = new Map<string, Promise<unknown>>();

  target.__webpack_chunk_load__ = async (moduleId: string) => {
    if (loadedModules.has(moduleId)) {
      return loadedModules.get(moduleId);
    }

    const existing = loadingModules.get(moduleId);
    if (existing) {
      return existing;
    }

    const loadPromise = loadModule(moduleId).then((moduleNamespace) => {
      loadedModules.set(moduleId, moduleNamespace);
      loadingModules.delete(moduleId);
      return moduleNamespace;
    }).catch((error: unknown) => {
      loadingModules.delete(moduleId);
      throw error;
    });

    loadingModules.set(moduleId, loadPromise);
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
