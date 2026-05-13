import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Shiki code highlighting — medium tests ──
//
// Verifies that fenced code blocks get syntax highlighting in the rendered view
// inside the actual Electron app (shiki loads, highlighter initializes, code
// blocks render with inline color styles).

function createFixture(tmpDir: string): { napFilePath: string } {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const mdContent = [
    '# Shiki test',
    '',
    'Some text before the code block.',
    '',
    '```typescript',
    'function greet(name: string): string {',
    '  return `Hello, ${name}!`;',
    '}',
    '```',
    '',
    'Text after code.',
    '',
    '```brainfuck',
    '+++.',
    '```',
    '',
    '```',
    'no language tag',
    '```',
  ].join('\n');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': mdContent,
    '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta', role: 'test-arch', name: '001-test-arch',
      nepic: 'test-nepic', created_at: 1711700000000, started: true, exited: false,
    },
    '20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch', role: 'architect', name: '001-architect',
      nepic: 'test-nepic', created_at: 1711600000000, started: true, exited: false,
    },
  };

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(nepicDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }

  return { napFilePath: path.join(nepicDir, '30-napkins/0100-explore/0100-explore.nap.md') };
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let napFilePath: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  const fixture = createFixture(tmpDir);
  napFilePath = fixture.napFilePath;
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

async function openFileAndSwitchToRendered(): Promise<void> {
  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openFile(fp);
  }, napFilePath);

  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const editors = m.editor.getEditors();
      return editors.some((e: any) => e.getModel()?.getValue()?.includes('Shiki test'));
    },
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);

  // Toggle to rendered mode
  await page.evaluate(() => {
    (window as any).__napStore__.getState().toggleRenderMode();
  });

  // Wait for rendered view
  await page.waitForSelector('[data-testid="rendered-view"]', { timeout: 5000 });
}

// T-SHIKI-E2E-01: shiki initializes in the Electron app
test('shiki initializes and produces highlighted code blocks', async () => {
  await boot();
  await openFileAndSwitchToRendered();

  // Wait for shiki to load (async) — poll for class="shiki" in rendered view
  const hasShiki = await page.waitForFunction(
    () => {
      const rendered = document.querySelector('[data-testid="rendered-view"]');
      if (!rendered) return false;
      return rendered.querySelector('pre.shiki') !== null;
    },
    { timeout: 10000 },
  ).then(() => true).catch(() => false);

  if (!hasShiki) {
    // Shiki didn't load — check what we got instead
    const html = await page.evaluate(() => {
      const rendered = document.querySelector('[data-testid="rendered-view"]');
      return rendered?.innerHTML?.slice(0, 2000) ?? 'no rendered view';
    });
    console.log('Rendered HTML (first 2000 chars):', html);
  }

  expect(hasShiki).toBe(true);

  // Verify the highlighted block has inline color styles
  const hasColors = await page.evaluate(() => {
    const rendered = document.querySelector('[data-testid="rendered-view"]');
    const shikiPre = rendered?.querySelector('pre.shiki');
    if (!shikiPre) return false;
    return shikiPre.innerHTML.includes('style="color:');
  });
  expect(hasColors).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-SHIKI-E2E-02: unknown language falls back in the app
test('unknown language renders as nap-code-block fallback', async () => {
  await boot();
  await openFileAndSwitchToRendered();

  // Wait for shiki to init first (so we know the fallback is deliberate)
  await page.waitForFunction(
    () => {
      const rendered = document.querySelector('[data-testid="rendered-view"]');
      return rendered?.querySelector('pre.shiki') !== null;
    },
    { timeout: 10000 },
  ).catch(() => {});

  // Check the brainfuck block — should be fallback
  const fallbackCount = await page.evaluate(() => {
    const rendered = document.querySelector('[data-testid="rendered-view"]');
    if (!rendered) return 0;
    return rendered.querySelectorAll('pre.nap-code-block').length;
  });

  // We have 2 fallback blocks: brainfuck + no-language
  expect(fallbackCount).toBeGreaterThanOrEqual(2);

  await cleanupApp(app, tmpDir);
});

// T-SHIKI-E2E-03: theme switch changes code block colors
test('theme cycle changes code block colors', async () => {
  await boot();
  await openFileAndSwitchToRendered();

  // Wait for shiki
  await page.waitForFunction(
    () => document.querySelector('[data-testid="rendered-view"] pre.shiki') !== null,
    { timeout: 10000 },
  );

  // Capture dark theme code block background
  const darkBg = await page.evaluate(() => {
    const pre = document.querySelector('[data-testid="rendered-view"] pre.shiki') as HTMLElement;
    return pre?.style.backgroundColor || getComputedStyle(pre).backgroundColor;
  });

  // Cycle to next theme (dark → light-cream, which uses vitesse-light)
  await page.evaluate(() => {
    (window as any).__napStore__.getState().cycleTheme();
  });

  // Wait for re-render with new theme
  await page.waitForTimeout(500);

  const lightBg = await page.evaluate(() => {
    const pre = document.querySelector('[data-testid="rendered-view"] pre.shiki') as HTMLElement;
    return pre?.style.backgroundColor || getComputedStyle(pre).backgroundColor;
  });

  // Backgrounds should differ between dark and light theme
  expect(darkBg).toBeTruthy();
  expect(lightBg).toBeTruthy();
  expect(darkBg).not.toBe(lightBg);

  await cleanupApp(app, tmpDir);
});
