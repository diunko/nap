/**
 * Happy path debug — real side panel tests.
 *
 * Uses openSidePanel() fixture to open a REAL Chrome side panel
 * alongside a github.com tab, not the chrome-extension:// URL hack.
 */
import { test, expect, openSidePanel, openGitHub } from './fixtures';

test('test-0: real side panel opens', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  console.log('[test-0] github page loaded');

  const panel = await openSidePanel(context, ghPage, extensionId);
  console.log(`[test-0] panel url: ${panel.url()}`);
  expect(panel.url()).toContain('side-panel.html');

  await expect(panel.locator('#app')).toBeVisible({ timeout: 3_000 });
  console.log('[test-0] PASSED: real side panel opened with #app');
});

test('test-1: Monaco boots in real panel', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));
  panel.on('pageerror', err => console.log(`[br:err] ${err.message}`));

  // Monaco starts hidden (terminal tab). Check it exists in DOM.
  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });
  console.log('[test-1] .monaco-editor in DOM');

  // Switch to editor tab
  await panel.click('.tab[data-tab="editor"]');
  await expect(panel.locator('.monaco-editor')).toBeVisible({ timeout: 3_000 });
  console.log('[test-1] PASSED: Monaco visible');
});

test('test-2: terminal prompt in real panel', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.wterm')).toContainText('$', { timeout: 10_000 });
  console.log('[test-2] PASSED: terminal prompt visible');
});

test('test-3: terminal echo in real panel', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  const wterm = panel.locator('.wterm');
  await expect(wterm).toContainText('$', { timeout: 10_000 });
  await wterm.click();

  const before = await wterm.textContent() ?? '';
  const pBefore = (before.match(/\$ /g) || []).length;
  console.log(`[test-3] prompts before: ${pBefore}`);

  await panel.keyboard.type('echo hello-real-panel', { delay: 5 });
  await panel.keyboard.press('Enter');

  await expect(async () => {
    const t = await wterm.textContent() ?? '';
    expect((t.match(/\$ /g) || []).length).toBeGreaterThan(pBefore);
  }).toPass({ timeout: 5_000 });

  expect(await wterm.textContent()).toContain('hello-real-panel');
  console.log('[test-3] PASSED: echo works in real panel');
});

test('test-4: LFS -> Monaco in real panel', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  const content = '# Hello from LFS\n\n* bullet\n';
  await panel.evaluate(async (c) => {
    await window.__lfs.promises.writeFile('/home/user/t4.md', c, 'utf8');
    await window.__openFile('/home/user/t4.md');
  }, content);
  await panel.waitForTimeout(200);

  const val = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  console.log(`[test-4] editor: ${JSON.stringify(val.slice(0, 60))}`);
  expect(val).toBe(content);
  console.log('[test-4] PASSED');
});

test('test-5: auto-save in real panel', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  await panel.evaluate(async () => {
    await window.__lfs.promises.writeFile('/home/user/t5.md', '# T5\n', 'utf8');
    await window.__openFile('/home/user/t5.md');
  });
  await panel.waitForTimeout(200);

  await panel.evaluate(() => {
    const m = window.__editor.getModel()!;
    const lc = m.getLineCount();
    m.applyEdits([{
      range: { startLineNumber: lc, startColumn: m.getLineMaxColumn(lc), endLineNumber: lc, endColumn: m.getLineMaxColumn(lc) },
      text: '\n// auto-saved-real',
    }]);
  });

  await panel.waitForTimeout(1500);

  const saved = await panel.evaluate(() =>
    window.__lfs.promises.readFile('/home/user/t5.md', 'utf8') as Promise<string>
  );
  expect(saved).toContain('// auto-saved-real');
  console.log('[test-5] PASSED');
});

test('test-6: editor -> terminal bidirectional', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.wterm')).toContainText('$', { timeout: 10_000 });
  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  await panel.evaluate(async () => {
    await window.__lfs.promises.writeFile('/home/user/t6.md', '# T6\n', 'utf8');
    await window.__openFile('/home/user/t6.md');
  });
  await panel.waitForTimeout(200);

  await panel.evaluate(() => {
    const m = window.__editor.getModel()!;
    const lc = m.getLineCount();
    m.applyEdits([{
      range: { startLineNumber: lc, startColumn: m.getLineMaxColumn(lc), endLineNumber: lc, endColumn: m.getLineMaxColumn(lc) },
      text: '\n// bidir-real-panel',
    }]);
  });
  await panel.waitForTimeout(1500);

  // Switch to terminal tab
  await panel.click('.tab[data-tab="terminal"]');
  await panel.waitForTimeout(200);

  const wterm = panel.locator('.wterm');
  await wterm.click();
  const before = await wterm.textContent() ?? '';
  const pBefore = (before.match(/\$ /g) || []).length;

  await panel.keyboard.type('cat /home/user/t6.md', { delay: 5 });
  await panel.keyboard.press('Enter');

  await expect(async () => {
    const t = await wterm.textContent() ?? '';
    expect((t.match(/\$ /g) || []).length).toBeGreaterThan(pBefore);
  }).toPass({ timeout: 5_000 });

  expect(await wterm.textContent()).toContain('// bidir-real-panel');
  console.log('[test-6] PASSED');
});

test('test-7: theme CSS vars in real panel', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  const bg = await panel.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nap-bg').trim()
  );
  expect(bg).toBe('#f0f4f8');
  console.log('[test-7] PASSED');
});

test('test-8: chrome.tabs.query from panel returns github tab', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('#app')).toBeVisible({ timeout: 3_000 });

  const activeTab = await panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? { id: tab.id, url: tab.url } : null;
  });

  console.log(`[test-8] active tab: ${JSON.stringify(activeTab)}`);
  expect(activeTab).not.toBeNull();
  expect(activeTab!.url).toContain('github.com');
  console.log('[test-8] PASSED: panel sees github tab as active');
});
