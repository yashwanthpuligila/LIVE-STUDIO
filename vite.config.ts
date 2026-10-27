import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname || process.cwd(), 'src'),
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
