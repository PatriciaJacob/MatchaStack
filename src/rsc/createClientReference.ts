import { registerClientReference } from 'react-server-dom-webpack/server.node';

export function createClientReference<T>(moduleId: string, exportName: string): T {
  return registerClientReference(
    function clientReferenceProxy() {
      throw new Error(`Cannot call the client export "${exportName}" from "${moduleId}" on the server.`);
    },
    moduleId,
    exportName,
  ) as T;
}
