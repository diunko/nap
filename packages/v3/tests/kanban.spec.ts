import { test, expect } from '@playwright/test';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
  createTestNepicDir,
} from './helpers';
import { F14_FIXTURE } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

// ── Helper: boot app with F14 fixture ──

async function bootWithF14(): Promise<void> {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F14_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );
}

// T-0500-10: Cmd+` toggles kanban overlay visibility
test('T-0500-10: Cmd+` toggles kanban overlay visibility', async () => {
  await bootWithF14();

  // Initially hidden
  const initialVisible = await page.evaluate(() =>
    (window as any).__napStore__.getState().kanbanVisible,
  );
  expect(initialVisible).toBe(false);

  // Dispatch Cmd+`
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '`', metaKey: true }),
    );
  });

  const afterToggle = await page.evaluate(() =>
    (window as any).__napStore__.getState().kanbanVisible,
  );
  expect(afterToggle).toBe(true);

  // Toggle again
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '`', metaKey: true }),
    );
  });

  const afterSecondToggle = await page.evaluate(() =>
    (window as any).__napStore__.getState().kanbanVisible,
  );
  expect(afterSecondToggle).toBe(false);

  await cleanupApp(app, tmpDir);
});

// T-0500-11: kanban overlay fallback keydown handler for macOS Cmd+` conflict
test('T-0500-11: fallback keydown handler fires for Cmd+`', async () => {
  await bootWithF14();

  // Dispatch synthetic KeyboardEvent for backtick+meta
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '`', metaKey: true, bubbles: true }),
    );
  });

  const visible = await page.evaluate(() =>
    (window as any).__napStore__.getState().kanbanVisible,
  );
  expect(visible).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-0500-12: kanban overlay has three display columns with correct headers and counts
test('T-0500-12: kanban overlay has three columns', async () => {
  await bootWithF14();

  // Open kanban
  await page.evaluate(() =>
    (window as any).__napStore__.getState().toggleKanban(),
  );

  // Wait for overlay to render
  await page.waitForSelector('[data-testid="kanban-overlay"]');

  // Check 3 display columns exist
  const columns = await page.evaluate(() => {
    const cols = ['backlog', 'doing', 'done'];
    return cols.map((key) => {
      const el = document.querySelector(`[data-testid="kanban-col-${key}"]`);
      const header = document.querySelector(`[data-testid="kanban-col-header-${key}"]`);
      return {
        key,
        exists: !!el,
        headerText: header?.textContent ?? '',
      };
    });
  });

  expect(columns).toHaveLength(3);
  for (const col of columns) {
    expect(col.exists).toBe(true);
  }

  // backlog column = backlog + todo statuses → 2 cards
  const backlogHeader = columns.find((c) => c.key === 'backlog');
  expect(backlogHeader?.headerText).toContain('(2)');

  // doing column = doing + review statuses → 2 cards
  const doingHeader = columns.find((c) => c.key === 'doing');
  expect(doingHeader?.headerText).toContain('(2)');

  await cleanupApp(app, tmpDir);
});

// T-0500-13: kanban cards collapsed by default — only slug + dots visible
test('T-0500-13: kanban cards collapsed by default', async () => {
  await bootWithF14();

  // Open kanban
  await page.evaluate(() =>
    (window as any).__napStore__.getState().toggleKanban(),
  );

  await page.waitForSelector('[data-testid="kanban-card"]');

  // No expanded card bodies should be visible
  const expandedBodies = await page.evaluate(() => {
    return document.querySelectorAll('[data-testid="kanban-card-body"]').length;
  });
  expect(expandedBodies).toBe(0);

  await cleanupApp(app, tmpDir);
});

// T-0500-14: click card name → expand to show bullets + badges
test('T-0500-14: click card name → expand', async () => {
  await bootWithF14();

  // Open kanban
  await page.evaluate(() =>
    (window as any).__napStore__.getState().toggleKanban(),
  );

  await page.waitForSelector('[data-testid="kanban-card-header"]');

  // Click first card header
  await page.click('[data-testid="kanban-card-header"]');

  // Verify expanded body appears
  const bodyCount = await page.evaluate(() =>
    document.querySelectorAll('[data-testid="kanban-card-body"]').length,
  );
  expect(bodyCount).toBe(1);

  // Other cards remain collapsed
  const totalCards = await page.evaluate(() =>
    document.querySelectorAll('[data-testid="kanban-card"]').length,
  );
  expect(totalCards).toBe(5);

  await cleanupApp(app, tmpDir);
});

// T-0500-20: → button on card → dismisses kanban + focuses sidebar card + switches terminal
test('T-0500-20: → navigation dismisses kanban and focuses sidebar', async () => {
  await bootWithF14();

  // Open kanban
  await page.evaluate(() =>
    (window as any).__napStore__.getState().toggleKanban(),
  );

  await page.waitForSelector('[data-testid="kanban-card-navigate"]');

  // Find the → button for 0200-model (the DOING napkin)
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-testid="kanban-card"]');
    for (const card of cards) {
      const headerText = card.querySelector('[data-testid="kanban-card-header"]')?.textContent ?? '';
      if (headerText.includes('0200-model')) {
        const navBtn = card.querySelector('[data-testid="kanban-card-navigate"]') as HTMLElement;
        navBtn?.click();
        break;
      }
    }
  });

  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      kanbanVisible: s.kanbanVisible,
      focusedCardSlug: s.focusedCardSlug,
      activeTerminalId: s.activeTerminalId,
    };
  });

  expect(state.kanbanVisible).toBe(false);
  expect(state.focusedCardSlug).toBe('0200-model');

  await cleanupApp(app, tmpDir);
});

// T-0500-70: model → snapshot → store → kanban overlay renders correct cards
test('T-0500-70: full round-trip — kanban renders correct cards', async () => {
  await bootWithF14();

  // Open kanban
  await page.evaluate(() =>
    (window as any).__napStore__.getState().toggleKanban(),
  );

  await page.waitForSelector('[data-testid="kanban-card"]');

  // Count cards per column
  const cardCounts = await page.evaluate(() => {
    const cols = ['backlog', 'doing', 'done'];
    return cols.map((key) => {
      const col = document.querySelector(`[data-testid="kanban-col-${key}"]`);
      return col?.querySelectorAll('[data-testid="kanban-card"]').length ?? 0;
    });
  });

  // F14: backlog(backlog+todo)=2, doing(doing+review)=2, done=1
  expect(cardCounts).toEqual([2, 2, 1]);

  await cleanupApp(app, tmpDir);
});

// T-0500-82: kanban → navigate while sidebar hidden → sidebar shows + card focused
test('T-0500-82: navigate from kanban forces sidebar visible', async () => {
  await bootWithF14();

  // Hide sidebar
  await page.evaluate(() =>
    (window as any).__napStore__.getState().toggleSidebar(),
  );

  // Open kanban
  await page.evaluate(() =>
    (window as any).__napStore__.getState().toggleKanban(),
  );

  await page.waitForSelector('[data-testid="kanban-card-navigate"]');

  // Click first → button
  await page.click('[data-testid="kanban-card-navigate"]');

  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      sidebarVisible: s.sidebarVisible,
      focusedCardSlug: s.focusedCardSlug,
      kanbanVisible: s.kanbanVisible,
    };
  });

  expect(state.sidebarVisible).toBe(true);
  expect(state.focusedCardSlug).toBeTruthy();
  expect(state.kanbanVisible).toBe(false);

  await cleanupApp(app, tmpDir);
});
