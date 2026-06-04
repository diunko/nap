/**
 * FX-P20 / FX3-S01: Real GitLab error capture — discovery test.
 *
 * Clones from gitlab.grammarly.io WITHOUT a token, captures the actual error object.
 * Grants host permission first so the request actually reaches the server (not CORS-blocked).
 *
 * VPN required: needs network access to gitlab.grammarly.io.
 */
import { test, expect, openGitHub, openSidePanel } from './fixtures';
import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..', '..');

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

  test('capture real error on GitLab clone without token', async ({ context, extensionId }) => {
    test.setTimeout(120_000);

    // Grant host permission for gitlab.grammarly.io BEFORE opening the panel
    // This avoids CORS block — the request reaches the server and gets a real 401
    const bgPage = context.serviceWorkers()[0];
    if (bgPage) {
      await bgPage.evaluate(async () => {
        try {
          await (chrome as any).permissions.request({ origins: ['https://gitlab.grammarly.io/*'] });
        } catch { /* may already be granted or unavailable */ }
      }).catch(() => {});
    }

    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);

    // Wait for __napStore__ or __napPipeline__ to exist
    await panel.waitForFunction(
      () => (window as any).__napStore__?.getState() != null || (window as any).__napPipeline__ != null,
      { timeout: 15_000 },
    );

    // Wait for pipeline to error
    await panel.waitForFunction(
      () => {
        const p = (window as any).__napPipeline__;
        if (!p) return false;
        return p.getState().overall === 'error';
      },
      { timeout: 60_000 },
    );

    // Read the pipeline state
    const pipelineState = await panel.evaluate(() => {
      const p = (window as any).__napPipeline__;
      return p ? p.getState() : null;
    });

    console.log('=== FX-P20: Pipeline state (NO TOKEN) ===');
    console.log(JSON.stringify(pipelineState, null, 2));

    // Read the raw captured error
    const rawError = await panel.evaluate(() => {
      const raw = (window as any).__napPipelineRawError__;
      if (!raw) return { source: 'not-found' };
      return {
        source: 'instrumented',
        name: raw.name,
        message: raw.message?.substring(0, 300),
        statusCode: raw.statusCode,
        code: raw.code,
        ownKeys: Object.getOwnPropertyNames(raw),
        hasOwnStatusCode: raw.hasOwnProperty?.('statusCode'),
        dataStatusCode: raw.data?.statusCode,
        dataKeys: raw.data ? Object.keys(raw.data) : [],
        dataFull: raw.data ? JSON.stringify(raw.data).substring(0, 500) : null,
      };
    });

    console.log('=== RAW ERROR ===');
    console.log(JSON.stringify(rawError, null, 2));

    const cloneStep = pipelineState?.steps?.find((s: any) => s.name?.startsWith('cloning'));
    console.log(`\nCLONE ERROR: "${cloneStep?.error}"`);
    console.log(`CLONE HINT: "${cloneStep?.hint}"`);

    expect(cloneStep?.status).toBe('error');
  });
});
