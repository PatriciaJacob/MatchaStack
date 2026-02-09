import * as ReactDOM from 'react-dom/client';
import App from './app.js';

declare global {
  interface Window {
    __INITIAL_PROPS__?: Record<string, unknown>;
    __MATCHA_SSR_ROUTES__?: string[];
  }
}

const initialProps = window.__INITIAL_PROPS__ ?? {};

ReactDOM.hydrateRoot(
  document.getElementById('app')!,
  <App path={window.location.pathname} props={initialProps} />
);
