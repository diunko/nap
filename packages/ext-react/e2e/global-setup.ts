/**
 * Playwright global setup — copies manifest.test.json into dist/ so the
 * extension loads with test-specific host permissions (e.g. gitlab.grammarly.io).
 *
 * The production manifest.json stays untouched. Only dist/manifest.json is overwritten.
 */
import { copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function globalSetup() {
  const testManifest = resolve(__dirname, '..', 'manifest.test.json');
  const distManifest = resolve(__dirname, '..', 'dist', 'manifest.json');
  copyFileSync(testManifest, distManifest);
  console.log(`[global-setup] copied manifest.test.json → dist/manifest.json`);
}
