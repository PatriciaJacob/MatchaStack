import { build as viteBuild } from 'vite';

export const description = 'Build for production (SSG)';

export async function run() {
  console.log('[matcha] Building for production...\n');

  await viteBuild();

  console.log('\n[matcha] Build complete!');
}
