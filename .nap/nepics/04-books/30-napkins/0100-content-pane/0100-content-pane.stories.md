# 0100 — stories

## Story 1: Open a napkin file from the sidebar

The person launches nap.app. The sidebar shows napkins and architects as usual. Both content panes show placeholders ("no file open" / "no agent selected").

They click on `0100-content-pane.nap.md` in the sidebar's file tree. The left pane loads the file in Monaco with napkin-markdown styling. Headings are bold and bright. Bullet markers `*` are dimmed. `//A:` comments appear in blue. The right pane still shows its placeholder — no agent was clicked.

They click on a different file — `0100-content-pane.spec.md`. The left pane replaces the napkin with the spec. No tab accumulates. Just the new file.

**Components:** Sidebar (FileRow click handler) → routing-rules.ts → store.openFile() → ContentPane (Monaco).

## Story 2: Switch between file and terminal

The person has a napkin open in the left pane. They click an agent dot in the sidebar. The right pane shows that agent's terminal — xterm, scrollback, the full session. The left pane is unaffected.

They click a different agent dot. The right pane switches terminals. The left pane stays on the napkin.

They click another file in the sidebar. The left pane switches to that file. The right pane stays on the terminal.

The two panes are independent. Changing one never changes the other.

**Components:** Sidebar (AgentDot click, FileRow click) → routing-rules.ts → store → ContentPane + TerminalPane.

## Story 3: Resize the layout

The person sees three columns. They drag the handle between left and right content panes to give more room to the terminal. The Monaco editor reflows (word wrap adjusts). The xterm refits (cols/rows update, pty gets resize signal).

They drag the handle between nav and left content to make the sidebar narrower. Both content panes adjust.

Min widths prevent any pane from being dragged to zero.

**Components:** Layout container with drag handles → ResizeObserver on both panes.

## Story 4: Agent edits a file that's open in the left pane

The person has `0100-content-pane.nap.md` open in the left pane. An agent is running in the right pane. The agent edits the napkin file (adds `//A:` responses).

Within ~200ms, the left pane updates. The new `//A:` lines appear with blue prefix coloring. The person's scroll position is preserved (or close to it). They can continue reading.

**Components:** Main process file watcher → IPC to renderer → Monaco model update.

## Story 5: Edit a napkin directly in the left pane

The person types `// this is interesting` into the napkin file in the left pane. After 1 second of no typing, the file auto-saves to disk. The model's file watcher sees the change but doesn't re-read (write-echo suppression or the content pane owns the file while editing).

**Components:** Monaco onChange → debounced write to disk via IPC → main process fs.writeFile.

## Story 6: Empty state on launch

The person opens nap.app. No file has been clicked, no agent is running. Both panes show centered placeholder text in muted color. The sidebar shows the entity tree as usual.

They can start by clicking anything — a file or an agent. The appropriate pane activates.

**Components:** ContentPane (empty state) + TerminalPane (empty state).

## Story 7: Napkin-markdown syntax highlighting

The person opens a napkin. They see:

- `# heading` → bold, brighter white
- `* bullet text` → the `*` is dimmed gray, text is normal
- `**bold text**` → bold, the `**` markers are visible but dimmed
- `` `inline code` `` → slight background tint
- `// a comment` → muted gray-blue, entire rest of line
- `//A: architect says` → blue prefix, rest of line inherits blue
- `//DU: user says` → green prefix, rest of line inherits green
- `//FS: engineer says` → green prefix (matching fs-eng role color)

All of this with monospace font, word wrap, no line numbers, dark background matching the app.

**Components:** Monarch tokenizer (napkin-markdown language) + theme token colors.
