import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

const projectRoot = import.meta.dirname || process.cwd();
const MEDIAPIPE_WASM_DIR = path.resolve(projectRoot, 'node_modules/@mediapipe/tasks-vision/wasm');
// Background blur/replacement only needs the SIMD build (every Chromium Electron ships SIMD)
const MEDIAPIPE_WASM_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

/** Serves the MediaPipe wasm runtime at ./mediapipe/wasm in dev and copies it into the build. */
function mediapipeWasm(): Plugin {
  return {
    name: 'mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use('/mediapipe/wasm', (req, res, next) => {
        const name = path.basename(decodeURIComponent((req.url || '').split('?')[0]));
        if (!MEDIAPIPE_WASM_FILES.includes(name)) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        fs.createReadStream(path.join(MEDIAPIPE_WASM_DIR, name)).pipe(res);
      });
    },
    writeBundle(options) {
      const dest = path.join(options.dir || 'dist/renderer', 'mediapipe/wasm');
      fs.mkdirSync(dest, { recursive: true });
      for (const f of MEDIAPIPE_WASM_FILES) fs.copyFileSync(path.join(MEDIAPIPE_WASM_DIR, f), path.join(dest, f));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mediapipeWasm()],
  base: './',
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/.git/**'],
    },
  },
});
