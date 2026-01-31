import * as React from 'react';
import { renderToString } from "react-dom/server";

import App from './app.js';

export function render(_url: string) {
  // call your SSR function or API here and pass the result as props
  const html = renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  return { html };
}
