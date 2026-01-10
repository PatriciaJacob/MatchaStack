import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const description = 'Serve the dist/ folder';

export async function run() {
  const port = 3000;
  const distDir = path.resolve(process.cwd(), 'dist');

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
  };

  const server = createServer(async (req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url!;
    const filePath = path.join(distDir, url);
    const ext = path.extname(filePath);

    try {
      const content = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log(`[matcha] Serving dist/ at http://localhost:${port}`);
  });
}
