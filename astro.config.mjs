// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
	vite: {
		resolve: {
			alias: {
				'@': path.resolve(__dirname, 'src'),
			},
		},
	},
});
