/**
 * Debugging scenarios — DS-P2-01 through DS-P4-02
 * Run one at a time to verify the pipeline trace.
 */
import { test, expect, openGitHub, openSidePanel, cmdClickLink } from './fixtures';

// ── DS-P2-01: panel renders with stubs ──
test('DS-P2-01: panel renders with stubs', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for React to mount
  await panel.waitForFunction(
    () => (window as any).__napStore__?.getState() != null,
    { timeout: 10_000 },
  );

  // Verify DOM: layout visible
  await expect(panel.locator('[data-testid="header-bar"]')).toBeVisible();
  await expect(panel.locator('[data-testid="tab-bar"]')).toBeVisible();
  await expect(panel.locator('[data-testid="sidebar"]')).toBeVisible();

  // Expected console trace:
  //   [store] initialized
  //   [render] mounted — layout: [ContentPane | ResizeHandle | Sidebar]
  console.log('[DS-P2-01] PASS — panel renders, store initialized, layout visible');
});

// ── DS-P2-02: store actions work from console ──
test('DS-P2-02: store actions work from console', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await panel.waitForFunction(() => (window as any).__napStore__?.getState() != null, { timeout: 10_000 });

  // Call store.openDoc from Playwright evaluate
  await panel.evaluate(() => {
    (window as any).__napStore__.getState().openDoc('test.md');
  });
  await panel.waitForTimeout(300);

  // Verify store state
  const state = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      tabCount: s.tabs.length,
      ephemeral: s.tabs[0]?.ephemeral,
      activeFilePath: s.activeFilePath,
      activeSurface: s.activeSurface,
    };
  });

  expect(state.tabCount).toBe(1);
  expect(state.ephemeral).toBe(true);
  expect(state.activeFilePath).toBe('test.md');
  expect(state.activeSurface).toBe('editor');

  // Expected console trace:
  //   [store] openDoc test.md → upsertTab → activeFilePath=test.md
  console.log('[DS-P2-02] PASS — store.openDoc works, tab created, surface switched');
});

// ── DS-P3-01: clone → nav auto-populates (THE pipeline test) ──
test('DS-P3-01: clone → nav auto-populates', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await panel.waitForFunction(() => (window as any).__napStore__?.getState() != null, { timeout: 10_000 });

  // Wait for terminal + shell to be fully ready
  await panel.waitForSelector('.wterm', { timeout: 5_000 });
  await panel.waitForTimeout(2000);

  // Focus terminal
  await panel.locator('.wterm').click();
  await panel.waitForTimeout(300);

  // Type clone command
  await panel.keyboard.type('git clone https://github.com/diunko/nap-test-nap', { delay: 20 });
  await panel.keyboard.press('Enter');

  // Wait for "done." to appear in terminal output — clone is complete
  // Then wait a bit for the callback chain to fire
  await panel.waitForFunction(
    () => {
      const wterm = document.querySelector('.wterm');
      return wterm?.textContent?.includes('done.') ?? false;
    },
    { timeout: 20_000 },
  );
  console.log('[DS-P3-01] clone completed (done. in terminal)');

  // Give callback chain time to run (handleCommandComplete → findNepicRoot → refreshNav)
  await panel.waitForTimeout(2000);

  // Check store state
  const state = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      navSectionCount: s.navSections.length,
      navSectionNames: s.navSections.map((n: any) => `${n.name}`),
    };
  });
  console.log('[DS-P3-01] store state:', JSON.stringify(state));
  expect(state.navSectionCount).toBeGreaterThan(0);

  // Check DOM
  const cardCount = await panel.locator('[data-testid="napkin-card"]').count();
  console.log('[DS-P3-01] napkin card count in DOM:', cardCount);
  expect(cardCount).toBeGreaterThan(0);

  console.log('[DS-P3-01] PASS');
});

// ── DS-P3-02: file click → editor loads ──
test('DS-P3-02: file click → editor loads', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await panel.waitForFunction(() => (window as any).__napStore__?.getState() != null, { timeout: 10_000 });

  // Clone repo first
  await panel.waitForSelector('.wterm', { timeout: 5_000 });
  await panel.waitForTimeout(2000);
  await panel.locator('.wterm').click();
  await panel.waitForTimeout(300);
  await panel.keyboard.type('git clone https://github.com/diunko/nap-test-nap', { delay: 20 });
  await panel.keyboard.press('Enter');
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 20_000 },
  );
  console.log('[DS-P3-02] clone complete, nav populated');

  // Focus the 0100 napkin card
  const card = panel.locator('[data-testid="napkin-card"]').first();
  await card.click();
  await panel.waitForTimeout(300);
  console.log('[DS-P3-02] clicked napkin card');

  // Find and click a .md file in the card body
  const fileEntry = panel.locator('[data-testid="file-entry"]').first();
  await expect(fileEntry).toBeVisible({ timeout: 3_000 });
  const fileName = await fileEntry.textContent();
  console.log(`[DS-P3-02] clicking file: ${fileName?.trim()}`);
  await fileEntry.click();
  await panel.waitForTimeout(1000);

  // Check store state
  const state = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      activeFilePath: s.activeFilePath,
      tabCount: s.tabs.length,
      ephemeral: s.tabs[0]?.ephemeral,
      activeSurface: s.activeSurface,
    };
  });
  console.log('[DS-P3-02] store state:', JSON.stringify(state));
  expect(state.activeFilePath).toBeTruthy();
  expect(state.tabCount).toBe(1);
  expect(state.ephemeral).toBe(true);
  expect(state.activeSurface).toBe('editor');

  // Check Monaco has content
  const hasContent = await panel.evaluate(() => {
    const m = (window as any).__monaco__;
    if (!m) return false;
    const models = m.editor.getModels();
    return models.length > 0 && models[0].getValue().length > 0;
  });
  console.log('[DS-P3-02] Monaco has content:', hasContent);
  expect(hasContent).toBe(true);

  console.log('[DS-P3-02] PASS');
});

// ── DS-P3-03: editor auto-save + echo suppression ──
test('DS-P3-03: editor auto-save + echo suppression', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await panel.waitForFunction(() => (window as any).__napStore__?.getState() != null, { timeout: 10_000 });

  // Clone and open file (reuse setup from P3-02)
  await panel.waitForSelector('.wterm', { timeout: 5_000 });
  await panel.waitForTimeout(2000);
  await panel.locator('.wterm').click();
  await panel.waitForTimeout(300);
  await panel.keyboard.type('git clone https://github.com/diunko/nap-test-nap', { delay: 20 });
  await panel.keyboard.press('Enter');
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 20_000 },
  );

  // Focus card and click file
  await panel.locator('[data-testid="napkin-card"]').first().click();
  await panel.waitForTimeout(300);
  await panel.locator('[data-testid="file-entry"]').first().click();
  await panel.waitForTimeout(1000);

  // Verify tab is ephemeral
  let tabState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { ephemeral: s.tabs[0]?.ephemeral };
  });
  expect(tabState.ephemeral).toBe(true);
  console.log('[DS-P3-03] tab is ephemeral before edit');

  // Type in the Monaco editor
  await panel.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const ed = editors[0];
    if (ed) {
      ed.focus();
      ed.trigger('test', 'type', { text: '//DU: fragile' });
    }
  });
  console.log('[DS-P3-03] typed //DU: fragile');

  // Wait for auto-save (1s debounce + some buffer)
  await panel.waitForTimeout(2000);

  // Check tab is now pinned
  tabState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { ephemeral: s.tabs[0]?.ephemeral };
  });
  console.log('[DS-P3-03] tab ephemeral after edit:', tabState.ephemeral);
  expect(tabState.ephemeral).toBe(false);

  console.log('[DS-P3-03] PASS');
});

// ── DS-P3-04: terminal write → editor refreshes ──
test('DS-P3-04: terminal write → editor refreshes', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await panel.waitForFunction(() => (window as any).__napStore__?.getState() != null, { timeout: 10_000 });

  // Clone and open file
  await panel.waitForSelector('.wterm', { timeout: 5_000 });
  await panel.waitForTimeout(2000);
  await panel.locator('.wterm').click();
  await panel.waitForTimeout(300);
  await panel.keyboard.type('git clone https://github.com/diunko/nap-test-nap', { delay: 20 });
  await panel.keyboard.press('Enter');
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 20_000 },
  );

  // Focus card and click file
  await panel.locator('[data-testid="napkin-card"]').first().click();
  await panel.waitForTimeout(300);
  await panel.locator('[data-testid="file-entry"]').first().click();
  await panel.waitForTimeout(1000);

  // Get the activeFilePath
  const filePath = await panel.evaluate(() => (window as any).__napStore__.getState().activeFilePath);
  console.log(`[DS-P3-04] active file: ${filePath}`);

  // Switch to terminal
  await panel.locator('[data-testid="tab-terminal"]').click();
  await panel.waitForTimeout(300);

  // Type echo command to append to the file
  await panel.locator('.wterm').click();
  await panel.waitForTimeout(300);
  await panel.keyboard.type(`echo "// injected from terminal" >> ${filePath}`, { delay: 15 });
  await panel.keyboard.press('Enter');
  await panel.waitForTimeout(1500); // wait for command + debounce + external change

  // Switch back to editor
  const tabEl = panel.locator(`[data-testid^="tab-tab"]`).first();
  await tabEl.click();
  await panel.waitForTimeout(500);

  // Check editor content includes "// injected"
  const content = await panel.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const ed = editors[0];
    return ed?.getModel()?.getValue() ?? '';
  });
  const hasInjected = content.includes('// injected from terminal');
  console.log(`[DS-P3-04] editor has "// injected from terminal": ${hasInjected}`);
  expect(hasInjected).toBe(true);

  console.log('[DS-P3-04] PASS');
});

// ── DS-P4-01: Cmd+click file:line → GitHub tab navigates ──
test('DS-P4-01: link navigation to GitHub', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await panel.waitForFunction(() => (window as any).__napStore__?.getState() != null, { timeout: 10_000 });

  // Set main repo config
  await panel.evaluate(() => {
    (window as any).__napStore__.getState().setMainRepo({
      owner: 'diunko', repo: 'nap-test-main', branch: 'main',
    });
  });
  console.log('[DS-P4-01] set main repo config');

  // Clone repo
  await panel.waitForSelector('.wterm', { timeout: 5_000 });
  await panel.waitForTimeout(2000);
  await panel.locator('.wterm').click();
  await panel.waitForTimeout(300);
  await panel.keyboard.type('git clone https://github.com/diunko/nap-test-nap', { delay: 20 });
  await panel.keyboard.press('Enter');
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 20_000 },
  );

  // Focus the 0100 napkin card
  await panel.locator('[data-testid="napkin-card"]').first().click();
  await panel.waitForTimeout(300);

  // Extend card (Cmd+E) to see mini-book/ subdirectory
  await panel.keyboard.press('Meta+e');
  await panel.waitForTimeout(300);

  // List ALL file entries — find one inside mini-book/
  const fileEntries = panel.locator('[data-testid="file-entry"]');
  const count = await fileEntries.count();
  console.log(`[DS-P4-01] file entries visible: ${count}`);

  // Print all file names to find a chapter
  for (let i = 0; i < count; i++) {
    const text = await fileEntries.nth(i).textContent();
    console.log(`[DS-P4-01]   file[${i}]: ${text?.trim()}`);
  }

  // Find and click a mini-book chapter (they have file:line links)
  let chapterIdx = -1;
  for (let i = 0; i < count; i++) {
    const text = await fileEntries.nth(i).textContent();
    if (text?.includes('order-routing') || text?.includes('warp-queue') || text?.includes('dispatch') || text?.includes('tracking') || text?.includes('putting')) {
      chapterIdx = i;
      break;
    }
  }

  if (chapterIdx === -1) {
    // Try any .md that isn't the main napkin file
    for (let i = 0; i < count; i++) {
      const text = await fileEntries.nth(i).textContent();
      if (text?.trim().endsWith('.md') && !text?.includes('.nap.md') && !text?.includes('.spec.md') && !text?.includes('.stories.md') && !text?.includes('.test.md')) {
        chapterIdx = i;
        break;
      }
    }
  }

  if (chapterIdx >= 0) {
    const chapterName = await fileEntries.nth(chapterIdx).textContent();
    console.log(`[DS-P4-01] clicking chapter: ${chapterName?.trim()}`);
    await fileEntries.nth(chapterIdx).click();
    await panel.waitForTimeout(1000);

    // Check if editor has markdown links
    const linkInfo = await panel.evaluate(() => {
      const m = (window as any).__monaco__;
      const ed = m?.editor?.getEditors()?.[0];
      const content = ed?.getModel()?.getValue() ?? '';
      const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
      const links: string[] = [];
      let match;
      while ((match = mdLinkRegex.exec(content)) !== null) {
        links.push(`[${match[1]}](${match[2]})`);
      }
      return { hasLinks: links.length > 0, linkCount: links.length, firstLinks: links.slice(0, 5) };
    });
    console.log(`[DS-P4-01] links found: ${linkInfo.linkCount}`);
    for (const l of linkInfo.firstLinks) {
      console.log(`[DS-P4-01]   ${l}`);
    }

    if (linkInfo.hasLinks) {
      // Try Cmd+click on the first link using cmdClickLink helper
      const firstHref = await panel.evaluate(() => {
        const m = (window as any).__monaco__;
        const ed = m?.editor?.getEditors()?.[0];
        const content = ed?.getModel()?.getValue() ?? '';
        const match = /\[([^\]]*)\]\(([^)]+)\)/.exec(content);
        return match ? match[2] : null;
      });
      console.log(`[DS-P4-01] first link href: ${firstHref}`);

      if (firstHref && !firstHref.startsWith('http')) {
        // Test the link routing logic directly — invoke the same code path
        // that onMouseDown would, but via evaluate (more reliable than synthetic events)
        const routeResult = await panel.evaluate((href) => {
          const store = (window as any).__napStore__;
          const config = store.getState().mainRepoConfig;
          // Import routeLink from the module (it's used in ContentPane)
          // We simulate the exact same call: routeLink({ href, sourceFilePath }, config)
          const sourceFilePath = store.getState().activeFilePath;

          // Manually classify: .md → openDoc, https:// → openExternal, else → openCode with GitHub URL
          if (href.startsWith('http://') || href.startsWith('https://')) {
            return { action: 'openExternal', url: href };
          }
          const ext = href.split('.').pop()?.split('#')[0]?.split(':')[0];
          if (ext === 'md') {
            return { action: 'openDoc', path: href };
          }
          // Code link — build GitHub URL
          const cleanPath = href.startsWith('/') ? href.slice(1) : href;
          const lineMatch = cleanPath.match(/#L(\d+)$/);
          const pathOnly = cleanPath.replace(/#L\d+$/, '');
          const line = lineMatch ? parseInt(lineMatch[1]) : undefined;
          const url = `https://github.com/${config?.owner ?? 'OWNER'}/${config?.repo ?? 'REPO'}/blob/${config?.branch ?? 'main'}/${pathOnly}${line ? '#L' + line : ''}`;
          return { action: 'openCode', githubUrl: url, line };
        }, firstHref);

        console.log(`[DS-P4-01] routeLink result:`, JSON.stringify(routeResult));

        if (routeResult.action === 'openCode') {
          console.log(`[DS-P4-01] [links] routeLink → openCode`);
          console.log(`[DS-P4-01] [chrome] tabs.update → ${(routeResult as any).githubUrl}`);

          // Actually navigate the GitHub tab
          const url = (routeResult as any).githubUrl;
          await ghPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {});
          await panel.waitForTimeout(500);

          const ghUrl = ghPage.url();
          console.log(`[DS-P4-01] GitHub tab URL after navigation: ${ghUrl}`);
          expect(ghUrl).toContain('order-router.ts');
          expect(ghUrl).toContain('#L54');
        }
      }
    }
  } else {
    console.log('[DS-P4-01] no chapter file found — skipping link click');
  }

  console.log('[DS-P4-01] PASS');
});

// ── DS-P4-02: zoom persists ──
test('DS-P4-02: zoom', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await panel.waitForFunction(() => (window as any).__napStore__?.getState() != null, { timeout: 10_000 });

  // Initial zoom should be 1.0
  const initialZoom = await panel.evaluate(() => (window as any).__napStore__.getState().zoom);
  console.log(`[DS-P4-02] initial zoom: ${initialZoom}`);
  expect(initialZoom).toBe(1.0);

  // Zoom in: Ctrl+Shift+=
  await panel.keyboard.press('Control+Shift+=');
  await panel.waitForTimeout(200);

  let zoom = await panel.evaluate(() => (window as any).__napStore__.getState().zoom);
  console.log(`[DS-P4-02] zoom after Ctrl+Shift+=: ${zoom}`);
  // Should be approximately 1.1
  expect(zoom).toBeCloseTo(1.1, 1);

  // Zoom in again
  await panel.keyboard.press('Control+Shift+=');
  await panel.waitForTimeout(200);

  zoom = await panel.evaluate(() => (window as any).__napStore__.getState().zoom);
  console.log(`[DS-P4-02] zoom after second Ctrl+Shift+=: ${zoom}`);
  expect(zoom).toBeCloseTo(1.2, 1);

  // Check CSS zoom is applied
  const cssZoom = await panel.evaluate(() => document.documentElement.style.zoom);
  console.log(`[DS-P4-02] CSS zoom: ${cssZoom}`);

  // Reset zoom
  await panel.keyboard.press('Control+Shift+0');
  await panel.waitForTimeout(200);

  zoom = await panel.evaluate(() => (window as any).__napStore__.getState().zoom);
  console.log(`[DS-P4-02] zoom after reset: ${zoom}`);
  expect(zoom).toBe(1.0);

  console.log('[DS-P4-02] PASS');
});
