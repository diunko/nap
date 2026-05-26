import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Chrome extension build — needs production build (not dev server).
// just-bash imports node:zlib which rollup can't resolve for browser.
export default defineConfig(({ mode }) => ({
  root: '.',
  plugins: [react()],
  esbuild: {
    // Strip debug logging in production; keep console.warn/error for real issues
    pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode !== 'production',
    rollupOptions: {
      input: {
        'side-panel': resolve(__dirname, 'side-panel.html'),
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
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
      'node:zlib': resolve(__dirname, 'src/stubs/zlib.ts'),
    },
  },
  optimizeDeps: {
    include: ['just-bash', 'isomorphic-git', 'monaco-editor'],
  },
}));
