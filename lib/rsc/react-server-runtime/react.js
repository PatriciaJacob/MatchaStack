import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const React = require(resolve(process.cwd(), 'node_modules/react/cjs/react.react-server.development.js'));

export const Children = React.Children;
export const Fragment = React.Fragment;
export const Profiler = React.Profiler;
export const StrictMode = React.StrictMode;
export const Suspense = React.Suspense;
export const __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
  React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
export const cache = React.cache;
export const cacheSignal = React.cacheSignal;
export const captureOwnerStack = React.captureOwnerStack;
export const cloneElement = React.cloneElement;
export const createElement = React.createElement;
export const createRef = React.createRef;
export const forwardRef = React.forwardRef;
export const isValidElement = React.isValidElement;
export const lazy = React.lazy;
export const memo = React.memo;
export const use = React.use;
export const useCallback = React.useCallback;
export const useDebugValue = React.useDebugValue;
export const useId = React.useId;
export const useMemo = React.useMemo;
export const version = React.version;

export default React;
