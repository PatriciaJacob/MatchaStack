import * as React from 'react';
import { RouteProps, Router } from './router.js';
import { routes } from './routes.js';

interface AppProps {
  path: string;
  props: RouteProps;
}

export default function App({ path, props }: AppProps) {
  return (
    <React.StrictMode>
      <Router routes={routes} initialPath={path} initialProps={props} />
    </React.StrictMode>
  );
}
