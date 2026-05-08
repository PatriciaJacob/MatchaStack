import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { analyzeModule, toModuleId } from './module-classifier.js';

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

export interface ClientModuleInfo {
  filePath: string;
  moduleId: string;
  exports: string[];
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walk(resolved));
      continue;
    }

    files.push(resolved);
  }

  return files;
}

function isSourceModule(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/.test(filePath);
}

export async function collectClientModules(root: string): Promise<ClientModuleInfo[]> {
  const srcDir = path.resolve(root, 'src');
  const files = await walk(srcDir);
  const clientModules: ClientModuleInfo[] = [];

  for (const filePath of files) {
    if (!isSourceModule(filePath)) {
      continue;
    }

    const code = await readFile(filePath, 'utf8');
    const analysis = analyzeModule(code, filePath);
    if (!analysis.useClient) {
      continue;
    }

    clientModules.push({
      filePath,
      moduleId: toModuleId(root, filePath),
      exports: analysis.exports.length > 0 ? analysis.exports : ['default'],
    });
  }

  return clientModules;
}

export function buildDevClientManifest(root: string, modules: ClientModuleInfo[]): ClientManifest {
  const moduleMap: ClientManifest['moduleMap'] = {};
  const serverModuleMap: ClientManifest['serverModuleMap'] = {};
  const chunkMap: ClientManifest['chunkMap'] = {};
  const ssrChunkMap: ClientManifest['ssrChunkMap'] = {};

  for (const moduleInfo of modules) {
    chunkMap[moduleInfo.moduleId] = `/${moduleInfo.moduleId}`;
    ssrChunkMap[moduleInfo.moduleId] = moduleInfo.filePath;
    moduleMap[moduleInfo.moduleId] = {};

    for (const exportName of moduleInfo.exports) {
      const record = {
        id: moduleInfo.moduleId,
        chunks: [moduleInfo.moduleId, moduleInfo.moduleId],
        name: exportName,
      };

      moduleMap[moduleInfo.moduleId][exportName] = record;
      serverModuleMap[`${moduleInfo.moduleId}#${exportName}`] = record;
    }
  }

  return { moduleMap, serverModuleMap, chunkMap, ssrChunkMap };
}
