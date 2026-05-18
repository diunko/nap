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

---

## update: mock-e iteration (post-review with DU)

### what we iterated on

After the initial mock-e delivery, DU tested in Chrome at various zoom levels and found two issues:

**1. Double resizer bug**

Mock-e had TWO resize handles at the nav boundary:
- `#resize-handle` — a 4px flex element between main and nav
- `#nav-drag` — a 4px absolute-positioned element on nav's left edge

Both covered the same boundary, creating two blue hover zones. Fixed by removing `#resize-handle` entirely — `#nav-drag` is now the single resizer.

**2. Blue accent bar placement**

The focused card's blue `border-left: 3px solid var(--nap-accent)` created a "too much blue" problem when the resizer hovered blue on the same edge. We explored:

- **Mock F experiment: border-right** — moved the accent to the right edge (far from content, matching the app's pattern where the accent is on the far side from content). But at the screen edge, the accent got lost — not enough visual breathing room.

- **Back to border-left** — with the double resizer eliminated, the real question became: what color/weight should the drag handle hover be so it doesn't clash with the blue accent?

### the drag handle color journey

We went through several iterations on the `#nav-drag:hover` color:

1. **`var(--nap-accent)` (#2563eb, blue)** — original. Clashed with the focused card accent — looked like the selection was expanding.

2. **`var(--nap-text-dim)` (#94a0b0, light gray)** — less intense than the blue accent, so it felt like hovering *removed* the selection instead of adding a drag affordance.

3. **`var(--nap-text)` (#2e3440, near-black)** — assertive, clearly "infrastructure" not "selection." Better — felt like Chrome UI. But too intense; the contrast spike was jarring.

4. **`var(--nap-text-muted)` (#6d7a8a, medium gray)** — the sweet spot. Visible enough to signal "drag me," muted enough to not compete with the blue accent. Feels like a structural element, not a semantic one.

### drag handle width

We also tested matching the drag handle width (4px) to the accent bar (3px):

- **3px handle** — visually merged with the accent bar. Selection looked like it expanded to both sides. Bad.
- **4px handle (kept)** — the 1px difference is enough. The handle is visibly wider, which subtly reinforces "I'm a different element" even on the same edge. Combined with the gray color, it reads as "chrome you can grab" rather than "selection indicator."

### 0200 content added

Both mock-e and mock-f now have expandable content for `0200-crust-validation`:
- `0200-crust-validation.nap.md` (main file, bold)
- `mini-book/` dir with `01-crust-types.md` and `02-transit-degradation.md`

This allows testing card focus switching between napkins — clicking 0200's header unfocuses 0100 and expands 0200.

### final state of mock-e

The design mock that DU approved:
- **Single resizer**: `#nav-drag`, 4px, hovers `var(--nap-text-muted)` (#6d7a8a)
- **Focused card accent**: `border-left: 3px solid var(--nap-accent)` (#2563eb) — stays on the left (content-adjacent) side
- **Card switching**: click napkin header to focus/unfocus, "show all" reveals other napkins
- **Works well at various zoom levels and nav widths** — confirmed by DU testing

### design principle discovered

Blue = semantic (selection, focus, meaning). Gray = structural (chrome, handles, infrastructure). When two visual elements share an edge, they need different signal types or they merge into ambiguity. The accent bar (blue, 3px) and drag handle (gray, 4px) coexist on the same edge because they speak different visual languages.
