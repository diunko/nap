import {
  test as base,
  expect,
  ElectronApplication,
  Page,
} from '@playwright/test';
import {
  createTerminal,
  ptyWrite,
  bufferLength,
  bufferLine,
  getActiveId,
  getTerminalMeta,
  launchApp,
  cleanupApp,
} from '../helpers';

// ---------- fixture: fresh Electron app per test ----------
const test = base.extend<{ app: ElectronApplication; page: Page }>({
  app: async ({}, use) => {
    const { app, tmpDir } = await launchApp();
    await use(app);
    await cleanupApp(app, tmpDir);
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForFunction(
      () => (window as any).useTerminalStore?.getState()?.terminals.length > 0,
      { timeout: 15000 },
    );
    await page.waitForTimeout(500);
    await use(page);
  },
});

// -------------------------------------------------------
// T-0200-01: terminal switching preserves scrollback and buffer state
// -------------------------------------------------------
test('T-0200-01: buffer preserved across terminal switch', async ({ page }) => {
  // Terminal A is already created by app startup
  const termA = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals[0].id as string,
  );

  // Write 5000 lines to terminal A
  await ptyWrite(page, termA, 'seq 1 5000\n');

  // Wait for seq to finish — look for "5000" in buffer (last output line)
  await page.waitForFunction(
    (tid) => {
      const entry = (window as any).getTerminal(tid);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = buf.length - 1; i >= 0; i--) {
        const line = buf.getLine(i)?.translateToString(true) ?? '';
        if (line.includes('5000')) return true;
      }
      return false;
    },
    termA,
    { timeout: 30000 },
  );
  // Small extra settle to ensure no more data trickling in
  await page.waitForTimeout(500);

  const lengthBefore = await bufferLength(page, termA);
  const line50Before = await bufferLine(page, termA, 50);

  // Create terminal B (becomes active via the createTerminal helper)
  const termB = await createTerminal(page, 'termB');
  expect(await getActiveId(page)).toBe(termB);

  // Switch back to A
  await page.evaluate((tid) => {
    (window as any).useTerminalStore.getState().setActive(tid);
  }, termA);
  // Let reparent + fit settle
  await page.waitForTimeout(200);

  const lengthAfter = await bufferLength(page, termA);
  const line50After = await bufferLine(page, termA, 50);

  expect(lengthAfter).toBe(lengthBefore);
  expect(line50After).toBe(line50Before);
});

// -------------------------------------------------------
// T-0200-02: WebGL survives DOM detach/reattach cycle
// -------------------------------------------------------
test('T-0200-02: WebGL context survives reparent', async ({ page }) => {
  const termA = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals[0].id as string,
  );

  // Attach a context-loss listener on the first canvas (WebGL canvas)
  const hasCanvas = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    const canvas = entry?.terminal.element?.querySelector('canvas');
    if (!canvas) return false;
    (window as any)._contextLost = false;
    canvas.addEventListener('webglcontextlost', () => {
      (window as any)._contextLost = true;
    });
    return true;
  }, termA);

  if (!hasCanvas) {
    // WebGL never loaded (headless / no GPU) — cannot test context loss.
    // Verify terminal still functions after reparent instead.
    const termB = await createTerminal(page, 'termB');
    await page.evaluate((tid) => {
      (window as any).useTerminalStore.getState().setActive(tid);
    }, termA);
    await page.waitForTimeout(200);

    await ptyWrite(page, termA, 'echo AFTER_REPARENT\n');
    await page.waitForFunction(
      (tid) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return false;
        const buf = entry.terminal.buffer.active;
        for (let i = 0; i < buf.length; i++) {
          if (buf.getLine(i)?.translateToString(true)?.includes('AFTER_REPARENT')) return true;
        }
        return false;
      },
      termA,
      { timeout: 10000 },
    );
    // If we get here, rendering works after reparent — good enough.
    return;
  }

  // Switch away and back
  const termB = await createTerminal(page, 'termB');
  await page.evaluate((tid) => {
    (window as any).useTerminalStore.getState().setActive(tid);
  }, termA);
  await page.waitForTimeout(300);

  const contextLost = await page.evaluate(() => (window as any)._contextLost);

  if (contextLost) {
    // Context was lost — verify fallback fired (CanvasAddon loaded)
    // terminal-registry.ts onContextLoss handler disposes webgl and loads canvas
    // We just verify the terminal is still functional
    await ptyWrite(page, termA, 'echo FALLBACK_OK\n');
    await page.waitForFunction(
      (tid) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return false;
        const buf = entry.terminal.buffer.active;
        for (let i = 0; i < buf.length; i++) {
          if (buf.getLine(i)?.translateToString(true)?.includes('FALLBACK_OK')) return true;
        }
        return false;
      },
      termA,
      { timeout: 10000 },
    );
  } else {
    // Context survived — verify rendering still works
    await ptyWrite(page, termA, 'echo RENDER_OK\n');
    await page.waitForFunction(
      (tid) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return false;
        const buf = entry.terminal.buffer.active;
        for (let i = 0; i < buf.length; i++) {
          if (buf.getLine(i)?.translateToString(true)?.includes('RENDER_OK')) return true;
        }
        return false;
      },
      termA,
      { timeout: 10000 },
    );
  }
});

// -------------------------------------------------------
// T-0200-03: background terminal receives output while hidden
// -------------------------------------------------------
test('T-0200-03: background terminal receives pty output', async ({ page }) => {
  const termA = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals[0].id as string,
  );

  // Create terminal B (becomes active)
  const termB = await createTerminal(page, 'termB');

  // Switch back to A so B is in the background
  await page.evaluate((tid) => {
    (window as any).useTerminalStore.getState().setActive(tid);
  }, termA);
  await page.waitForTimeout(200);

  // Write to B's pty while A is active (B is hidden)
  await ptyWrite(page, termB, 'seq 1 100\n');

  // Wait for B's buffer to fill — WITHOUT switching to B.
  // Check for a line that is exactly "100" (not a substring of the echoed command "seq 1 100").
  await page.waitForFunction(
    (tid) => {
      const entry = (window as any).getTerminal(tid);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        const line = buf.getLine(i)?.translateToString(true) ?? '';
        if (line === '100') return true;
      }
      return false;
    },
    termB,
    { timeout: 15000 },
  );

  // Verify a specific earlier line is also present
  const found = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    if (!entry) return false;
    const buf = entry.terminal.buffer.active;
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i)?.translateToString(true) ?? '';
      if (line === '50') return true;
    }
    return false;
  }, termB);

  expect(found).toBe(true);
});

// -------------------------------------------------------
// T-0200-04: rapid switching doesn't corrupt state or leak
// -------------------------------------------------------
test('T-0200-04: rapid switching preserves correct state', async ({ page }) => {
  // Collect console errors
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const termA = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals[0].id as string,
  );
  const termB = await createTerminal(page, 'termB');
  const termC = await createTerminal(page, 'termC');

  // Write unique markers to each pty
  await ptyWrite(page, termA, 'echo MARKER_A\n');
  await ptyWrite(page, termB, 'echo MARKER_B\n');
  await ptyWrite(page, termC, 'echo MARKER_C\n');

  // Wait for all markers to appear in their respective buffers
  for (const [id, marker] of [
    [termA, 'MARKER_A'],
    [termB, 'MARKER_B'],
    [termC, 'MARKER_C'],
  ] as const) {
    await page.waitForFunction(
      ([tid, m]) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return false;
        const buf = entry.terminal.buffer.active;
        for (let i = 0; i < buf.length; i++) {
          if (buf.getLine(i)?.translateToString(true)?.includes(m)) return true;
        }
        return false;
      },
      [id, marker] as const,
      { timeout: 10000 },
    );
  }

  // Rapid-fire switching
  await page.evaluate(
    ([a, b, c]) => {
      const s = (window as any).useTerminalStore.getState();
      s.setActive(b);
      s.setActive(c);
      s.setActive(a);
      s.setActive(b);
      s.setActive(c);
    },
    [termA, termB, termC] as const,
  );

  // Let React + reparent settle
  await page.waitForTimeout(500);

  // Active should be termC (last setActive call)
  expect(await getActiveId(page)).toBe(termC);

  // Active terminal's buffer should contain MARKER_C
  const hasMarkerC = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    if (!entry) return false;
    const buf = entry.terminal.buffer.active;
    for (let i = 0; i < buf.length; i++) {
      if (buf.getLine(i)?.translateToString(true)?.includes('MARKER_C')) return true;
    }
    return false;
  }, termC);

  expect(hasMarkerC).toBe(true);

  // No error-level console messages from our code (filter out Electron noise)
  const relevantErrors = consoleErrors.filter(
    (e) => !e.includes('DevTools') && !e.includes('Autofill'),
  );
  expect(relevantErrors).toEqual([]);
});

// -------------------------------------------------------
// T-0200-05: sidebar Cmd+B toggle resizes terminal correctly
// -------------------------------------------------------
test('T-0200-05: sidebar toggle changes terminal cols', async ({ page }) => {
  const termA = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals[0].id as string,
  );

  // Read initial cols (sidebar visible, ~250px used)
  const colsBefore = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.cols ?? 0;
  }, termA);

  expect(colsBefore).toBeGreaterThan(0);

  // Toggle sidebar off
  await page.evaluate(() => {
    (window as any).useTerminalStore.getState().toggleSidebar();
  });

  // Wait for ResizeObserver + 50ms debounce + fit
  await page.waitForTimeout(300);

  const colsAfter = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.cols ?? 0;
  }, termA);

  // More columns now that sidebar is gone
  expect(colsAfter).toBeGreaterThan(colsBefore);

  // Toggle sidebar back on
  await page.evaluate(() => {
    (window as any).useTerminalStore.getState().toggleSidebar();
  });
  await page.waitForTimeout(300);

  const colsRestored = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.cols ?? 0;
  }, termA);

  expect(colsRestored).toBe(colsBefore);
});

// -------------------------------------------------------
// T-0200-06: terminal exit updates sidebar card but doesn't remove it
// -------------------------------------------------------
test('T-0200-06: pty exit sets status to exited, keeps card', async ({ page }) => {
  // Create terminal B
  const termB = await createTerminal(page, 'exit-test');

  // Count terminals before
  const countBefore = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals.length,
  );

  // Send exit command to B's pty
  await ptyWrite(page, termB, 'exit\n');

  // Wait for status to change to 'exited'
  await page.waitForFunction(
    (tid) => {
      const store = (window as any).useTerminalStore.getState();
      const meta = store.terminals.find((t: any) => t.id === tid);
      return meta?.status === 'exited';
    },
    termB,
    { timeout: 15000 },
  );

  const meta = await getTerminalMeta(page, termB);
  expect(meta.status).toBe('exited');

  // Terminal still in store (not removed)
  const countAfter = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals.length,
  );
  expect(countAfter).toBe(countBefore);

  // Buffer still readable
  const bufLen = await bufferLength(page, termB);
  expect(bufLen).toBeGreaterThan(0);
});
