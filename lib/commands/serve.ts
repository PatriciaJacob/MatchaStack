import path from 'node:path';
import fs from 'node:fs';
import express from 'express';

export const description = 'Serve the built static files from dist/public/';

export async function run() {
  const app = express();
  const root = process.cwd();
  const distPath = path.resolve(root, 'dist/public');

  // Serve static files
  app.use(express.static(distPath));

  // Handle clean URLs: /about → /about/index.html
  app.use('*all', (req, res) => {
    const urlPath = req.originalUrl.split('?')[0] ?? '';
    
    // Try /path/index.html for clean URLs
    const indexPath = path.resolve(distPath, urlPath.slice(1), 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    // Fallback to root index.html (SPA fallback)
    res.sendFile(path.resolve(distPath, 'index.html'));
  });

  app.listen(3000, () => {
    console.log('Serving dist/public/ at http://localhost:3000');
  });
}
