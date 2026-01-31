import { Plugin, build } from 'vite';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Route {
    path: string;
}

interface RenderResult {
    html: string;
    props: Record<string, unknown>;
}

/**
 * Strip server-only code from client builds:
 * - getStaticProps exports
 * - Node.js built-in imports (Vite externalizes them before tree-shaking)
 *
     *   TODO: this is ugly but whatever
 */
function stripServerCode(code: string): string {
    // Remove getStaticProps export (arrow function or regular function)
    code = code.replace(
        /^export\s+const\s+getStaticProps\s*=[\s\S]*?^\};?\n/gm,
        ''
    );
    code = code.replace(
        /^export\s+(async\s+)?function\s+getStaticProps[\s\S]*?^\}\n/gm,
        ''
    );

    // Remove getStaticProps from route objects and imports
    code = code.replace(/,?\s*getStaticProps:\s*\w+/g, '');
    code = code.replace(/,\s*\{\s*getStaticProps\s+as\s+\w+\s*\}/g, '');
    code = code.replace(/\{\s*getStaticProps\s+as\s+\w+\s*\},?\s*/g, '');

    // Remove Node.js built-in imports (now unused after stripping getStaticProps)
    code = code.replace(/^import\s+.*\s+from\s+['"]node:.*['"];?\n/gm, '');

    return code;
}

export default function matcha(): Plugin {
    let root: string;
    let outDir: string;
    let isSsr: boolean;

    return {
        name: 'matcha',

        configResolved(config) {
            root = config.root;
            outDir = config.build.outDir;
            isSsr = Boolean(config.build.ssr);
        },

        transform(code, id) {
            // Only strip on client builds, only for src/ files
            if (isSsr) return;
            if (!id.includes('/src/')) return;
            if (!id.match(/\.(tsx?|jsx?)$/)) return;

            const stripped = stripServerCode(code);
            if (stripped !== code) {
                return { code: stripped, map: null };
            }
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

            // 2. Import compiled server module
            const serverEntryPath = resolve(serverOutDir, 'entry-server.js');
            const serverEntryUrl = pathToFileURL(serverEntryPath).href;
            const { render, routes } = await import(serverEntryUrl) as {
                render: (url: string) => Promise<RenderResult>;
                routes: Route[];
            };

            // 3. Read the template
            const templatePath = resolve(distDir, 'index.html');
            const template = await readFile(templatePath, 'utf-8');

            // 4. Render each route
            for (const route of routes) {
                const { html: appHtml, props } = await render(route.path);

                // Determine output directory
                const routeDir = route.path === '/'
                    ? distDir
                    : resolve(distDir, route.path.slice(1));

                await mkdir(routeDir, { recursive: true });

                // Write props JSON for client navigation
                const propsPath = resolve(routeDir, '_props.json');
                await writeFile(propsPath, JSON.stringify(props));

                // Inject props for initial hydration
                const propsScript = `<script>window.__INITIAL_PROPS__=${JSON.stringify(props)}</script>`;

                const finalHtml = template
                    .replace('<!--ssr-outlet-->', appHtml)
                    .replace('</head>', `${propsScript}</head>`);

                const htmlPath = resolve(routeDir, 'index.html');
                await writeFile(htmlPath, finalHtml);

                console.log(`[matcha] ${route.path} → ${htmlPath.replace(root + '/', '')}`);
            }

            // 5. Clean up server build
            await rm(serverOutDir, { recursive: true });

            console.log(`[matcha] SSG complete: ${routes.length} pages`);
        },
    };
}
