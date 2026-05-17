import { defineConfig } from 'vite';
import { resolve } from 'path';

// Chrome extension build — needs production build (not dev server).
// just-bash imports node:zlib which rollup can't resolve for browser.
// We polyfill/stub it since just-bash only uses gunzipSync for network fetch
// decompression, which isomorphic-git handles separately in browser.
export default defineConfig({
  root: '.',
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'side-panel': resolve(__dirname, 'side-panel.html'),
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        popup: resolve(__dirname, 'popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      // Stub node:zlib for browser — just-bash references it but
      // the browser path doesn't actually need gunzip (handled by fetch).
      'node:zlib': resolve(__dirname, 'src/stubs/zlib.ts'),
    },
  },
  optimizeDeps: {
    include: ['just-bash', 'isomorphic-git', 'monaco-editor'],
  },
});
