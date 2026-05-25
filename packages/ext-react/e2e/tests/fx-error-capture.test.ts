/**
 * FX-P20: Real GitLab error capture — discovery test.
 *
 * Clones from gitlab.grammarly.io WITHOUT a token, captures the actual error object
 * from isomorphic-git, logs its full structure. This is NOT a regression test — it's
 * an observation test to discover the real error shape before writing classification logic.
 *
 * VPN required: needs network access to gitlab.grammarly.io.
 * Token source: GITLAB_API_TOKEN from .env at repo root.
 */
import { test, expect, openGitHub, openSidePanel, waitForPanelReady } from './fixtures';
import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..', '..');

// Read GITLAB_API_TOKEN from .env
let GITLAB_TOKEN = '';
try {
  const envContent = readFileSync(resolve(repoRoot, '.env'), 'utf8');
  const match = envContent.match(/^GITLAB_API_TOKEN=(.+)$/m);
  if (match) GITLAB_TOKEN = match[1].trim();
} catch { /* .env not found */ }

const GITLAB_HASH = '#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL_WITH_GITLAB_HASH = `https://github.com/diunko/nap-test-main${GITLAB_HASH}`;

test.describe('FX-P20: GitLab error capture', () => {
  test.skip(!!process.env.CI, 'requires VPN access to gitlab.grammarly.io');

  test('capture real isomorphic-git error on 401 (no token)', async ({ context, extensionId }) => {
    test.setTimeout(90_000);

    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);
    await waitForPanelReady(panel);

    // The pipeline runs automatically. Wait for clone step to fail (no token).
    // Pipeline state should show error on the clone step.
    await panel.waitForFunction(
      () => {
        const p = (window as any).__napPipeline__;
        if (!p) return false;
        const state = p.getState();
        return state.overall === 'error';
      },
      { timeout: 30_000 },
    );

    // Read the pipeline state to see what the clone step captured
    const pipelineState = await panel.evaluate(() => {
      const p = (window as any).__napPipeline__;
      return p ? p.getState() : null;
    });

    console.log('=== FX-P20: Pipeline state after clone failure (NO TOKEN) ===');
    console.log(JSON.stringify(pipelineState, null, 2));
    console.log('=== END ===');

    // Now the critical part: capture the RAW error from isomorphic-git.
    // Instrument the page by patching the clone step's dependency to capture
    // the raw error before classification.
    // We do this by calling git.clone directly from the bundled code:
    const rawError = await panel.evaluate(async () => {
      const raw = (window as any).__napPipelineRawError__;
      if (raw) {
        return {
          source: 'instrumented',
          name: raw.name,
          message: raw.message,
          // Access via prototype chain (not own property for isomorphic-git HttpError)
          statusCode: raw.statusCode,
          statusCodeViaAccess: raw['statusCode'],
          code: raw.code,
          ownKeys: Object.getOwnPropertyNames(raw),
          // Also check prototype chain
          protoKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(raw) ?? {}),
          dataStatusCode: raw.data?.statusCode,
          // Check if statusCode lives on the error or data
          hasOwnStatusCode: raw.hasOwnProperty?.('statusCode'),
          dataKeys: raw.data ? Object.keys(raw.data) : [],
          dataFull: raw.data ? JSON.stringify(raw.data).substring(0, 500) : null,
          json: JSON.stringify(raw, Object.getOwnPropertyNames(raw)).substring(0, 2000),
        };
      }
      return { source: 'not-found' };
    });

    console.log('=== FX-P20: Raw error capture ===');
    console.log(JSON.stringify(rawError, null, 2));
    console.log('=== END ===');

    // Find the clone step in pipeline state
    const cloneStep = pipelineState?.steps?.find((s: any) => s.name?.startsWith('cloning'));
    console.log('=== CLONE STEP STATE ===');
    console.log(JSON.stringify(cloneStep, null, 2));

    expect(cloneStep?.status).toBe('error');
    // The critical assertion: does the error say "authentication failed" or "can't reach"?
    console.log(`\nCLONE ERROR: "${cloneStep?.error}"`);
    console.log(`CLONE HINT: "${cloneStep?.hint}"`);
  });
});
