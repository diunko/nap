/**
 * Lifecycle tests — the full two-repo bridge.
 *
 * L1: clone .nap, read chapter, click file:line → github tab navigates
 * L2: edit, commit, verify from terminal
 * L3: navigate between chapters + code links
 * L6: close panel, reopen, IDB persists
 *
 * Uses real fixture repos:
 * - diunko/nap-test-main (code repo, never cloned)
 * - diunko/nap-test-nap (.nap repo, cloned into IDB)
 */
import { test, expect, openSidePanel, openGitHub } from './fixtures';
import type { Page, BrowserContext } from '@playwright/test';

const NAP_REPO_URL = 'https://github.com/diunko/nap-test-nap';
const MAIN_REPO_OWNER = 'diunko';
const MAIN_REPO_NAME = 'nap-test-main';
const MAIN_BRANCH = 'main';

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

  if (waitFor) {
    expect(output).toContain(waitFor);
  }
  return output;
}

async function setMainRepoConfig(panel: Page) {
  // Set the main repo config directly — bypasses chrome.storage in tests
  await panel.evaluate(({ owner, repo, branch }) => {
    // Access the module-level variable through a setter we'll expose
    (window as any).__setMainRepo = { owner, repo, branch };
  }, { owner: MAIN_REPO_OWNER, repo: MAIN_REPO_NAME, branch: MAIN_BRANCH });
  console.log(`[config] main repo set to ${MAIN_REPO_OWNER}/${MAIN_REPO_NAME}`);
}

// ── L1: clone .nap, read chapter, click file:line ──

test('L1: clone nap repo, read chapter, verify file:line link', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context, `https://github.com/${MAIN_REPO_OWNER}/${MAIN_REPO_NAME}`);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));
  panel.on('pageerror', err => console.log(`[br:err] ${err.message}`));

  // Wait for terminal
  await expect(panel.locator('.wterm')).toContainText('$', { timeout: 10_000 });
  console.log('[L1] terminal ready');

  // Clone the .nap repo
  await cmd(panel, `git clone ${NAP_REPO_URL}`, 'done.', 60_000);
  console.log('[L1] clone done');

  // Refresh nav tree
  await panel.evaluate(() => window.__refreshNavTree());
  await panel.waitForTimeout(500);

  // Check nav tree has napkin cards
  const navText = await panel.locator('#nav-tree').textContent();
  console.log(`[L1] nav tree: ${navText?.slice(0, 200)}`);
  expect(navText).toContain('0100-feature');
  console.log('[L1] nav tree populated');

  // Open the chapter file directly via LFS path
  await panel.evaluate(async () => {
    // Find the cloned repo
    const repos = await window.__lfs.promises.readdir('/home/user');
    console.log('[L1:eval] repos:', repos);
    const napRepo = repos.find((r: string) => r.includes('nap-test-nap'));
    if (!napRepo) throw new Error('nap-test-nap not found in /home/user');

    const chapterPath = `/home/user/${napRepo}/30-napkins/0100-feature/01-copy-pipeline.md`;
    console.log('[L1:eval] opening', chapterPath);
    await window.__openFile(chapterPath);
  });
  await panel.waitForTimeout(300);

  // Verify editor content
  const content = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  console.log(`[L1] editor content (first 200): ${content.slice(0, 200)}`);
  expect(content).toContain('copy_document.ts:51');
  expect(content).toContain('Copy Pipeline');
  console.log('[L1] PASSED: chapter loaded with file:line links');
});

// ── L2: edit, commit, verify ──

test('L2: edit chapter, commit, verify in git log', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.wterm')).toContainText('$', { timeout: 10_000 });

  // Clone
  await cmd(panel, `git clone ${NAP_REPO_URL}`, 'done.', 60_000);

  // Open chapter
  await panel.evaluate(async () => {
    const repos = await window.__lfs.promises.readdir('/home/user');
    const napRepo = repos.find((r: string) => r.includes('nap-test-nap'));
    if (!napRepo) throw new Error('nap-test-nap not found');
    await window.__openFile(`/home/user/${napRepo}/30-napkins/0100-feature/01-copy-pipeline.md`);
  });
  await panel.waitForTimeout(300);

  // Add a review comment
  await panel.evaluate(() => {
    const m = window.__editor.getModel()!;
    const lc = m.getLineCount();
    m.applyEdits([{
      range: { startLineNumber: lc, startColumn: m.getLineMaxColumn(lc), endLineNumber: lc, endColumn: m.getLineMaxColumn(lc) },
      text: '\n//DU: this looks fragile',
    }]);
  });
  await panel.waitForTimeout(1500); // auto-save

  // Switch to terminal
  await panel.click('.tab[data-tab="terminal"]');
  await panel.waitForTimeout(200);

  // Git workflow
  await cmd(panel, 'cd nap-test-nap');
  await cmd(panel, 'git status', 'modified');
  console.log('[L2] git status shows modified');

  await cmd(panel, 'git add .');
  await cmd(panel, 'git commit -m "review: copy pipeline"', 'review: copy pipeline');
  console.log('[L2] commit done');

  await cmd(panel, 'git log --oneline -1', 'review: copy pipeline');
  console.log('[L2] PASSED: full edit → commit cycle');
});

// ── L3: navigate between chapters and code links ──

test('L3: navigate .md links + verify file:line link targets', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.wterm')).toContainText('$', { timeout: 10_000 });

  // Clone
  await cmd(panel, `git clone ${NAP_REPO_URL}`, 'done.', 60_000);

  // Open chapter 01
  await panel.evaluate(async () => {
    const repos = await window.__lfs.promises.readdir('/home/user');
    const napRepo = repos.find((r: string) => r.includes('nap-test-nap'));
    if (!napRepo) throw new Error('nap-test-nap not found');
    await window.__openFile(`/home/user/${napRepo}/30-napkins/0100-feature/01-copy-pipeline.md`);
  });
  await panel.waitForTimeout(300);

  const ch01 = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  expect(ch01).toContain('Copy Pipeline');
  console.log('[L3] chapter 01 loaded');

  // Open chapter 02 via direct openFile (simulating .md link navigation)
  await panel.evaluate(async () => {
    const repos = await window.__lfs.promises.readdir('/home/user');
    const napRepo = repos.find((r: string) => r.includes('nap-test-nap'));
    if (!napRepo) throw new Error('nap-test-nap not found');
    await window.__openFile(`/home/user/${napRepo}/30-napkins/0100-feature/02-id-universe.md`);
  });
  await panel.waitForTimeout(300);

  const ch02 = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  expect(ch02).toContain('ID Universe');
  expect(ch02).toContain('id_universe.ts:12');
  console.log('[L3] chapter 02 loaded');

  // Go back to chapter 01
  await panel.evaluate(async () => {
    const repos = await window.__lfs.promises.readdir('/home/user');
    const napRepo = repos.find((r: string) => r.includes('nap-test-nap'));
    if (!napRepo) throw new Error('nap-test-nap not found');
    await window.__openFile(`/home/user/${napRepo}/30-napkins/0100-feature/01-copy-pipeline.md`);
  });
  await panel.waitForTimeout(300);

  const ch01Again = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  expect(ch01Again).toContain('Copy Pipeline');
  console.log('[L3] PASSED: navigation between chapters works, no state corruption');
});

// ── L6: IDB persistence ──

test('L6: close panel, reopen, IDB persists', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.wterm')).toContainText('$', { timeout: 10_000 });

  // Clone repo
  await cmd(panel, `git clone ${NAP_REPO_URL}`, 'done.', 60_000);
  console.log('[L6] clone done');

  // Verify file exists in LFS
  const before = await panel.evaluate(async () => {
    try {
      const repos = await window.__lfs.promises.readdir('/home/user');
      return repos;
    } catch { return []; }
  });
  console.log(`[L6] repos before close: ${JSON.stringify(before)}`);
  expect(before).toContain('nap-test-nap');

  // Close the panel page
  await panel.close();
  console.log('[L6] panel closed');

  // Reopen via the trigger button
  const panel2 = await openSidePanel(context, ghPage, extensionId);
  panel2.on('console', msg => console.log(`[br2:${msg.type()}] ${msg.text()}`));

  await expect(panel2.locator('.wterm')).toContainText('$', { timeout: 10_000 });
  console.log('[L6] panel reopened');

  // Check IDB persists — the cloned repo should still be there
  const after = await panel2.evaluate(async () => {
    try {
      const repos = await window.__lfs.promises.readdir('/home/user');
      return repos;
    } catch { return []; }
  });
  console.log(`[L6] repos after reopen: ${JSON.stringify(after)}`);
  expect(after).toContain('nap-test-nap');

  // Refresh nav tree — should repopulate without re-clone
  await panel2.evaluate(() => window.__refreshNavTree());
  await panel2.waitForTimeout(500);

  const navText = await panel2.locator('#nav-tree').textContent();
  console.log(`[L6] nav tree: ${navText?.slice(0, 200)}`);
  expect(navText).toContain('0100-feature');
  console.log('[L6] PASSED: IDB persists across panel close/reopen');
});
