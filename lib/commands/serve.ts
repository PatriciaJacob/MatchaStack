import path from 'node:path';
import express from 'express';

export const description = 'Serve the built static files from dist/public/';

export async function run() {
  const app = express();
  const root = process.cwd();
  const distPath = path.resolve(root, 'dist/public');

  app.use(express.static(distPath));

  // Fallback to index.html for SPA routing
  app.use('*all', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });

  app.listen(3000, () => {
    console.log('Serving dist/public/ at http://localhost:3000');
  });
}
