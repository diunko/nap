import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
} from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: nepic with a .nap file containing mixed content ──

const MIXED_CONTENT = `# Heading one

* bullet one
* bullet two
  * nested bullet

**bold text** and normal

\`inline code\` here

// generic comment
//A: architect says hello
//DU: user feedback
//FS: engineer note
//TA: test architect thought
//TE: test engineer observation
`;

function createContentFixture(tmpDir: string): string {
  const nepicsBase = path.join(tmpDir, '.nap', 'nepics');
  const nepicDir = path.join(nepicsBase, 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': MIXED_CONTENT,
    '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      nepic: 'test-nepic',
      created_at: 1711700000000,
      started: true,
      exited: false,
    },
    '20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      nepic: 'test-nepic',
      created_at: 1711600000000,
      started: true,
      exited: false,
    },
  };

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(nepicDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (typeof content === 'string') {
      fs.writeFileSync(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
    }
  }

  return path.join(
    nepicDir,
    '30-napkins/0100-explore/0100-explore.nap.md',
  );
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let napFilePath: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  napFilePath = createContentFixture(tmpDir);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Wait for store to populate
  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
}

async function openFileInEditor(): Promise<void> {
  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openFile(fp);
  }, napFilePath);

  // Wait for Monaco editor to mount and file to load
  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const editors = m.editor.getEditors();
      if (!editors || editors.length === 0) return false;
      const model = editors[0].getModel();
      return model && model.getValue().includes('Heading');
    },
    { timeout: 15000 },
  );
}

// T-0100-M01: Monarch tokenizer registers as napkin-markdown language
test('M01: napkin-markdown language registered', async () => {
  await boot();
  await openFileInEditor();

  const languages = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    return m.languages.getLanguages().map((l: any) => l.id);
  });

  expect(languages).toContain('napkin-markdown');

  await cleanupApp(app, tmpDir);
});

// T-0100-M02: Heading token styling
test('M02: heading tokens produced', async () => {
  await boot();
  await openFileInEditor();

  const tokens = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const result = m.editor.tokenize('# heading text', 'napkin-markdown');
    // result is Token[][] — one array per line
    return result[0].map((t: any) => ({ offset: t.offset, type: t.type }));
  });

  // The entire line should get a 'heading' token
  const headingTokens = tokens.filter((t: any) => t.type.includes('heading'));
  expect(headingTokens.length).toBeGreaterThan(0);

  await cleanupApp(app, tmpDir);
});

// T-0100-M03: Role-prefixed comment tokens
test('M03: role-prefixed comment tokens', async () => {
  await boot();
  await openFileInEditor();

  const results = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const lines = [
      '//A: architect',
      '//DU: user',
      '//FS: engineer',
      '//TA: test-arch',
      '//TE: test-eng',
    ];
    return lines.map((line) => {
      const tokens = m.editor.tokenize(line, 'napkin-markdown');
      return {
        line,
        tokens: tokens[0].map((t: any) => ({ offset: t.offset, type: t.type })),
      };
    });
  });

  const expectedTypes = [
    'comment.architect',
    'comment.user',
    'comment.fs-eng',
    'comment.test-arch',
    'comment.test-eng',
  ];

  for (let i = 0; i < results.length; i++) {
    const hasExpectedToken = results[i].tokens.some(
      (t: any) => t.type.includes(expectedTypes[i]),
    );
    expect(hasExpectedToken, `Expected ${expectedTypes[i]} for "${results[i].line}"`).toBe(true);
  }

  await cleanupApp(app, tmpDir);
});

// T-0100-M04: Generic comment fallback
test('M04: generic comment token (no role prefix)', async () => {
  await boot();
  await openFileInEditor();

  const tokens = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const result = m.editor.tokenize('// just a comment', 'napkin-markdown');
    return result[0].map((t: any) => ({ offset: t.offset, type: t.type }));
  });

  // Should have generic 'comment' token, NOT comment.architect etc.
  const commentTokens = tokens.filter((t: any) => t.type.includes('comment'));
  expect(commentTokens.length).toBeGreaterThan(0);

  // None should be role-specific
  const roleTokens = commentTokens.filter(
    (t: any) =>
      t.type.includes('comment.architect') ||
      t.type.includes('comment.user') ||
      t.type.includes('comment.fs-eng') ||
      t.type.includes('comment.test-arch') ||
      t.type.includes('comment.test-eng'),
  );
  expect(roleTokens).toHaveLength(0);

  await cleanupApp(app, tmpDir);
});

// T-0100-M05: Mixed content document
test('M05: mixed content tokenization', async () => {
  await boot();
  await openFileInEditor();

  const results = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const lines = [
      '# Heading one',
      '* bullet one',
      '**bold text** and normal',
      '`inline code` here',
      '//A: architect says hello',
      '// generic comment',
    ];
    return lines.map((line) => {
      const tokens = m.editor.tokenize(line, 'napkin-markdown');
      return {
        line,
        types: tokens[0].map((t: any) => t.type),
      };
    });
  });

  // Heading
  expect(results[0].types.some((t: string) => t.includes('heading'))).toBe(true);

  // Bullet
  expect(results[1].types.some((t: string) => t.includes('bullet.marker'))).toBe(true);

  // Bold
  expect(results[2].types.some((t: string) => t.includes('bold'))).toBe(true);

  // Inline code
  expect(results[3].types.some((t: string) => t.includes('inline-code'))).toBe(true);

  // Role comment
  expect(results[4].types.some((t: string) => t.includes('comment.architect'))).toBe(true);

  // Generic comment
  const genericCommentTypes = results[5].types;
  expect(genericCommentTypes.some((t: string) => t.includes('comment'))).toBe(true);
  expect(genericCommentTypes.some((t: string) => t.includes('comment.architect'))).toBe(false);

  await cleanupApp(app, tmpDir);
});

// T-0100-M06: Editor config applied
test('M06: editor config applied', async () => {
  await boot();
  await openFileInEditor();

  const config = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    if (editors.length === 0) return null;
    const editor = editors[0];

    // Monaco option IDs — read via getRawOptions or getOption
    const opts = editor.getRawOptions();
    return {
      wordWrap: opts.wordWrap,
      minimap: opts.minimap?.enabled,
      lineNumbers: opts.lineNumbers,
      quickSuggestions: opts.quickSuggestions,
      fontSize: opts.fontSize,
    };
  });

  expect(config).not.toBeNull();
  expect(config.wordWrap).toBe('on');
  expect(config.minimap).toBe(false);
  expect(config.lineNumbers).toBe('off');
  // Monaco normalizes `false` to {comments: "off", other: "off", strings: "off"}
  if (typeof config.quickSuggestions === 'object') {
    expect(config.quickSuggestions.other).toBe('off');
  } else {
    expect(config.quickSuggestions).toBe(false);
  }
  expect(config.fontSize).toBe(14);

  await cleanupApp(app, tmpDir);
});
