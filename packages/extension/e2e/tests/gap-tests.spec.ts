/**
 * Gap tests — closing the 5 remaining coverage gaps.
 *
 * T1.2: tokenizer registered
 * T3.2: terminal → editor (refresh-on-focus)
 * T5.4/L1: file:line click → github tab navigates
 * L5: panel survives browsing
 * L4: code links reuse tab (no new pages)
 */
import { test, expect, openSidePanel, openGitHub } from './fixtures';
import type { Page } from '@playwright/test';

const NAP_REPO_URL = 'https://github.com/diunko/nap-test-nap';

// ── Helpers ──

async function cmd(panel: Page, command: string, waitFor?: string, timeout = 30_000) {
  console.log(`[cmd] ${command}`);
  const wterm = panel.locator('.wterm');
  await wterm.click();

  const before = await wterm.textContent() ?? '';
  const pBefore = (before.match(/\$ /g) || []).length;

  await panel.keyboard.type(command, { delay: 5 });
  await panel.keyboard.press('Enter');

  await expect(async () => {
    const t = await wterm.textContent() ?? '';
    expect((t.match(/\$ /g) || []).length).toBeGreaterThan(pBefore);
  }).toPass({ timeout });

  const after = await wterm.textContent() ?? '';
  const cmdIdx = after.lastIndexOf(`$ ${command}`);
  const rest = cmdIdx >= 0 ? after.slice(cmdIdx + `$ ${command}`.length) : after;
  const nextPrompt = rest.lastIndexOf('$ ');
  const output = nextPrompt >= 0 ? rest.slice(0, nextPrompt) : rest;
  console.log(`[cmd output] ${output.trim().slice(0, 200)}`);

  if (waitFor) expect(output).toContain(waitFor);
  return output;
}

// ── T1.2: tokenizer registered ──

test('T1.2: napkin-markdown tokenizer produces correct token types', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  // Wait for __monaco to be set (main() is async)
  await expect(async () => {
    const ready = await panel.evaluate(() => typeof window.__monaco?.editor?.tokenize === 'function');
    expect(ready).toBe(true);
  }).toPass({ timeout: 5_000 });

  const tokens = await panel.evaluate(() => {
    const result = window.__monaco.editor.tokenize('# heading', 'napkin-markdown');
    console.log('[T1.2] tokenize result:', JSON.stringify(result));
    return result;
  });

  console.log(`[T1.2] tokens: ${JSON.stringify(tokens)}`);
  // tokenize returns array of lines, each line is array of {offset, type}
  expect(tokens.length).toBeGreaterThan(0);
  const lineTokens = tokens[0];
  const types = lineTokens.map((t: any) => t.type);
  console.log(`[T1.2] token types: ${types}`);
  expect(types.some((t: string) => t.includes('heading'))).toBe(true);

  // Also check comment tokenization
  const commentTokens = await panel.evaluate(() => {
    const result = window.__monaco.editor.tokenize('//DU: a comment', 'napkin-markdown');
    return result;
  });
  const commentTypes = commentTokens[0].map((t: any) => t.type);
  console.log(`[T1.2] comment types: ${commentTypes}`);
  expect(commentTypes.some((t: string) => t.includes('comment'))).toBe(true);

  console.log('[T1.2] PASSED: tokenizer produces heading + comment types');
});

// ── T3.2: terminal write → editor reads (refresh-on-focus) ──

test('T3.2: terminal write → editor reads via refresh-on-focus', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.wterm')).toContainText('$', { timeout: 10_000 });
  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  // Write file and open in editor
  await panel.evaluate(async () => {
    await window.__lfs.promises.writeFile('/home/user/t32.md', '# T3.2 original\n', 'utf8');
    await window.__openFile('/home/user/t32.md');
  });
  await panel.waitForTimeout(200);

  const before = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  expect(before).toContain('T3.2 original');
  console.log('[T3.2] file open in editor');

  // Switch to terminal, append via echo
  await panel.click('.tab[data-tab="terminal"]');
  await panel.waitForTimeout(200);
  await cmd(panel, 'echo "// terminal-injected-t32" >> /home/user/t32.md');
  console.log('[T3.2] appended via terminal');

  // Switch back to editor — triggers refresh-on-focus
  await panel.click('.tab[data-tab="editor"]');
  await panel.waitForTimeout(500); // refresh-on-focus is async

  const after = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  console.log(`[T3.2] editor after: ${after.slice(0, 100)}`);
  expect(after).toContain('// terminal-injected-t32');
  console.log('[T3.2] PASSED: terminal write visible in editor via refresh-on-focus');
});

// ── T5.4 / L1: file:line click → github tab navigates ──

test('T5.4: file:line link navigates github tab', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context, 'https://github.com/diunko/nap-test-main');
  const panel = await openSidePanel(context, ghPage, extensionId);
  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  // Set main repo config
  await panel.evaluate(() => {
    window.__setMainRepoConfig({ owner: 'diunko', repo: 'nap-test-main', branch: 'main' });
  });

  // Write a file with a code link and open it
  await panel.evaluate(async () => {
    const content = '# Test\n\nSee [copy_document.ts:51](/modules/server/copy_document.ts#L51)\n';
    await window.__lfs.promises.writeFile('/home/user/link-test.md', content, 'utf8');
    await window.__openFile('/home/user/link-test.md');
  });
  await panel.waitForTimeout(300);

  // Trigger the link via test hook
  await panel.evaluate(() => {
    window.__triggerLink('/modules/server/copy_document.ts#L51');
  });

  // Wait for github tab to navigate
  await ghPage.waitForURL(/copy_document\.ts/, { timeout: 10_000 });
  console.log(`[T5.4] github tab URL: ${ghPage.url()}`);
  expect(ghPage.url()).toContain('diunko/nap-test-main');
  expect(ghPage.url()).toContain('copy_document.ts');
  expect(ghPage.url()).toContain('#L51');

  console.log('[T5.4] PASSED: file:line link navigated github tab to correct URL');
});

// ── L5: panel survives browsing ──

test('L5: panel survives main tab navigation', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context, 'https://github.com/diunko/nap-test-main');
  const panel = await openSidePanel(context, ghPage, extensionId);
  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.wterm')).toContainText('$', { timeout: 10_000 });
  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  // Clone repo and open a chapter
  await cmd(panel, `git clone ${NAP_REPO_URL}`, 'done.', 60_000);
  await panel.evaluate(() => window.__refreshNavTree());
  await panel.waitForTimeout(500);

  await panel.evaluate(async () => {
    const repos = await window.__lfs.promises.readdir('/home/user');
    const napRepo = repos.find((r: string) => r.includes('nap-test-nap'));
    if (!napRepo) throw new Error('nap-test-nap not found');
    await window.__openFile(`/home/user/${napRepo}/30-napkins/0100-feature/01-copy-pipeline.md`);
  });
  await panel.waitForTimeout(300);

  const editorBefore = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  expect(editorBefore).toContain('Copy Pipeline');
  console.log('[L5] editor loaded before navigation');

  const navBefore = await panel.locator('#nav-tree').textContent();
  expect(navBefore).toContain('napkins');
  console.log('[L5] nav tree populated before navigation');

  // Navigate github tab to different pages
  await ghPage.goto('https://github.com/diunko/nap-test-main/blob/main/README.md', {
    waitUntil: 'domcontentloaded', timeout: 10_000,
  });
  console.log('[L5] navigated to README');

  await ghPage.goto('https://github.com/diunko/nap-test-main/blob/main/modules/server/copy_document.ts', {
    waitUntil: 'domcontentloaded', timeout: 10_000,
  });
  console.log('[L5] navigated to copy_document.ts');

  // Check panel state survived
  const editorAfter = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  expect(editorAfter).toContain('Copy Pipeline');
  console.log('[L5] editor content preserved');

  const navAfter = await panel.locator('#nav-tree').textContent();
  expect(navAfter).toContain('napkins');
  console.log('[L5] nav tree preserved');

  console.log('[L5] PASSED: panel state survives main tab navigation');
});

// ── L4: code links reuse tab (no new pages) ──

test('L4: code links reuse active tab, no new pages created', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context, 'https://github.com/diunko/nap-test-main');
  const panel = await openSidePanel(context, ghPage, extensionId);
  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  // Set main repo config
  await panel.evaluate(() => {
    window.__setMainRepoConfig({ owner: 'diunko', repo: 'nap-test-main', branch: 'main' });
  });

  // Open a file with links
  await panel.evaluate(async () => {
    const content = '# Links\n\n[copy_document.ts:51](/modules/server/copy_document.ts#L51)\n[id_universe.ts:12](/modules/core/id_universe.ts#L12)\n';
    await window.__lfs.promises.writeFile('/home/user/links.md', content, 'utf8');
    await window.__openFile('/home/user/links.md');
  });
  await panel.waitForTimeout(300);

  const pagesBefore = context.pages().length;
  console.log(`[L4] pages before clicks: ${pagesBefore}`);

  // Click first code link
  await panel.evaluate(() => {
    window.__triggerLink('/modules/server/copy_document.ts#L51');
  });
  await ghPage.waitForURL(/copy_document\.ts/, { timeout: 10_000 });
  console.log(`[L4] after first link: ${ghPage.url()}`);

  // Click second code link — should reuse same tab
  await panel.evaluate(() => {
    window.__triggerLink('/modules/core/id_universe.ts#L12');
  });
  await ghPage.waitForURL(/id_universe\.ts/, { timeout: 10_000 });
  console.log(`[L4] after second link: ${ghPage.url()}`);

  const pagesAfter = context.pages().length;
  console.log(`[L4] pages after clicks: ${pagesAfter}`);
  expect(pagesAfter).toBe(pagesBefore);

  console.log('[L4] PASSED: code links reuse tab, no new pages');
});
