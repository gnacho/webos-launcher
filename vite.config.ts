import {defineConfig, type Plugin} from 'vite';
import preact from '@preact/preset-vite';

// webOS 5.x runs Chrome 68 and webOS 6.x runs Chrome 79. Two things matter for those engines:
//  1. Module scripts (`<script type="module">`) are refused when loaded from file://
//     because the sandbox serves them with no MIME type, so the bundle must be a
//     classic script.
//  2. ES2020 syntax such as `?.` and `??` is a SyntaxError, so everything
//     (dependencies included) is compiled down to the oldest target, chrome68,
//     which keeps the app valid on both webOS 5 and webOS 6.
const BROWSER_TARGET = 'chrome68';

/** Rewrites Vite's module entry tag into a classic deferred script tag. */
function classicScriptTag (): Plugin {
	return {
		name: 'classic-script-tag',
		enforce: 'post',
		transformIndexHtml (html) {
			return html
				.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
				.replace(/<link rel="stylesheet" crossorigin href="/g, '<link rel="stylesheet" href="');
		}
	};
}

export default defineConfig({
	base: './',            // the app is loaded from a local file path on the TV
	plugins: [preact(), classicScriptTag()],
	build: {
		target: BROWSER_TARGET,
		outDir: 'dist',
		modulePreload: false,
		cssTarget: BROWSER_TARGET,
		rollupOptions: {
			output: {
				format: 'iife',
				inlineDynamicImports: true,
				entryFileNames: 'assets/app.js',
				assetFileNames: 'assets/[name][extname]'
			}
		}
	}
});
