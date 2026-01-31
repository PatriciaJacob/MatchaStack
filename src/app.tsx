import * as React from 'react';
import { Router } from './router.js';
import { routes } from './routes.js';

interface AppProps {
  path: string;
}

export default function App({ path }: AppProps) {
  return (
    <React.StrictMode>
      <Router routes={routes} initialPath={path} />
    </React.StrictMode>
  );
}
