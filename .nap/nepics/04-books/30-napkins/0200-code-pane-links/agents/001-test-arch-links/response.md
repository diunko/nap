# 001-test-arch-links — response

## Produced

`0200-code-pane-links.test.md` — 37 test cases across 6 areas.

| Area | Small | Medium | Total |
|---|---|---|---|
| Link provider + routing | 7 | 0 | 7 |
| Right pane mixed surface | 4 | 3 | 7 |
| Tabs | 8 | 2 | 10 |
| Git gutter | 5 | 2 | 7 |
| Shift-enter continuation | 5 | 2 | 7 |
| Code file watching | 4 | 2 | 6 |
| **Total** | **33** | **11** | **44** |

(Note: some tests count as both small and medium — the total unique test IDs is 37, but a few have both a small and medium verification path.)

## Key design decisions

### 1. routeLink is the new seam

0100 had `route()` for sidebar clicks. 0200 adds `routeLink()` for Monaco link clicks — different input (href + sourceFile), different output (openCode/openDoc/openExternal). Kept as a separate pure function in routing-rules.ts. 7 small tests cover classification, resolution, and edge cases.

### 2. Tab state is testable as pure logic

The tab model (ephemeral/pinned semantics, reuse, ordering) is all zustand state. 8 small tests cover the state machine without needing Monaco or DOM. The 2 medium tests only verify visual behaviors (italic title, model disposal) that can't be checked from state alone.

### 3. Git diff parser as standalone function

The hunk header parser should be a separate pure function — not buried inside the IPC handler. 5 small tests cover parsing, classification, and edge cases (binary, untracked, empty). The spec already says "standalone pure function for testability."

### 4. ContentFileWatcher extraction enables small tests

0100's watcher was inline in main.ts (Finding 1 from test-eng). The spec calls for extracting it to a module with injectable fs. 4 small tests cover the module directly. This also fixes the limitation from 0100 where W01-W03 had to hit real filesystem.

## Flags for the architect

### Flag 1: Bare code path resolution ambiguity

The spec says: code links with leading `/` → project root, without `/` → dirname(sourceFile). But napkin files reference project code with bare paths like `src/main/model.ts:42`. From a sourceFile at `.nap/nepics/01-v1/30-napkins/0200/.../0200.nap.md`, resolving `src/main/model.ts` relative to dirname gives `.nap/nepics/.../src/main/model.ts` — wrong.

Options:
- **Convention:** bare paths in napkins are always project-root-relative (need a third rule)
- **Fallback:** try dirname first, if file doesn't exist, try project root
- **Explicit:** require `[text](/src/main/model.ts#L42)` with leading `/` for project-root paths

Test L01 flags this. The implementer needs a decision.

### Flag 2: .md with :line — which wins?

A link like `changelog.md:15` has a .md extension AND a :line suffix. The spec says classification is by extension → this routes to left pane as a doc. But the `:15` suggests the user wants to jump to a line. The left pane doesn't support line navigation currently. Test L03 notes this.

### Flag 3: Tab scaling from 0100 test-eng

The 0100 test-eng response (scaling notes) flagged: auto-save fan-out (each tab needs its own debounce + echo suppression), file watchers per tab (hundreds of fs.watch handles), terminal + code resource types in right pane tabs. These are real implementation concerns, not test concerns — but the fullstack engineer should read that section.
