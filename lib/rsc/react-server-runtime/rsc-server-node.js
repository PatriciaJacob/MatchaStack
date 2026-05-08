import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const reactServer = require(resolve(process.cwd(), 'node_modules/react/cjs/react.react-server.development.js'));

const originalLoad = Module._load;
Module._load = function loadWithReactServerCondition(request, parent, isMain) {
  if (request === 'react') {
    return reactServer;
  }

  return originalLoad.call(this, request, parent, isMain);
};

let serverDom;
try {
  serverDom = require(resolve(process.cwd(), 'node_modules/react-server-dom-webpack/server.node.js'));
} finally {
  Module._load = originalLoad;
}

export const renderToPipeableStream = serverDom.renderToPipeableStream;
export const renderToReadableStream = serverDom.renderToReadableStream;
export const registerClientReference = serverDom.registerClientReference;
export const registerServerReference = serverDom.registerServerReference;
