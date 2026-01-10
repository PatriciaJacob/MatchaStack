import { defineConfig } from 'vite'
import matcha from './lib/plugin.js';

export default defineConfig({
    plugins: [matcha()]
});
