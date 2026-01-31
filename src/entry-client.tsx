import * as ReactDOM from 'react-dom/client';
import App from './app.js';

ReactDOM.hydrateRoot(
  document.getElementById('app')!,
  <App path={window.location.pathname} />
);
