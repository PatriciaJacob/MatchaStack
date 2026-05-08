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

let jsxDevRuntime;
try {
  jsxDevRuntime = require(resolve(process.cwd(), 'node_modules/react/cjs/react-jsx-dev-runtime.react-server.development.js'));
} finally {
  Module._load = originalLoad;
}

export const Fragment = jsxDevRuntime.Fragment;
export const jsxDEV = jsxDevRuntime.jsxDEV;
