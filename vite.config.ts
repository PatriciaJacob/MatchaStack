import { defineConfig } from 'vite'
import matcha from './lib/plugin.js';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    plugins: [react(), matcha()],
    define: {
        'process.env.NODE_ENV': JSON.stringify('development')
    },
    build: {
        minify: false,
        outDir: 'dist/public',
    }
});
