# Design Sprint Response — 4 Extension Mock Options

## What I Built

Four self-contained HTML+CSS+JS mocks in `.nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/`. Each renders the full Chapter 1 (order-routing) from the space-pizza fixtures, with styled headings, //DU: and //A: role comments, code blocks, file:line links, and the nav tree populated with 0100-delivery-pipeline content. All use lightBlue theme (#f0f4f8) for editor/nav and dark (#1e1e1e) for terminal. Monospace throughout.

## The 4 Options

### Mock A — Classic Split

**Layout:** Header | Tab bar (Editor/Terminal) | Content area + Nav (right, 160px, collapsible)

**Optimizes for:** Familiar two-pane layout. Terminal is a full tab swap — when you click Terminal, the entire content area goes dark. Nav is always visible, collapsible with the hamburger icon.

**Reading feel:** Spacious. 28px padding, 1.6 line-height, 17px headings. The most comfortable reading experience of the four. Good for long sessions.

**Terminal model:** Full-tab replacement. Tab bar adapts (goes dark when terminal active). You're either reading or terminal — not both.

**Tradeoff:** Uses the most chrome (header + tab bar + nav = ~70px of vertical space lost). Nav eats ~160px of the ~500px panel width. At 500px, content area is ~340px — tight for code blocks. Nav collapse helps, but then you lose navigation.

### Mock B — Dense Linear

**Layout:** Compact header (30px) | Pill-style tab selector (28px) | Editor | Terminal drawer (slides up from bottom)

**Optimizes for:** Information density. Linear-inspired. Every element is smaller: 11-12px fonts in nav, tighter line-heights, less padding. Fits more content per pixel.

**Reading feel:** Dense but scannable. 14px padding, 1.45 line-height, 15px headings. Closer to a code editor than a book reader. Good for experienced reviewers who scan rather than read linearly.

**Terminal model:** Bottom drawer. Slides up over the editor, keeping both visible. The editor stays on screen — you can see chapter content while running git commands. The pill tabs double as a mode indicator: Editor pill stays active even with drawer open (it's an overlay, not a mode switch).

**Tradeoff:** The density can feel cramped on first encounter. Chapter content and nav items are small. But it maximizes the data-ink ratio — Tufte would approve. The drawer model is the most practical terminal integration because you see both contexts simultaneously.

### Mock C — Book Reader

**Layout:** Minimal header (34px, with centered filename) | Full-width editor | Nav as slide-in sidebar (left, hidden by default) | Terminal as centered overlay modal

**Optimizes for:** Immersive reading. The entire panel width is devoted to chapter content. No permanent nav. The reviewer's primary job is reading — let them read without visual noise.

**Reading feel:** The most immersive. Full width for prose, generous padding, chapter progress dots at top (5 dots for 5 chapters, showing where you are in the book). Feels like an e-reader more than a dev tool.

**Terminal model:** Floating overlay. Click "Terminal" in the header, a dark modal fills 92% of the panel with rounded corners and a shadow. It looks like a separate tool that you invoke, use, and dismiss. The backdrop blur signals "you're in a different mode."

**Tradeoff:** Hidden nav means extra clicks to navigate between chapters. The progress dots help orientation, but jumping to chapter 3 requires opening the sidebar. Terminal as modal means you can't see chapter content while running commands — you have to close the terminal to go back. This works if terminal use is rare (the spec says it's an escape hatch).

### Mock D — Split Pane

**Layout:** Breadcrumb header | Horizontal chapter tabs (replacing tree nav for chapters) | Editor (top) | Resizable terminal (bottom, always visible) | Full nav in slide-out drawer (right)

**Optimizes for:** Multitasking. Editor and terminal are both visible simultaneously. Chapters are horizontal tabs — one click to switch, no tree traversal. The drag handle lets you resize the split to your preference.

**Reading feel:** Moderate density. The permanent terminal pane eats ~180px of vertical space, but it collapses to just a 28px tab bar. Horizontal chapter tabs mean you always see all 5 chapters at once — no tree expand/collapse.

**Terminal model:** Persistent bottom pane with drag-to-resize. Always there, always accessible. Collapses to a single-line tab bar. The resize handle turns blue on hover — discoverable and satisfying. This is the VS Code model.

**Tradeoff:** Horizontal tabs replace tree nav for chapters — but agents, napkin files, and other napkins require the slide-out drawer. The breadcrumb header means less room for a napkin name + controls. At 500px wide, the chapter tabs may truncate. But the always-visible terminal is a strong advantage for reviewers who use it frequently.

## Comparison Matrix

| Dimension | A: Classic | B: Dense | C: Book Reader | D: Split Pane |
|---|---|---|---|---|
| **Chrome weight** | Heavy (70px) | Minimal (58px) | Minimal (34px) | Moderate (62px) |
| **Content width** | ~340px at 500 | ~360px at 500 | ~500px at 500 | ~500px at 500 |
| **Density** | Spacious | Dense | Spacious | Moderate |
| **Terminal access** | Full tab swap | Bottom drawer | Modal overlay | Always visible |
| **Nav visibility** | Always (right) | Always (right) | On demand (left) | On demand (right) |
| **Chapter switching** | Nav tree click | Nav tree click | Sidebar → click | Horizontal tab |
| **Best at** | Familiar comfort | Info density | Immersive reading | Terminal workflow |

## My Recommendation

**Build Mock B (Dense Linear) as the primary direction, with Mock D's terminal split as an option.**

Here's why:

1. **The side panel is narrow.** At 500px default, every pixel matters. Mock A's permanent nav eats too much width — you end up with a 340px reading area that can't display code blocks without horizontal scroll. Mocks B, C, and D all handle this better.

2. **Terminal as drawer beats terminal as tab or modal.** The spec says terminal is the escape hatch — you use it for quick git ops, not as a primary surface. Mock B's drawer is the right metaphor: it slides into view, you use it, you close it. You can still see the editor above. Mock A's full-tab swap makes it a mode, which it shouldn't be. Mock C's modal is beautiful but disconnects you from context.

3. **Dense is right for a side panel.** This isn't a full-page reading experience — it's a side panel running alongside a GitHub PR. The reviewer's eye is already trained on dense information (PR diffs, code). Mock C's book-reader feel is lovely in isolation but may feel disconnected when sitting next to GitHub's information density.

4. **Horizontal chapter tabs (Mock D) are worth stealing.** The chapter list is always short (5-7 items). Horizontal tabs let you see all chapters at once with zero clicks. Consider adding them to Mock B's header area.

5. **Mock C's progress dots are worth stealing too.** Five dots showing chapter position is brilliant at-a-glance orientation. Inexpensive to add to any layout.

The hybrid: Mock B's dense layout + pill tabs + bottom drawer terminal, but swap the right-nav chapter section for Mock D's horizontal chapter tabs in the tab-pills bar. Add Mock C's progress dots above the editor content. Keep the right nav for agents/files only — it becomes narrower and more purposeful.
