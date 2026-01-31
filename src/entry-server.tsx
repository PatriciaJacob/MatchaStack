import { renderToString } from 'react-dom/server';
import App from './app.js';

export function render(url: string) {
  const html = renderToString(<App path={url} />);
  return { html };
}
