import { test, expect, type Page } from '@playwright/test';

const CLONE_URL = 'https://github.com/abs0luty/rightpad';
const REPO_NAME = 'rightpad';

function setup(page: Page) {
  page.on('console', msg => console.log(`[br] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[br err] ${err.message}`));
}

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.wterm .term-grid .term-row', { timeout: 15_000 });
  await expect(page.locator('.wterm')).toContainText('$', { timeout: 15_000 });
  await page.locator('.wterm').click();
}

async function cmd(page: Page, command: string, waitFor: string | RegExp, timeout = 10_000) {
  console.log(`[cmd] ${command}`);
  // Count existing prompts before running command
  const textBefore = await page.locator('.wterm').textContent() ?? '';
  const promptsBefore = (textBefore.match(/\$ /g) || []).length;
  console.log(`[cmd] prompts before: ${promptsBefore}`);

  await page.keyboard.type(command, { delay: 5 });
  await page.keyboard.press('Enter');

  // Wait for a NEW prompt to appear (means command fully finished)
  await expect(async () => {
    const text = await page.locator('.wterm').textContent() ?? '';
    const promptsNow = (text.match(/\$ /g) || []).length;
    expect(promptsNow).toBeGreaterThan(promptsBefore);
  }).toPass({ timeout });

  // Then check for expected output
  await expect(page.locator('.wterm')).toContainText(waitFor, { timeout: 5_000 });
  const text = await page.locator('.wterm').textContent();
  console.log(`[term] ...${text?.slice(-200)}`);
}

async function cloneRepo(page: Page) {
  await cmd(page, `git clone ${CLONE_URL}`, 'done.', 60_000);
}

// --- debug tests ---

test('debug: terminal loads and shell initializes', async ({ page }) => {
  setup(page);
  await page.goto('/');
  await page.waitForSelector('.wterm .term-grid .term-row', { timeout: 15_000 });
  const text = await page.locator('.wterm').textContent();
  console.log(`[term] ${JSON.stringify(text?.slice(0, 300))}`);
  await expect(page.locator('.wterm')).toContainText('$', { timeout: 15_000 });
  console.log('[ok] prompt visible');
});

test('debug: echo command works', async ({ page }) => {
  setup(page);
  await ready(page);
  await cmd(page, 'echo hello123', 'hello123');
  console.log('[ok] echo works');
});

test('debug: ls works', async ({ page }) => {
  setup(page);
  await ready(page);
  await cmd(page, 'ls /', 'home');
  console.log('[ok] ls works');
});

test('debug: git clone works', async ({ page }) => {
  setup(page);
  page.on('response', resp => {
    if (resp.url().includes('cors') || resp.url().includes('github')) {
      console.log(`[net] ${resp.status()} ${resp.url().slice(0, 120)}`);
    }
  });
  await ready(page);
  await cloneRepo(page);
  console.log('[ok] clone works');
});

// --- cwd debug tests ---

test('debug: pwd returns current dir', async ({ page }) => {
  setup(page);
  await ready(page);
  await cmd(page, 'pwd', '/home/user');
  console.log('[ok] pwd works');
});

test('debug: cd changes dir and pwd reflects it', async ({ page }) => {
  setup(page);
  await ready(page);
  await cmd(page, 'mkdir /tmp', '$');
  await cmd(page, 'cd /tmp', '$');
  await cmd(page, 'pwd', '/tmp');
  console.log('[ok] cd + pwd works');
});

test('debug: cd into cloned repo', async ({ page }) => {
  setup(page);
  await ready(page);
  await cloneRepo(page);
  await cmd(page, 'cd rightpad', '$');
  await cmd(page, 'pwd', 'rightpad');
  console.log('[ok] cd into cloned repo works');
});

test('debug: bash.getCwd() vs cd in exec', async ({ page }) => {
  setup(page);
  await ready(page);
  // run cd and check what shell reports
  await cmd(page, 'cd / && pwd', '/');
  await cmd(page, 'pwd', '$');
  const text = await page.locator('.wterm').textContent();
  console.log(`[term full] ${JSON.stringify(text)}`);
});

test('debug: ls after clone shows repo', async ({ page }) => {
  setup(page);
  await ready(page);
  await cloneRepo(page);
  await cmd(page, 'ls /home/user', REPO_NAME);
  console.log('[ok] ls /home/user shows repo');
});

test('debug: git log with absolute path', async ({ page }) => {
  setup(page);
  await ready(page);
  await cloneRepo(page);
  // bypass cd entirely — run git log in the test by telling shell to cd inline
  await cmd(page, 'cd /home/user/rightpad && git log --oneline', /[0-9a-f]{7}/, 15_000);
  console.log('[ok] git log with inline cd works');
});

// --- story tests ---

test('Story 1: clone, ls, cd, cat', async ({ page }) => {
  setup(page);
  await ready(page);

  await cloneRepo(page);
  await cmd(page, 'ls', REPO_NAME);
  await cmd(page, `cd ${REPO_NAME} && cat README.md`, /README|rightpad|#/i);
  console.log('[ok] Story 1 passed');
});

test('Story 2: git log shows history', async ({ page }) => {
  setup(page);
  await ready(page);

  await cloneRepo(page);
  await cmd(page, `cd ${REPO_NAME}`, '$');
  await cmd(page, 'git log --oneline', /[0-9a-f]{7}/);
  console.log('[ok] Story 2 passed');
});

test('Story 3: edit file, git status shows modified', async ({ page }) => {
  setup(page);
  await ready(page);

  await cloneRepo(page);
  await cmd(page, `cd ${REPO_NAME}`, '$');
  await cmd(page, 'echo "hello" >> README.md', '$');
  await cmd(page, 'git status', 'modified');
  console.log('[ok] Story 3 passed');
});

test('Story 4: commit and verify in log', async ({ page }) => {
  setup(page);
  await ready(page);

  await cloneRepo(page);
  await cmd(page, `cd ${REPO_NAME}`, '$');
  await cmd(page, 'echo "hello" >> README.md', '$');
  await cmd(page, 'git add .', '$');
  await cmd(page, 'git commit -m "test commit"', 'test commit');
  await cmd(page, 'git log --oneline -1', 'test commit');
  console.log('[ok] Story 4 passed');
});
