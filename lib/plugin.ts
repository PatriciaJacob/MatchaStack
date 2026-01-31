import { Plugin, build } from 'vite';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export default function matcha(): Plugin {
    let root: string;
    let outDir: string;

    return {
        name: 'matcha',

        configResolved(config) {
            root = config.root;
            outDir = config.build.outDir;
        },

        async closeBundle() {
            const distDir = resolve(root, outDir);
            const serverOutDir = resolve(distDir, 'server');

            // 1. Build server entry (SSR build)
            await build({
                configFile: false,
                root,
                build: {
                    ssr: resolve(root, 'src/entry-server.tsx'),
                    outDir: serverOutDir,
                    rollupOptions: {
                        output: {
                            format: 'esm',
                        },
                    },
                },
            });

            // 2. Import compiled server render fn
            const serverEntryPath = resolve(serverOutDir, 'entry-server.js');
            const serverEntryUrl = pathToFileURL(serverEntryPath).href;
            const { render } = await import(serverEntryUrl);

            // 3. Call renderToString
            const { html: appHtml } = render('/');

            // 4. Read client build's index.html
            const indexPath = resolve(distDir, 'index.html');
            const template = await readFile(indexPath, 'utf-8');

            // 5. Replace <!--ssr-outlet-->
            const finalHtml = template.replace('<!--ssr-outlet-->', appHtml);

            // 6. Write back
            await writeFile(indexPath, finalHtml);

            // 7. Clean up server build
            await rm(serverOutDir, { recursive: true });

            console.log(`[matcha] SSG complete: ${outDir}/index.html`);
        },
    };
}
