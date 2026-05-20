# focus mode — spec

## Read before building

- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — package structure
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — persisted state
- `packages/v3/src/renderer/Sidebar.tsx` — how the app renders architects + napkins, card tiers (collapsed/focused/extended), maxDepth pattern
- `packages/v3/src/renderer/store.ts` — expandCard, extendCard, cardViewMode

## Two modes, one toggle

* `focusMode: boolean` in the store, persisted
* focus mode: only the card matching `focusedCardSlug` is visible
* show-all mode: full nav — architects section, separator, napkins section
* toggle via header button + Ctrl+Shift+F
* on first load from URL: `focusMode = true`, `focusedCardSlug` from URL napkin path

## Card tiers — three states, consistent for napkins and architects

* collapsed: header only — `* name [dots] status`
* focused: top-level entries at depth 0 — files, directories (unexpanded), agents
* extended: full tree, unlimited depth — directories expanded, agent files visible
* controlled by `cardViewMode: 'collapsed' | 'focused' | 'extended'` + `focusedCardSlug`
* click header: collapsed → focused (or focused → collapsed if same card)
* click different card header: new card focused, previous collapses
* Cmd+E: focused ↔ extended toggle (only when a card is focused)
* same behavior for napkin cards and architect cards — no special casing

## Architects section

* nav-tree.ts already parses `20-architects/` into NavNode sections
* Sidebar renders architects above napkins with a visual separator
* architect card header: `* {name} [dot] {status}`
  * status label: `lead` (running), `done`, `exited`, `archived`
  * dot: blue (architect role color), shape from agent status
* architect card body (focused): prompt.md, scratch/, response.md — whatever exists at depth 0
* architect card body (extended): scratch/ contents expanded, all nested files

## Header layout

```
[napkin-name]  [fetch latest]  [refresh PR]  [focus-toggle]  [settings]  [nav-toggle]
```

* focus-toggle: icon changes based on mode
  * in focus mode: suggests "expand to show all"
  * in show-all mode: suggests "focus on current"
* Ctrl+Shift+F: same as clicking focus-toggle
  * NOT Cmd+F (conflicts with Monaco find)

## Focus follows clicks

* URL napkin determines initial `focusedCardSlug`
* after that, expanding any card (napkin or architect) updates `focusedCardSlug`
* toggling to focus mode shows whatever card was last expanded
* the URL is the entry point, not a permanent anchor

## What gets persisted (Zustand partialize)

* `focusMode: boolean`
* `focusedCardSlug: string | null`
* `cardViewMode: 'collapsed' | 'focused' | 'extended'`
* return visit restores mode + which card + tier

## "Show others" removal

* remove the existing "show others" / "hide others" text toggle at bottom of nav
* replaced by the header focus-toggle button
* cleaner — one toggle in one place

## What doesn't change

* card expand/collapse mechanics (expandCard, extendCard store actions)
* nav tree parser (already handles architects + napkins)
* file click → openDoc flow
* agent dot rendering (already works for napkin agents)
* terminal, editor, link routing — unaffected
* existing Playwright tests — selectors should be stable (`.napkin-card` applies to both napkin and architect cards, or use a shared `.nav-card` class)
