import { test, expect } from '@playwright/test';

test('debug: lightning-fs symlink + lstat', async ({ page }) => {
  page.on('console', msg => console.log(`[br] ${msg.text()}`));

  await page.goto('/');
  await page.waitForSelector('.wterm .term-grid .term-row', { timeout: 15_000 });
  await expect(page.locator('.wterm')).toContainText('$', { timeout: 15_000 });

  const result = await page.evaluate(async () => {
    const lfs = (window as any).__lfs;
    if (!lfs) return { error: '__lfs not on window' };

    try { await lfs.promises.mkdir('/symtest'); } catch {}
    await lfs.promises.writeFile('/symtest/target.txt', 'hello');
    await lfs.promises.symlink('/symtest/target.txt', '/symtest/link.txt');

    const stat = await lfs.promises.stat('/symtest/link.txt');
    const lstat = await lfs.promises.lstat('/symtest/link.txt');
    let linkTarget = '';
    try { linkTarget = await lfs.promises.readlink('/symtest/link.txt'); } catch (e: any) { linkTarget = `ERROR: ${e.message}`; }

    return {
      stat: { isFile: stat.isFile(), isDir: stat.isDirectory(), isSym: stat.isSymbolicLink(), type: stat.type, size: stat.size },
      lstat: { isFile: lstat.isFile(), isDir: lstat.isDirectory(), isSym: lstat.isSymbolicLink(), type: lstat.type, size: lstat.size },
      linkTarget,
    };
  });

  console.log('[lfs]', JSON.stringify(result, null, 2));
  expect((result as any).lstat.isSym).toBe(true);
  expect((result as any).linkTarget).toBe('/symtest/target.txt');
});

test('debug: adapter lstat returns isSymbolicLink', async ({ page }) => {
  page.on('console', msg => console.log(`[br] ${msg.text()}`));

  await page.goto('/');
  await page.waitForSelector('.wterm .term-grid .term-row', { timeout: 15_000 });
  await expect(page.locator('.wterm')).toContainText('$', { timeout: 15_000 });

  const result = await page.evaluate(async () => {
    const fs = (window as any).__fs;
    if (!fs) return { error: '__fs not on window' };

    try { await fs.mkdir('/symtest2', { recursive: true }); } catch {}
    await fs.writeFile('/symtest2/target.txt', 'hello');
    await fs.symlink('/symtest2/target.txt', '/symtest2/link.txt');

    const stat = await fs.stat('/symtest2/link.txt');
    const lstat = await fs.lstat('/symtest2/link.txt');
    let linkTarget = '';
    try { linkTarget = await fs.readlink('/symtest2/link.txt'); } catch (e: any) { linkTarget = `ERROR: ${e.message}`; }

    return {
      stat: { isFile: stat.isFile, isDir: stat.isDirectory, isSym: stat.isSymbolicLink, mode: stat.mode, size: stat.size },
      lstat: { isFile: lstat.isFile, isDir: lstat.isDirectory, isSym: lstat.isSymbolicLink, mode: lstat.mode, size: lstat.size },
      linkTarget,
    };
  });

  console.log('[adapter]', JSON.stringify(result, null, 2));
  expect((result as any).lstat.isSym).toBe(true);
  expect((result as any).stat.isFile).toBe(true);
  expect((result as any).stat.isSym).toBe(false);
});
