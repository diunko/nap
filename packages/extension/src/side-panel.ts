/**
 * Side panel entry point — wires Monaco, terminal, nav tree, tab bar, link routing.
 *
 * Priority order (matches test gates):
 * 1. Monaco boots (T1.1)
 * 2. Monaco reads from LFS (T2.1)
 * 3. Auto-save to LFS (T2.2)
 * 4. Terminal surface
 * 5. Bidirectional LFS sharing
 * 6. Nav tree
 * 7. Tab bar
 * 8. Link routing
 * 9. Theme
 * 10. Auth
 */
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import * as monaco from 'monaco-editor';
import LightningFS from '@isomorphic-git/lightning-fs';
import { WTerm } from '@wterm/dom';
import { LightningFsAdapter } from './fs-adapter';
import { createGitCommand } from './git-command';
import { BashShell } from './shell';
import { registerNapkinMarkdown, registerShiftEnter } from './napkin-markdown';
import { registerTheme, applyTheme } from './theme';
import { routeLink, type MainRepoConfig } from './link-routing';
import { parseNavTree, type NavNode, type DirEntry } from './nav-tree';

// ── Monaco worker configuration for extension CSP ──
// Monaco tries to load workers via blob: URLs, which extension CSP may block.
// Configure getWorkerUrl to use bundled worker as extension asset.
(self as any).MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    console.log(`[monaco-env] getWorker called: label=${_label}`);
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    );
  },
};

// ── Globals ──
let lfs: InstanceType<typeof LightningFS>;
let fsAdapter: LightningFsAdapter;
let editor: monaco.editor.IStandaloneCodeEditor;
let currentFilePath: string | null = null;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let mainRepoConfig: MainRepoConfig | undefined;

const AUTO_SAVE_DELAY = 1000; // 1 second debounce

// ── Expose for Playwright tests ──
declare global {
  interface Window {
    __editor: monaco.editor.IStandaloneCodeEditor;
    __lfs: InstanceType<typeof LightningFS>;
    __fs: LightningFsAdapter;
    __openFile: (path: string) => Promise<void>;
    __refreshNavTree: () => Promise<void>;
  }
}

async function main() {
  console.log('[side-panel] starting');

  // 1. LightningFS — single instance, store name 'nap-ext'
  lfs = new LightningFS('nap-ext');
  window.__lfs = lfs;
  console.log('[side-panel] LightningFS created (store: nap-ext)');

  // Create /home/user
  try { await lfs.promises.mkdir('/home'); } catch { /* exists */ }
  try { await lfs.promises.mkdir('/home/user'); } catch { /* exists */ }
  console.log('[side-panel] /home/user ready');

  // 2. fs adapter for just-bash
  fsAdapter = new LightningFsAdapter(lfs);
  window.__fs = fsAdapter;
  console.log('[side-panel] fs adapter created');

  // 3. Register Monaco theme + language BEFORE creating editor
  registerTheme();
  registerNapkinMarkdown();
  console.log('[side-panel] Monaco theme + language registered');

  // 4. Create Monaco editor
  const editorContainer = document.getElementById('editor-container')!;
  editor = monaco.editor.create(editorContainer, {
    language: 'napkin-markdown',
    theme: 'light-blue',
    wordWrap: 'on',
    minimap: { enabled: false },
    lineNumbers: 'off',
    scrollBeyondLastLine: false,
    fontSize: 14,
    fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
    automaticLayout: true,
    overviewRulerLanes: 0,
    renderLineHighlight: 'none',
    folding: false,
    glyphMargin: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
  });
  window.__editor = editor;
  console.log('[side-panel] Monaco editor created');

  // Shift-enter continuation
  registerShiftEnter(editor);
  console.log('[side-panel] shift-enter registered');

  // 5. Auto-save: editor changes -> debounced LFS write
  editor.onDidChangeModelContent(() => {
    if (!currentFilePath) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      if (!currentFilePath) return;
      const content = editor.getModel()?.getValue();
      if (content == null) return;
      console.log(`[auto-save] writing ${currentFilePath} (${content.length} chars)`);
      try {
        await lfs.promises.writeFile(currentFilePath, content, 'utf8');
        console.log(`[auto-save] done: ${currentFilePath}`);
      } catch (e) {
        console.error('[auto-save] failed:', e);
      }
    }, AUTO_SAVE_DELAY);
  });

  // 6. Apply theme (CSS variables on root)
  applyTheme();
  console.log('[side-panel] theme applied');

  // 7. Load auth config
  await loadMainRepoConfig();

  // 8. Git command with auth
  const gitCommand = createGitCommand(lfs, getAuth);
  console.log('[side-panel] git command created');

  // 9. Shell
  const shell = new BashShell({
    fs: fsAdapter,
    customCommands: [gitCommand],
    cwd: '/home/user',
    greeting: 'nap extension — browser bash + git over IndexedDB',
  });
  console.log('[side-panel] shell created');

  // 10. Terminal
  const termContainer = document.getElementById('terminal-container')!;
  const term = new WTerm(termContainer, { cols: 80, rows: 24, autoResize: true });
  await term.init();
  console.log('[side-panel] terminal initialized');

  // Wire I/O
  await shell.attach((data: string) => term.write(data));
  term.onData = (data: string) => shell.handleInput(data);
  console.log('[side-panel] shell attached');

  // 11. Tab bar
  setupTabBar();

  // 12. Nav tree
  window.__openFile = openFile;
  window.__refreshNavTree = refreshNavTree;

  // 13. Resize handle
  setupResizeHandle();

  // 14. Register link provider
  setupLinkProvider();

  console.log('[side-panel] ready');
}

// ── File operations ──

async function openFile(path: string) {
  console.log(`[open-file] ${path}`);
  try {
    const content = await lfs.promises.readFile(path, 'utf8') as string;
    console.log(`[open-file] read ${content.length} chars from ${path}`);

    currentFilePath = path;

    const model = editor.getModel();
    if (model) {
      model.setValue(content);
    } else {
      const newModel = monaco.editor.createModel(content, 'napkin-markdown');
      editor.setModel(newModel);
    }

    // Switch to editor tab
    switchTab('editor');
    console.log(`[open-file] done: ${path}`);
  } catch (e) {
    console.error(`[open-file] failed: ${path}`, e);
  }
}

// ── Tab bar ──

function setupTabBar() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab!;
      switchTab(tabName);
    });
  });
  console.log('[tab-bar] setup complete');
}

function switchTab(tabName: string) {
  console.log(`[tab-bar] switching to ${tabName}`);
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => t.classList.toggle('active', (t as HTMLElement).dataset.tab === tabName));

  const editorSurface = document.getElementById('editor-surface')!;
  const terminalSurface = document.getElementById('terminal-surface')!;

  if (tabName === 'editor') {
    editorSurface.classList.remove('hidden');
    terminalSurface.classList.add('hidden');
    editor.layout();
    // Refresh-on-focus: re-read file from LFS if modified externally
    if (currentFilePath) {
      lfs.promises.readFile(currentFilePath, 'utf8').then((content) => {
        const currentContent = editor.getModel()?.getValue();
        if (content !== currentContent) {
          console.log(`[refresh-on-focus] file changed externally, reloading ${currentFilePath}`);
          editor.getModel()?.setValue(content as string);
        }
      }).catch(() => {});
    }
  } else {
    editorSurface.classList.add('hidden');
    terminalSurface.classList.remove('hidden');
  }
}

// ── Nav tree rendering ──

async function refreshNavTree() {
  console.log('[nav-tree] refreshing');
  const navTreeEl = document.getElementById('nav-tree')!;
  const navEmpty = document.getElementById('nav-empty')!;

  // Find cloned repos in /home/user
  let repos: string[];
  try {
    repos = await lfs.promises.readdir('/home/user');
  } catch {
    repos = [];
  }
  console.log(`[nav-tree] repos in /home/user: ${repos.join(', ')}`);

  // For each repo, look for nepics dirs
  const allTrees: NavNode[] = [];

  for (const repo of repos) {
    const repoPath = `/home/user/${repo}`;
    try {
      const stat = await lfs.promises.stat(repoPath);
      if (!stat.isDirectory()) continue;
    } catch { continue; }

    // Look for .nap/nepics/ or nepics/ at root
    const nepicsPath = `${repoPath}/.nap/nepics`;
    const altNepicsPath = `${repoPath}/nepics`;
    // Also handle the case where the repo IS a .nap repo (nepics at root)
    const rootNepicsPath = `${repoPath}`;

    let targetPath: string | null = null;
    for (const candidate of [nepicsPath, altNepicsPath]) {
      try {
        const entries = await lfs.promises.readdir(candidate);
        if (entries.length > 0) {
          targetPath = candidate;
          break;
        }
      } catch { continue; }
    }

    // If no nepics subdir found, try to parse the repo root itself
    // (the cloned repo might BE a nepics-style structure)
    if (!targetPath) {
      try {
        const rootEntries = await lfs.promises.readdir(rootNepicsPath);
        const hasNapDirs = rootEntries.some(e =>
          e.startsWith('10-') || e.startsWith('15-') || e.startsWith('20-') || e.startsWith('30-')
        );
        if (hasNapDirs) {
          targetPath = rootNepicsPath;
        }
      } catch { continue; }
    }

    if (!targetPath) {
      // Try one more pattern: nepics/<nepic-name>/
      try {
        const rootEntries = await lfs.promises.readdir(repoPath);
        for (const entry of rootEntries) {
          const entryPath = `${repoPath}/${entry}`;
          try {
            const s = await lfs.promises.stat(entryPath);
            if (!s.isDirectory()) continue;
            const subEntries = await lfs.promises.readdir(entryPath);
            const hasNapDirs = subEntries.some(e =>
              e.startsWith('10-') || e.startsWith('15-') || e.startsWith('20-') || e.startsWith('30-')
            );
            if (hasNapDirs) {
              targetPath = entryPath;
              break;
            }
          } catch { continue; }
        }
      } catch { continue; }
    }

    if (!targetPath) continue;

    // If targetPath is a nepics dir, parse each nepic inside
    try {
      const entries = await lfs.promises.readdir(targetPath);
      const dirs = entries.filter(async (e) => {
        try {
          const s = await lfs.promises.stat(`${targetPath}/${e}`);
          return s.isDirectory();
        } catch { return false; }
      });

      // Check if targetPath itself has 20-architects, 30-napkins etc
      const hasNapDirs = entries.some(e =>
        e.startsWith('10-') || e.startsWith('15-') || e.startsWith('20-') || e.startsWith('30-')
      );

      if (hasNapDirs) {
        // targetPath is itself a nepic-level directory
        const tree = await parseNavTree(targetPath, readDirLfs, readJsonLfs);
        allTrees.push(...tree);
      } else {
        // targetPath is a nepics/ container — parse each subdirectory
        for (const entry of entries) {
          const nepicPath = `${targetPath}/${entry}`;
          try {
            const s = await lfs.promises.stat(nepicPath);
            if (!s.isDirectory()) continue;
            const tree = await parseNavTree(nepicPath, readDirLfs, readJsonLfs);
            allTrees.push(...tree);
          } catch { continue; }
        }
      }
    } catch (e) {
      console.log(`[nav-tree] failed to scan ${targetPath}:`, e);
    }
  }

  if (allTrees.length === 0) {
    navTreeEl.innerHTML = '';
    navEmpty.style.display = 'block';
    console.log('[nav-tree] empty');
    return;
  }

  navEmpty.style.display = 'none';
  navTreeEl.innerHTML = '';
  for (const node of allTrees) {
    navTreeEl.appendChild(renderNavNode(node));
  }
  console.log(`[nav-tree] rendered ${allTrees.length} sections`);
}

// LFS-backed callbacks for nav tree parser
async function readDirLfs(path: string): Promise<DirEntry[]> {
  const names = await lfs.promises.readdir(path);
  const entries: DirEntry[] = [];
  for (const name of names) {
    try {
      const s = await lfs.promises.stat(`${path}/${name}`);
      entries.push({ name, isDirectory: s.isDirectory() });
    } catch {
      entries.push({ name, isDirectory: false });
    }
  }
  return entries;
}

async function readJsonLfs(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await lfs.promises.readFile(path, 'utf8') as string;
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function renderNavNode(node: NavNode): HTMLElement {
  if (node.type === 'file') {
    const el = document.createElement('div');
    el.className = 'nav-file';
    el.textContent = node.displayName;
    el.addEventListener('click', () => {
      console.log(`[nav] click file: ${node.path}`);
      openFile(node.path);
    });
    return el;
  }

  const section = document.createElement('div');
  section.className = 'nav-section';

  // Header
  const header = document.createElement('div');
  if (node.type === 'section') {
    header.className = 'nav-section-header';
    header.textContent = node.displayName;
  } else {
    header.className = 'nav-entry expandable';
    if (node.expanded) header.classList.add('expanded');
    let label = node.displayName;
    if (node.status) label += ` `;
    header.innerHTML = label;
    if (node.status) {
      const statusSpan = document.createElement('span');
      statusSpan.className = 'status';
      statusSpan.textContent = node.status;
      header.appendChild(statusSpan);
    }
  }
  section.appendChild(header);

  // Children
  if (node.children && node.children.length > 0) {
    const childContainer = document.createElement('div');
    childContainer.className = 'nav-children' + (node.expanded ? '' : ' collapsed');

    for (const child of node.children) {
      childContainer.appendChild(renderNavNode(child));
    }
    section.appendChild(childContainer);

    // Toggle expand/collapse
    header.addEventListener('click', () => {
      const isExpanded = header.classList.toggle('expanded');
      childContainer.classList.toggle('collapsed', !isExpanded);
    });
  }

  return section;
}

// ── Resize handle ──

function setupResizeHandle() {
  const handle = document.getElementById('resize-handle')!;
  const nav = document.getElementById('nav')!;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startWidth = nav.offsetWidth;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });

  function onMouseMove(e: MouseEvent) {
    const diff = e.clientX - startX;
    nav.style.width = Math.max(120, Math.min(600, startWidth + diff)) + 'px';
    editor.layout();
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  console.log('[resize] handle setup');
}

// ── Link provider ──

function setupLinkProvider() {
  monaco.languages.registerLinkProvider('napkin-markdown', {
    provideLinks(model) {
      const links: monaco.languages.ILink[] = [];
      const lineCount = model.getLineCount();

      for (let i = 1; i <= lineCount; i++) {
        const lineContent = model.getLineContent(i);

        // Match markdown links: [text](href)
        const mdLinkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = mdLinkRe.exec(lineContent)) !== null) {
          const href = match[2];
          const startCol = match.index + match[1].length + 3; // after [text](
          const endCol = startCol + href.length;
          links.push({
            range: new monaco.Range(i, startCol, i, endCol),
            url: href,
          });
        }

        // Match bare URLs: https://...
        const urlRe = /https?:\/\/[^\s)]+/g;
        while ((match = urlRe.exec(lineContent)) !== null) {
          // Skip if this URL is already inside a markdown link
          const beforeUrl = lineContent.slice(0, match.index);
          if (beforeUrl.endsWith('](')) continue;

          links.push({
            range: new monaco.Range(i, match.index + 1, i, match.index + 1 + match[0].length),
            url: match[0],
          });
        }
      }

      return { links };
    },
    resolveLink(link) {
      if (!link.url || typeof link.url !== 'string') return link;

      const href = link.url;
      const result = routeLink(
        { href, sourceFilePath: currentFilePath ?? '' },
        mainRepoConfig,
      );

      if (result.action === 'openDoc') {
        // Open .md in editor
        link.url = undefined as any;
        openFile(result.path);
      } else if (result.action === 'openCode') {
        // Open GitHub URL
        link.url = result.githubUrl;
      } else if (result.action === 'openExternal') {
        link.url = result.url;
      }

      return link;
    },
  });
  console.log('[links] provider registered');
}

// ── Auth ──

async function getAuth(): Promise<{ username: string; password: string } | undefined> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(undefined);
      return;
    }
    chrome.storage.sync.get(['pat'], (result) => {
      if (result.pat) {
        resolve({ username: 'x-access-token', password: result.pat });
      } else {
        resolve(undefined);
      }
    });
  });
}

async function loadMainRepoConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  return new Promise<void>((resolve) => {
    chrome.storage.sync.get(['mainRepo', 'mainBranch'], (result) => {
      if (result.mainRepo) {
        const [owner, repo] = result.mainRepo.split('/');
        if (owner && repo) {
          mainRepoConfig = { owner, repo, branch: result.mainBranch || 'main' };
          console.log(`[auth] main repo: ${owner}/${repo} branch=${mainRepoConfig.branch}`);
        }
      }
      resolve();
    });
  });
}

main().catch(console.error);
