# Test architect response — 0300-qol-tweaks

## Delivered

`0300-qol-tweaks.test.md` — 22 test cases across 7 areas.

## Summary

- **Tab size (1 case):** Medium test only — verify editor options at runtime, auto-detect override is the seam.
- **Terminal link routing (3 cases):** Small tests — routeLink handles absolute paths from terminal context, line info preserved through extractPathAndLocation chain, URL guard still works. Critical seam: onOpen callback signature must carry line/col (the old signature only takes `absolutePath: string`).
- **Theme system (6 cases):** Mix of small (data validation, store rotation, persistence round-trip, fallback) and medium (CSS variables on :root, both editors receive theme). Key risk: shell properties not mapping 1:1 to CSS variable names.
- **Terminal tab refactor (5 cases):** All small, store-only. Key test: no accumulation after multiple setActiveTerminal calls. The old upsertTab logic creates per-path tabs — must be replaced with update-in-place.
- **Git gutter fixes (5 cases):** Mix of small (race guard) and medium (refresh on open, on external change, on focus, 200ms delay). Hardest medium test: GG-02 (external file change → gutter update) requires file watcher to work end-to-end.
- **Rendered mode (7 cases):** Mix of small (store toggle, tab independence, markdown-it source mapping, role comment plugin, persistence) and medium (Cmd+click → edit at line, link click vs Cmd+click discrimination). The biggest risk is the source line mapping — markdown-it uses 0-indexed maps, Monaco uses 1-indexed lines.
- **Tokenizer tweak (1 case):** Small — compare foreground values in theme rules.

## Risks flagged for the fullstack engineer

1. **Terminal link onOpen signature:** Current signature is `(absolutePath: string) => void`. The new routing needs line/col. Either change signature to pass the raw match text (with `:line:col`) or add parameters. This shapes the API the tests will call.
2. **markdown-it source line indexing:** Token `map` is `[startLine, endLine]` 0-indexed. Must add +1 when writing `data-source-line` attributes.
3. **Terminal tab refactor — upsertTab:** The current function matches by `path + type`. Since terminal tab path changes (different agent IDs), it creates new tabs. The permanent slot needs a different mechanism — either always reuse the first terminal tab, or use a fixed sentinel path.
4. **CSS variable migration breadth:** Every component that uses hardcoded hex colors needs to switch to `var(--nap-*)`. This is the largest surface area of change. Tests verify the variables exist on `:root` but can't verify every component uses them — that's code review territory.

## Test file plan

8 test files: 5 small (vitest), 3 medium (Playwright). See the table at the end of test.md.
