/**
 * Real Cmd+click test — uses editor.onMouseDown path (same as v3).
 * Simulates Meta+click via dispatchEvent on Monaco's mouse target.
 */
import { test, expect, openSidePanel, openGitHub } from './fixtures';

test('Cmd+click on file:line link navigates github tab', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context, 'https://github.com/diunko/nap-test-main');
  const panel = await openSidePanel(context, ghPage, extensionId);
  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));

  await expect(panel.locator('.monaco-editor')).toHaveCount(1, { timeout: 10_000 });

  // Wait for side-panel.ts to finish init (test hooks set at the end of main())
  await expect(async () => {
    const ready = await panel.evaluate(() => typeof window.__setMainRepoConfig === 'function');
    expect(ready).toBe(true);
  }).toPass({ timeout: 5_000 });

  await panel.evaluate(() => {
    window.__setMainRepoConfig({ owner: 'diunko', repo: 'nap-test-main', branch: 'main' });
  });

  const content = '# Test\n\nSee [copy_document.ts:51](/modules/server/copy_document.ts#L51) here.\n';
  await panel.evaluate(async (c) => {
    await window.__lfs.promises.writeFile('/home/user/cmd-test.md', c, 'utf8');
    await window.__openFile('/home/user/cmd-test.md');
  }, content);

  await panel.click('.tab[data-tab="editor"]');
  await panel.waitForTimeout(500);

  // Get pixel coords of the link text
  const coords = await panel.evaluate(() => {
    const ed = window.__editor;
    const model = ed.getModel()!;
    const lines = model.getValue().split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (m && m[2].includes('copy_document.ts')) {
        const col = lines[i].indexOf(m[1]) + Math.floor(m[1].length / 2) + 1;
        const pos = ed.getScrolledVisiblePosition({ lineNumber: i + 1, column: col });
        console.log(`[coords] line=${i + 1} col=${col} pos=${JSON.stringify(pos)}`);
        return pos;
      }
    }
    return null;
  });
  expect(coords).not.toBeNull();

  const box = await panel.locator('.monaco-editor').boundingBox();
  expect(box).not.toBeNull();

  const x = box!.x + coords!.left + 5;
  const y = box!.y + coords!.top + coords!.height / 2;
  console.log(`[test] Cmd+clicking at (${x}, ${y})`);

  // Dispatch a real mousedown with metaKey on the Monaco content area.
  // This fires editor.onMouseDown which is what handles Cmd+click.
  await panel.evaluate(({ cx, cy }) => {
    const el = document.elementFromPoint(cx, cy);
    console.log(`[dispatch] target element: ${el?.tagName}.${el?.className}`);
    if (el) {
      el.dispatchEvent(new MouseEvent('mousedown', {
        clientX: cx, clientY: cy,
        metaKey: true, ctrlKey: false,
        button: 0, bubbles: true, cancelable: true,
      }));
      el.dispatchEvent(new MouseEvent('mouseup', {
        clientX: cx, clientY: cy,
        metaKey: true, ctrlKey: false,
        button: 0, bubbles: true, cancelable: true,
      }));
    }
  }, { cx: x, cy: y });

  // Wait for github tab to navigate
  await ghPage.waitForURL(/copy_document\.ts/, { timeout: 10_000 });
  const finalUrl = ghPage.url();
  console.log(`[test] github URL: ${finalUrl}`);
  expect(finalUrl).toContain('diunko/nap-test-main');
  expect(finalUrl).toContain('copy_document.ts');
  expect(finalUrl).toContain('#L51');
  console.log('[test] PASSED: real Cmd+click via onMouseDown');
});
