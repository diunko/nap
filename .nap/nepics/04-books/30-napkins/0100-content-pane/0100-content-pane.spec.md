# 0100 — spec

## What

Replace the current two-column layout (nav + terminal) with a three-column layout (nav + left content + right content). Left pane displays .nap files in a Monaco editor. Right pane displays agent terminals in xterm. Both panes are always visible.

## Why

Today, clicking a file in the sidebar opens it in the OS editor (shell.openPath). There's no in-app reading surface for napkins, chapters, or specs. The terminal fills the entire main area. This napkin adds the reading/editing surface alongside the terminal.

## Constraints

### Layout

- Three columns: nav (existing Sidebar) | left content pane | right content pane.
- Both content panes are always visible. Empty pane shows a centered placeholder (e.g., "no file open" / "no agent selected").
- Resize handles between nav↔left and left↔right. Drag to resize. Min widths to prevent collapse.
- The existing Sidebar component is unchanged structurally — only the click handlers change (routing).

### Routing rules

- New file: `src/renderer/routing-rules.ts`.
- Exports a pure function that takes click context (file path, click source, agent info) and returns `{ pane: 'left' | 'right', surface: 'monaco' | 'terminal' }`.
- Rules:
  - File inside `.nap/` → left pane, Monaco.
  - Agent (has `id`, `started` flag) → right pane, terminal.
  - Fallback → right pane.
- This file exists to be easy to modify later. Keep it simple — a sequence of if/else, no abstractions.

### Left content pane (Monaco)

- Ephemeral: one file at a time. Opening a new file replaces the previous one. No tab bar.
- Monaco editor instance with a custom monarch tokenizer registered as language `napkin-markdown`.
- Tokenizer rules:
  - `# heading` → token `heading` (bold, bright).
  - `* ` at line start (with any leading whitespace) → `*` gets token `bullet.marker` (dimmed), rest is default.
  - `**text**` → token `bold` (bold), markers `**` get `bold.marker` (dimmed).
  - `` `text` `` → token `inline-code` (background tint).
  - `//` at any position → token `comment` (muted gray-blue) for rest of line.
  - `//A:` → token `comment.architect` (blue, matching ROLE_COLORS['architect'] from dot-style.ts).
  - `//DU:` → token `comment.user` (green).
  - `//FS:` → token `comment.fs-eng` (green, matching ROLE_COLORS['fs-eng']).
  - `//TA:` → token `comment.test-arch` (orange, matching ROLE_COLORS['test-arch']).
  - `//TE:` → token `comment.test-eng` (gray, matching ROLE_COLORS['test-eng']).
  - Prefix token is colored, rest of line inherits that color.
- Editor config: `wordWrap: 'on'`, `minimap: { enabled: false }`, `lineNumbers: 'off'`, `quickSuggestions: false`, `suggestOnTriggerCharacters: false`, `fontSize: 14`, `fontFamily` matching terminal (Menlo, Monaco, Consolas), `theme` matching app background (`#1e1e1e`).
- Read-write. Auto-save on change (write to disk after 1s debounce of edits).
- File watching: when the file on disk changes externally (agent edit), update the Monaco model. Debounce 200ms. Use existing file watcher infrastructure if possible, or add per-file fs.watch in main process with IPC to renderer.

### Right content pane (terminal)

- The existing Terminal.tsx component, relocated to the right pane.
- Same xterm instance management, same pty wiring, same resize observer, same keyboard dispatch.
- All existing features preserved: scrollback, follow mode (Cmd+G), file link provider, permission modal overlay, successor prompt for archived agents.
- Ephemeral: one terminal at a time (same as today).
- The breadcrumb header stays.

### Nav (sidebar) changes

- File entry click (`FileRow` component): instead of `window.electronAPI.openFilePath(file.absPath)`, route through routing rules → open in left pane.
- Agent dot click (`AgentDot` component): route through routing rules → open terminal in right pane. (Functionally the same as today but using the routing function.)
- The `[terminal]` entry in extended view: still switches to terminal in right pane.
- Copy and open-external controls on file entries remain (they bypass routing — direct clipboard/OS actions).

### Store changes

- New state: `activeFilePath: string | null` — the file currently open in left pane.
- New action: `openFile(path: string)` — sets activeFilePath, triggers Monaco to load.
- `activeTerminalId` continues to control right pane terminal.
- Both are independent — changing one doesn't affect the other.

### What doesn't change

- Sidebar structure, card types (NapkinCard, ArchitectCard), kanban overlay, gutter, debug panel.
- Agent lifecycle, pty spawning, socket protocol, model.ts, socket-handler.ts, coordinators.ts.
- The .nap filesystem structure, marker files, file watcher for model state.
- CLI commands.

## Hard parts

- Monaco bundle: ~5MB, needs web workers. electron-vite must be configured to handle Monaco's worker files (editor, language services). This is the main build integration challenge.
- Monarch tokenizer: the // prefix rules need to match at any indent level within a bullet line. The tokenizer is declarative regex — straightforward but needs careful state management for multi-line constructs.
- File watching for content: the existing model watcher watches directories for structural changes (new agents, status changes). Content-level file watching (this specific file changed) is new — needs a separate mechanism or IPC channel.
