import { defineConfig } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  globalSetup: resolve(__dirname, 'global-setup.ts'),
});
