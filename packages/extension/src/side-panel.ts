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
    __setMainRepoConfig: (config: MainRepoConfig) => void;
    __triggerLink: (href: string) => void;
    __monaco: typeof monaco;
    __lastNavigatedUrl: string | null;
  }
}

async function main() {
  console.log('[side-panel] starting — build 2026-05-17T18:40');

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

  // Intercept Cmd+click via Monaco's own mouse event system.
  // This is the same approach v3 uses (editor.onMouseDown + MouseTargetType.CONTENT_TEXT).
  // Monaco's internal link handling doesn't work in extension side panel context,
  // so we handle Cmd+click ourselves using Monaco's resolved position.
  editor.onMouseDown((e) => {
    const isMeta = e.event.metaKey || e.event.ctrlKey;
    console.log(`[editor-mouse] type=${e.target.type} meta=${isMeta}`);
    if (!isMeta) return;
    if (e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) return;

    const position = e.target.position;
    if (!position) return;

    const model = editor.getModel();
    if (!model) return;

    const lineContent = model.getLineContent(position.lineNumber);
    const col = position.column;
    console.log(`[editor-mouse] line ${position.lineNumber} col ${col}: "${lineContent.slice(0, 80)}"`);

    const href = findLinkAtPosition(lineContent, col);
    console.log(`[editor-mouse] link at position: ${href}`);
    if (href) {
      e.event.preventDefault();
      activateLink(href);
    }
  });
  console.log('[editor-mouse] Cmd+click listener installed');

  // Also intercept window.open — Monaco's default opener may use it
  const originalWindowOpen = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string) => {
    const urlStr = url?.toString() ?? '';
    console.log(`[window.open] intercepted: ${urlStr} target=${target}`);
    if (urlStr && !urlStr.startsWith('blob:') && !urlStr.startsWith('data:')) {
      activateLink(urlStr);
      return null;
    }
    return originalWindowOpen(url, target, features);
  };
  console.log('[window.open] interceptor installed');

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

  // 15. Settings UI
  setupSettings();

  // 15. Test hooks
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

// ── Link handling ──

function setupLinkProvider() {
  // Register link provider for visual decoration (underlines on hover)
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
          const startCol = match.index + match[1].length + 3;
          const endCol = startCol + href.length;
          links.push({
            range: new monaco.Range(i, startCol, i, endCol),
            url: href,
          });
        }

        // Match bare URLs: https://...
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
      if (!link.url || typeof link.url !== 'string') {
        console.log('[resolveLink] no url, skipping');
        return link;
      }
      const href = link.url;
      console.log(`[resolveLink] resolving: ${href}`);

      const result = routeLink(
        { href, sourceFilePath: currentFilePath ?? '' },
        mainRepoConfig,
      );
      console.log(`[resolveLink] routed: action=${result.action}`);

      if (result.action === 'openDoc') {
        console.log(`[resolveLink] openDoc: ${result.path}`);
        link.url = undefined as any; // prevent Monaco from opening
        openFile(result.path);
      } else if (result.action === 'openCode') {
        console.log(`[resolveLink] openCode: ${result.githubUrl}`);
        link.url = undefined as any; // prevent Monaco from opening
        navigateGitHubTab(result.githubUrl);
      } else if (result.action === 'openExternal') {
        console.log(`[resolveLink] openExternal: ${result.url}`);
        // leave link.url — Monaco opens it in new tab
      }
      return link;
    },
  });

  // Register the "open link" action that Monaco calls on Cmd+click
  // This replaces the broken resolveLink approach
  editor.addAction({
    id: 'nap-open-link',
    label: 'Open Link',
    keybindings: [],
    precondition: undefined,
    run(ed) {
      const position = ed.getPosition();
      if (!position) return;
      const model = ed.getModel();
      if (!model) return;

      const lineContent = model.getLineContent(position.lineNumber);
      const href = findLinkAtPosition(lineContent, position.column);
      if (!href) {
        console.log('[link-action] no link found at cursor position');
        return;
      }

      console.log(`[link-action] activating link: ${href}`);
      activateLink(href);
    },
  });

  // Override Monaco's built-in openLink action to use our routing
  // Monaco's Cmd+click calls 'editor.action.openLink' internally
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
      if (!href) {
        console.log('[link-action] no link at cursor');
        return;
      }

      console.log(`[link-action] openLink override: ${href}`);
      activateLink(href);
    },
  });

  console.log('[links] provider + action registered');
}

/** Find the href of a markdown link [text](href) or bare URL at a column position. */
function findLinkAtPosition(lineContent: string, column: number): string | null {
  // Check markdown links [text](href)
  const mdLinkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdLinkRe.exec(lineContent)) !== null) {
    const fullStart = match.index + 1; // 1-indexed
    const fullEnd = fullStart + match[0].length;
    if (column >= fullStart && column <= fullEnd) {
      return match[2]; // the href
    }
  }

  // Check bare URLs
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

/** Route and activate a link href. */
function activateLink(href: string) {
  const result = routeLink(
    { href, sourceFilePath: currentFilePath ?? '' },
    mainRepoConfig,
  );
  console.log(`[link-action] routed: ${result.action}`);

  if (result.action === 'openDoc') {
    openFile(result.path);
  } else if (result.action === 'openCode') {
    if (!mainRepoConfig) {
      showNotification(
        'Set your main code repo in <a id="notification-settings-link">settings</a> to enable code links.'
      );
      // Wire the settings link
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

  // Load current values
  if (mainRepoConfig) {
    repoInput.value = `${mainRepoConfig.owner}/${mainRepoConfig.repo}`;
    branchInput.value = mainRepoConfig.branch;
  }

  btn.addEventListener('click', () => {
    console.log('[settings] opening');
    overlay.classList.add('visible');
    // Reload from storage
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

    console.log(`[settings] saving: repo=${repoStr} branch=${branch} pat=${pat ? '***' : 'none'}`);

    // Set in-memory config
    if (repoStr.includes('/')) {
      const [owner, repo] = repoStr.split('/');
      if (owner && repo) {
        mainRepoConfig = { owner, repo, branch };
        console.log(`[settings] mainRepoConfig set: ${owner}/${repo}@${branch}`);
      }
    }

    // Persist to chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ mainRepo: repoStr, mainBranch: branch, pat });
    }

    // Hide notification if it was showing
    hideNotification();

    overlay.classList.remove('visible');
    console.log('[settings] saved and closed');
  });

  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
    console.log('[settings] closed without saving');
  });

  console.log('[settings] setup complete');
}

// ── Notification ──

function showNotification(message: string) {
  const el = document.getElementById('notification')!;
  el.innerHTML = message;
  el.classList.add('visible');
  console.log(`[notification] ${message}`);
}

function hideNotification() {
  const el = document.getElementById('notification')!;
  el.classList.remove('visible');
}

// ── GitHub tab navigation (reuses active tab) ──

async function navigateGitHubTab(url: string) {
  console.log(`[navigate] ${url}`);
  window.__lastNavigatedUrl = url;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { url });
      console.log(`[navigate] tab ${tab.id} updated to ${url}`);
    }
  } catch (e) {
    console.log(`[navigate] chrome.tabs not available, falling back to window.open`);
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
          console.log(`[auth] main repo: ${owner}/${repo} branch=${mainRepoConfig.branch}`);
        }
      }
      resolve();
    });
  });
}

main().catch(console.error);
