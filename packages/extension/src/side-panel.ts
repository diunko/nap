/**
 * Side panel entry point — orchestration layer.
 * Wires Monaco, terminal, nav renderer, tab manager, link routing.
 *
 * Modules:
 * - nav-tree.ts — pure parser (data)
 * - nav-renderer.ts — card system DOM rendering
 * - tab-manager.ts — ephemeral/permanent tab lifecycle
 * - dot-style.ts — agent dot styling
 * - theme.ts — Monaco theme + CSS variables
 * - link-routing.ts — link classification + GitHub URL builder
 * - napkin-markdown.ts — tokenizer + shift-enter
 * - fs-adapter.ts — LightningFS → IFileSystem
 * - git-command.ts — isomorphic-git custom command
 * - shell.ts — BashShell
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
import { NavRenderer } from './nav-renderer';
import { TabManager, type Tab } from './tab-manager';

// ── Monaco worker configuration for extension CSP ──
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
let tabManager: TabManager;
let navRenderer: NavRenderer;
let isLoadingFile = false;

const AUTO_SAVE_DELAY = 1000;

// ── Expose for Playwright tests ──
declare global {
  interface Window {
    __editor: monaco.editor.IStandaloneCodeEditor;
    __lfs: InstanceType<typeof LightningFS>;
    __fs: LightningFsAdapter;
    __openFile: (path: string) => Promise<void>;
    __refreshNavTree: () => Promise<void>;
    __setMainRepoConfig: (config: MainRepoConfig) => void;
    __triggerLink: (href: string) => void;
    __monaco: typeof monaco;
    __lastNavigatedUrl: string | null;
  }
}

async function main() {
  console.log('[side-panel] starting — build 2026-05-19T00:00');

  // 1. LightningFS
  lfs = new LightningFS('nap-ext');
  window.__lfs = lfs;
  console.log('[side-panel] LightningFS created (store: nap-ext)');

  try { await lfs.promises.mkdir('/home'); } catch { /* exists */ }
  try { await lfs.promises.mkdir('/home/user'); } catch { /* exists */ }
  console.log('[side-panel] /home/user ready');

  // 2. FS adapter
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

  // Cmd+click via Monaco's mouse event system
  editor.onMouseDown((e) => {
    const isMeta = e.event.metaKey || e.event.ctrlKey;
    if (!isMeta) return;
    if (e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) return;

    const position = e.target.position;
    if (!position) return;
    const model = editor.getModel();
    if (!model) return;

    const lineContent = model.getLineContent(position.lineNumber);
    const href = findLinkAtPosition(lineContent, position.column);
    if (href) {
      e.event.preventDefault();
      activateLink(href);
    }
  });

  // Intercept window.open
  const originalWindowOpen = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string) => {
    const urlStr = url?.toString() ?? '';
    if (urlStr && !urlStr.startsWith('blob:') && !urlStr.startsWith('data:')) {
      activateLink(urlStr);
      return null;
    }
    return originalWindowOpen(url, target, features);
  };

  // Shift-enter continuation
  registerShiftEnter(editor);

  // 5. Auto-save: editor changes → debounced LFS write + pin ephemeral tab
  editor.onDidChangeModelContent(() => {
    if (!currentFilePath) return;
    if (isLoadingFile) return;

    // Pin ephemeral tab on first edit
    tabManager.pinActiveEphemeral();

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

  // 9. Shell — with onCommandComplete to auto-refresh nav tree after git commands
  const shell = new BashShell({
    fs: fsAdapter,
    customCommands: [gitCommand],
    cwd: '/home/user',
    greeting: 'nap extension — browser bash + git over IndexedDB',
    onCommandComplete: (cmd: string) => {
      const trimmed = cmd.trim();
      if (trimmed.startsWith('git clone') || trimmed.startsWith('git pull') || trimmed.startsWith('git checkout')) {
        console.log(`[shell] git command completed, refreshing nav tree: ${trimmed.slice(0, 40)}`);
        refreshNavTree();
      }
    },
  });

  // 10. Terminal
  const termContainer = document.getElementById('terminal-container')!;
  const term = new WTerm(termContainer, { cols: 80, rows: 24, autoResize: true });
  await term.init();
  console.log('[side-panel] terminal initialized');

  await shell.attach((data: string) => term.write(data));
  term.onData = (data: string) => shell.handleInput(data);

  // 11. Tab manager
  const tabBarEl = document.getElementById('tab-bar')!;
  tabManager = new TabManager(tabBarEl, {
    onActivate: (tab: Tab) => {
      if (tab.type === 'terminal') {
        switchToTerminal();
      } else {
        // Only switch surface — file loading is handled by the caller
        switchToEditor();
      }
    },
    onClose: (_tab: Tab) => {
      // If active tab was closed, TabManager already activated a neighbor
    },
  });

  // 12. Nav renderer
  const navTreeEl = document.getElementById('nav-tree')!;
  navRenderer = new NavRenderer(navTreeEl, {
    onFileClick: async (path: string, _fileName: string) => {
      // openFile handles both content loading and tab management
      await openFile(path);
    },
    onTerminalClick: () => {
      tabManager.activateTerminal();
    },
  });

  // 13. Resize handle
  setupResizeHandle();

  // 14. Link provider
  setupLinkProvider();

  // 15. Settings UI
  setupSettings();

  // 16. Header buttons
  setupHeader();

  // 17. Test hooks
  window.__openFile = openFile;
  window.__refreshNavTree = refreshNavTree;
  window.__monaco = monaco;
  window.__lastNavigatedUrl = null;
  window.__setMainRepoConfig = (config: MainRepoConfig) => {
    mainRepoConfig = config;
    console.log(`[test-hook] mainRepoConfig set: ${config.owner}/${config.repo}@${config.branch}`);
  };
  window.__triggerLink = (href: string) => {
    console.log(`[test-hook] triggerLink: ${href}`);
    const result = routeLink(
      { href, sourceFilePath: currentFilePath ?? '' },
      mainRepoConfig,
    );
    if (result.action === 'openDoc') {
      openFile(result.path);
    } else if (result.action === 'openCode') {
      navigateGitHubTab(result.githubUrl);
    } else if (result.action === 'openExternal') {
      navigateGitHubTab(result.url);
    }
  };

  console.log('[side-panel] ready');
}

// ── File operations ──

async function openFile(path: string) {
  console.log(`[open-file] ${path}`);
  try {
    const content = await lfs.promises.readFile(path, 'utf8') as string;
    console.log(`[open-file] read ${content.length} chars from ${path}`);

    currentFilePath = path;
    if (navRenderer) navRenderer.setActiveFile(path);

    isLoadingFile = true;
    const model = editor.getModel();
    if (model) {
      model.setValue(content);
    } else {
      const newModel = monaco.editor.createModel(content, 'napkin-markdown');
      editor.setModel(newModel);
    }
    isLoadingFile = false;

    // Create/update tab for this file
    const fileName = path.split('/').pop() ?? path;
    if (tabManager) tabManager.openEphemeral(path, fileName);

    // Switch to editor
    switchToEditor();
    console.log(`[open-file] done: ${path}`);
  } catch (e) {
    console.error(`[open-file] failed: ${path}`, e);
  }
}

// ── Surface switching ──

function switchToEditor() {
  const editorSurface = document.getElementById('editor-surface')!;
  const terminalSurface = document.getElementById('terminal-surface')!;
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
}

function switchToTerminal() {
  const editorSurface = document.getElementById('editor-surface')!;
  const terminalSurface = document.getElementById('terminal-surface')!;
  editorSurface.classList.add('hidden');
  terminalSurface.classList.remove('hidden');
}

// ── Nav tree ──

async function refreshNavTree() {
  console.log('[nav-tree] refreshing');
  const navEmpty = document.getElementById('nav-empty')!;

  let repos: string[];
  try {
    repos = await lfs.promises.readdir('/home/user');
  } catch {
    repos = [];
  }
  console.log(`[nav-tree] repos in /home/user: ${repos.join(', ')}`);

  const allTrees: NavNode[] = [];
  const jsonCache = new Map<string, Record<string, unknown>>();

  for (const repo of repos) {
    const repoPath = `/home/user/${repo}`;
    try {
      const stat = await lfs.promises.stat(repoPath);
      if (!stat.isDirectory()) continue;
    } catch { continue; }

    // Look for .nap/nepics/ or nepics/ or nap-style structure
    const candidates = [
      `${repoPath}/.nap/nepics`,
      `${repoPath}/nepics`,
    ];

    let targetPath: string | null = null;
    for (const candidate of candidates) {
      try {
        const entries = await lfs.promises.readdir(candidate);
        if (entries.length > 0) {
          targetPath = candidate;
          break;
        }
      } catch { continue; }
    }

    // If no nepics subdir, check if repo root has nap-style dirs
    if (!targetPath) {
      try {
        const rootEntries = await lfs.promises.readdir(repoPath);
        const hasNapDirs = rootEntries.some(e =>
          e.startsWith('10-') || e.startsWith('15-') || e.startsWith('20-') || e.startsWith('30-')
        );
        if (hasNapDirs) {
          targetPath = repoPath;
        }
      } catch { continue; }
    }

    // Try one more: scan for subdirs with nap-style content
    if (!targetPath) {
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

    try {
      const entries = await lfs.promises.readdir(targetPath);
      const hasNapDirs = entries.some(e =>
        e.startsWith('10-') || e.startsWith('15-') || e.startsWith('20-') || e.startsWith('30-')
      );

      if (hasNapDirs) {
        const tree = await parseNavTree(targetPath, readDirLfs, readJsonLfsCached(jsonCache));
        allTrees.push(...tree);
      } else {
        // Container of nepics
        for (const entry of entries) {
          const nepicPath = `${targetPath}/${entry}`;
          try {
            const s = await lfs.promises.stat(nepicPath);
            if (!s.isDirectory()) continue;
            const tree = await parseNavTree(nepicPath, readDirLfs, readJsonLfsCached(jsonCache));
            allTrees.push(...tree);
          } catch { continue; }
        }
      }
    } catch (e) {
      console.log(`[nav-tree] failed to scan ${targetPath}:`, e);
    }
  }

  if (allTrees.length === 0) {
    navRenderer.renderWithCache([]);
    navEmpty.style.display = 'block';
    console.log('[nav-tree] empty');
    return;
  }

  navEmpty.style.display = 'none';
  navRenderer.setJsonCache(jsonCache);
  navRenderer.renderWithCache(allTrees);

  // Update header napkin name
  const napkins = allTrees.find(s => s.name.startsWith('30-napkins'));
  if (napkins?.children?.[0]) {
    const headerName = document.getElementById('header-napkin-name');
    if (headerName) headerName.textContent = napkins.children[0].name;
  }

  console.log(`[nav-tree] rendered ${allTrees.length} sections`);
}

// ── LFS callbacks for nav tree parser ──

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

function readJsonLfsCached(cache: Map<string, Record<string, unknown>>) {
  return async (path: string): Promise<Record<string, unknown> | undefined> => {
    try {
      const content = await lfs.promises.readFile(path, 'utf8') as string;
      const parsed = JSON.parse(content);
      cache.set(path, parsed);
      return parsed;
    } catch {
      return undefined;
    }
  };
}

// ── Resize handle ──

function setupResizeHandle() {
  const nav = document.getElementById('nav')!;
  const handle = document.getElementById('nav-drag')!;
  let dragging = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = nav.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev: MouseEvent) {
      if (!dragging) return;
      // Nav is on the right, so moving left = wider
      const delta = startX - ev.clientX;
      nav.style.width = Math.max(180, Math.min(600, startW + delta)) + 'px';
      editor.layout();
    }
    function onUp() {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  console.log('[resize] handle setup');
}

// ── Header buttons ──

function setupHeader() {
  document.getElementById('nav-toggle')!.addEventListener('click', () => {
    document.getElementById('nav')!.classList.toggle('collapsed');
  });

  document.getElementById('fetch-btn')!.addEventListener('click', () => {
    console.log('[header] fetch latest');
    // TODO: implement git fetch + checkout origin/main
  });
}

// ── Link handling ──

function setupLinkProvider() {
  monaco.languages.registerLinkProvider('napkin-markdown', {
    provideLinks(model) {
      const links: monaco.languages.ILink[] = [];
      const lineCount = model.getLineCount();

      for (let i = 1; i <= lineCount; i++) {
        const lineContent = model.getLineContent(i);

        const mdLinkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = mdLinkRe.exec(lineContent)) !== null) {
          const href = match[2];
          const startCol = match.index + match[1].length + 3;
          const endCol = startCol + href.length;
          links.push({
            range: new monaco.Range(i, startCol, i, endCol),
            url: href,
          });
        }

        const urlRe = /https?:\/\/[^\s)]+/g;
        while ((match = urlRe.exec(lineContent)) !== null) {
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
        link.url = undefined as any;
        openFile(result.path);
      } else if (result.action === 'openCode') {
        link.url = undefined as any;
        navigateGitHubTab(result.githubUrl);
      }
      return link;
    },
  });

  // Override Monaco's openLink action
  editor.addAction({
    id: 'editor.action.openLink',
    label: 'Open Link (nap override)',
    keybindings: [],
    precondition: undefined,
    run(ed) {
      const position = ed.getPosition();
      if (!position) return;
      const model = ed.getModel();
      if (!model) return;

      const lineContent = model.getLineContent(position.lineNumber);
      const href = findLinkAtPosition(lineContent, position.column);
      if (href) activateLink(href);
    },
  });

  console.log('[links] provider + action registered');
}

function findLinkAtPosition(lineContent: string, column: number): string | null {
  const mdLinkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdLinkRe.exec(lineContent)) !== null) {
    const fullStart = match.index + 1;
    const fullEnd = fullStart + match[0].length;
    if (column >= fullStart && column <= fullEnd) {
      return match[2];
    }
  }

  const urlRe = /https?:\/\/[^\s)]+/g;
  while ((match = urlRe.exec(lineContent)) !== null) {
    const start = match.index + 1;
    const end = start + match[0].length;
    if (column >= start && column <= end) {
      return match[0];
    }
  }

  return null;
}

function activateLink(href: string) {
  const result = routeLink(
    { href, sourceFilePath: currentFilePath ?? '' },
    mainRepoConfig,
  );

  if (result.action === 'openDoc') {
    openFile(result.path);
  } else if (result.action === 'openCode') {
    if (!mainRepoConfig) {
      showNotification(
        'Set your main code repo in <a id="notification-settings-link">settings</a> to enable code links.'
      );
      setTimeout(() => {
        const link = document.getElementById('notification-settings-link');
        if (link) link.addEventListener('click', () => {
          document.getElementById('settings-overlay')!.classList.add('visible');
          hideNotification();
        });
      }, 0);
      return;
    }
    navigateGitHubTab(result.githubUrl);
  } else if (result.action === 'openExternal') {
    navigateGitHubTab(result.url);
  }
}

// ── Settings UI ──

function setupSettings() {
  const btn = document.getElementById('settings-btn')!;
  const overlay = document.getElementById('settings-overlay')!;
  const repoInput = document.getElementById('main-repo-input') as HTMLInputElement;
  const branchInput = document.getElementById('main-branch-input') as HTMLInputElement;
  const patInput = document.getElementById('pat-input') as HTMLInputElement;
  const saveBtn = document.getElementById('settings-save')!;
  const closeBtn = document.getElementById('settings-close')!;

  if (mainRepoConfig) {
    repoInput.value = `${mainRepoConfig.owner}/${mainRepoConfig.repo}`;
    branchInput.value = mainRepoConfig.branch;
  }

  btn.addEventListener('click', () => {
    overlay.classList.add('visible');
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['mainRepo', 'mainBranch', 'pat'], (result) => {
        if (result.mainRepo) repoInput.value = result.mainRepo;
        if (result.mainBranch) branchInput.value = result.mainBranch;
        if (result.pat) patInput.value = result.pat;
      });
    }
  });

  saveBtn.addEventListener('click', () => {
    const repoStr = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';
    const pat = patInput.value.trim();

    if (repoStr.includes('/')) {
      const [owner, repo] = repoStr.split('/');
      if (owner && repo) {
        mainRepoConfig = { owner, repo, branch };
      }
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ mainRepo: repoStr, mainBranch: branch, pat });
    }

    hideNotification();
    overlay.classList.remove('visible');
  });

  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
  });
}

// ── Notification ──

function showNotification(message: string) {
  const el = document.getElementById('notification')!;
  el.innerHTML = message;
  el.classList.add('visible');
}

function hideNotification() {
  const el = document.getElementById('notification')!;
  el.classList.remove('visible');
}

// ── GitHub tab navigation ──

async function navigateGitHubTab(url: string) {
  console.log(`[navigate] ${url}`);
  window.__lastNavigatedUrl = url;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { url });
    }
  } catch {
    window.open(url, '_blank');
  }
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
        }
      }
      resolve();
    });
  });
}

main().catch(console.error);
