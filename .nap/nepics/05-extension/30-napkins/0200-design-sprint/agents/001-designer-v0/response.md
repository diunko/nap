# designer response — extension mocks

## what was delivered

### take 1 (mock-a through mock-d)

4 mocks exploring layout variations. All fell short — they invented from scratch instead of adapting the existing app design language. Key failures:
- Nav tree lacked agent dots replacing `*` — the key visual innovation
- Agents shown under `agents/` subdirectory (wrong — app flattens them)
- Generous spacing wasted the tight pixel budget
- Mock D put nav on the left (Chrome forces right)
- No ephemeral/permanent tab distinction
- Overall: worse than what the app already has

### take 2 (mock-e)

One mock, faithful port of the app's nav+map to the extension context. Written after reading Sidebar.tsx, TabBar.tsx, dot-style.ts, themes.ts, napkin-markdown.ts line by line.

**Saved to:** `.nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/mock-e.html`

**What it ports from the app:**
- Sidebar.tsx card structure: collapsed header with `*` + name + agent dots + phase
- Focused card: blue left border accent, tertiary bg, body with files + agents
- Extended view: `[terminal]` entries, agent file trees at indent 32px
- FileRow: `*` bullet (10px, centered, muted) + filename (link color for .md, bold for main file)
- AgentDot: filled circle (running), dashed-check with SVG checkmark (done), hollow (exited)
- Role colors from dot-style.ts: test-arch=#f59e0b, fs-eng=#22c55e, test-eng=#6b7280
- Phase colors from Sidebar.tsx: doing=#22c55e, backlog=#525252
- Agents at same indent as files (agents/ dir skipped)
- TabBar.tsx: ephemeral tabs in italic, active tab with bg, close button on hover
- Draggable nav border (from both Sidebar.tsx:564-587 and index.tsx:58-115)
- lightBlue theme from themes.ts: all CSS vars match

**What it adapts for extension:**
- Nav on RIGHT (Chrome side panel constraint)
- No gutter (single nepic context from URL)
- No kanban overlay
- Header bar with napkin name + fetch latest + settings + nav toggle
- Editor/Terminal as stacked surfaces with tab switching (not side-by-side panes)
- Terminal uses dark theme (bash-poc colors)
- "show all" toggle for other napkins

**What it doesn't have yet:**
- Tab overflow handling (same gap as the app)
- Double-click to pin ephemeral tabs (mock simplification)
- Cmd+E extended/focused toggle (interactive only through click)
- Real Monaco — this is styled HTML simulating the tokenizer output
- Git gutter decorations
- Rendered markdown mode (Cmd+J)

## what I learned

The app design is good because it encodes two dimensions in one element: the dot carries both role (color) and status (shape). That's Tufte — maximum information per visual element. Same with `*` bullets — they're not decoration, they're the structural element that makes the tree scannable.

Trying to redesign from scratch failed because the app already solved the hard problem: making a dense file tree feel navigable in monospace at 13px. The mocks that tried different approaches (spacious, split, overlay) all just moved around the same puzzle pieces worse.

## recommendation for next step

Use mock-e as the design target for the extension's real implementation. The existing extension code (side-panel.html, nav-tree.ts) needs to evolve toward the app's Sidebar.tsx patterns:
1. Replace triangle expand/collapse with the card focus system (click header → expand)
2. Add AgentDot rendering (role color + status shape)
3. Flatten agents to same level as files
4. Add ephemeral/permanent tab distinction
5. Make nav width draggable

The editor side (Monaco + napkin-markdown tokenizer) is already close — the extension already uses the same tokenizer. The gap is in the nav tree and tab system.
