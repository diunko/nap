import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  build: { target: 'esnext' },
  optimizeDeps: { include: ['just-bash', 'isomorphic-git'] }
});
