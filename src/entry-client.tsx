import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

import App from './app.js';

ReactDOM.hydrateRoot(document.getElementById('app')!,
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
