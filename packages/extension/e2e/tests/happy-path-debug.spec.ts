/**
 * Happy path debug — incremental tests.
 */
import { test, expect } from './fixtures';

test('test-0: side-panel.html loads', async ({ page, extensionId }) => {
  console.log(`[test-0] extensionId=${extensionId}`);
  await page.goto(`chrome-extension://${extensionId}/side-panel.html`);
  await expect(page.locator('#app')).toBeVisible({ timeout: 3_000 });
  console.log('[test-0] PASSED');
});

test('test-1: Monaco boots (exists in DOM)', async ({ page, extensionId }) => {
  page.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[br:err] ${err.message}`));

  await page.goto(`chrome-extension://${extensionId}/side-panel.html`);
  // Monaco starts hidden (editor tab not active). Check it exists, not visible.
  await expect(page.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });
  console.log('[test-1] .monaco-editor in DOM');

  // Switch to editor tab to make it visible
  await page.click('.tab[data-tab="editor"]');
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 3_000 });
  console.log('[test-1] PASSED: Monaco visible after tab switch');
});

test('test-2: terminal prompt', async ({ page, extensionId }) => {
  page.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await page.goto(`chrome-extension://${extensionId}/side-panel.html`);
  await expect(page.locator('.wterm')).toContainText('$', { timeout: 10_000 });
  console.log('[test-2] PASSED');
});

test('test-3: terminal echo', async ({ page, extensionId }) => {
  page.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await page.goto(`chrome-extension://${extensionId}/side-panel.html`);
  const wterm = page.locator('.wterm');
  await expect(wterm).toContainText('$', { timeout: 10_000 });
  await wterm.click();

  const before = await wterm.textContent() ?? '';
  const pBefore = (before.match(/\$ /g) || []).length;
  console.log(`[test-3] prompts before: ${pBefore}`);

  await page.keyboard.type('echo hello-nap-ext', { delay: 5 });
  await page.keyboard.press('Enter');

  await expect(async () => {
    const t = await wterm.textContent() ?? '';
    expect((t.match(/\$ /g) || []).length).toBeGreaterThan(pBefore);
  }).toPass({ timeout: 5_000 });

  expect(await wterm.textContent()).toContain('hello-nap-ext');
  console.log('[test-3] PASSED');
});

test('test-4: LFS -> Monaco', async ({ page, extensionId }) => {
  page.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await page.goto(`chrome-extension://${extensionId}/side-panel.html`);
  await expect(page.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  const content = '# Hello from LFS\n\n* bullet\n';
  await page.evaluate(async (c) => {
    await window.__lfs.promises.writeFile('/home/user/t4.md', c, 'utf8');
    await window.__openFile('/home/user/t4.md');
  }, content);
  await page.waitForTimeout(200);

  const val = await page.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  console.log(`[test-4] editor: ${JSON.stringify(val.slice(0, 60))}`);
  expect(val).toBe(content);
  console.log('[test-4] PASSED');
});

test('test-5: auto-save', async ({ page, extensionId }) => {
  page.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await page.goto(`chrome-extension://${extensionId}/side-panel.html`);
  await expect(page.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  await page.evaluate(async () => {
    await window.__lfs.promises.writeFile('/home/user/t5.md', '# T5\n', 'utf8');
    await window.__openFile('/home/user/t5.md');
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const m = window.__editor.getModel()!;
    const lc = m.getLineCount();
    m.applyEdits([{
      range: { startLineNumber: lc, startColumn: m.getLineMaxColumn(lc), endLineNumber: lc, endColumn: m.getLineMaxColumn(lc) },
      text: '\n// auto-saved',
    }]);
  });

  await page.waitForTimeout(1500);

  const saved = await page.evaluate(() =>
    window.__lfs.promises.readFile('/home/user/t5.md', 'utf8') as Promise<string>
  );
  expect(saved).toContain('// auto-saved');
  console.log('[test-5] PASSED');
});

test('test-6: editor -> terminal', async ({ page, extensionId }) => {
  page.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await page.goto(`chrome-extension://${extensionId}/side-panel.html`);
  await expect(page.locator('.wterm')).toContainText('$', { timeout: 10_000 });
  await expect(page.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  await page.evaluate(async () => {
    await window.__lfs.promises.writeFile('/home/user/t6.md', '# T6\n', 'utf8');
    await window.__openFile('/home/user/t6.md');
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const m = window.__editor.getModel()!;
    const lc = m.getLineCount();
    m.applyEdits([{
      range: { startLineNumber: lc, startColumn: m.getLineMaxColumn(lc), endLineNumber: lc, endColumn: m.getLineMaxColumn(lc) },
      text: '\n// note-t6',
    }]);
  });
  await page.waitForTimeout(1500);

  // Switch back to terminal tab (openFile switched to editor)
  await page.click('.tab[data-tab="terminal"]');
  await page.waitForTimeout(200);

  const wterm = page.locator('.wterm');
  await wterm.click();
  const before = await wterm.textContent() ?? '';
  const pBefore = (before.match(/\$ /g) || []).length;

  await page.keyboard.type('cat /home/user/t6.md', { delay: 5 });
  await page.keyboard.press('Enter');

  await expect(async () => {
    const t = await wterm.textContent() ?? '';
    expect((t.match(/\$ /g) || []).length).toBeGreaterThan(pBefore);
  }).toPass({ timeout: 5_000 });

  expect(await wterm.textContent()).toContain('// note-t6');
  console.log('[test-6] PASSED');
});

test('test-7: theme CSS vars', async ({ page, extensionId }) => {
  page.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await page.goto(`chrome-extension://${extensionId}/side-panel.html`);
  await expect(page.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nap-bg').trim()
  );
  expect(bg).toBe('#f0f4f8');
  console.log('[test-7] PASSED');
});
