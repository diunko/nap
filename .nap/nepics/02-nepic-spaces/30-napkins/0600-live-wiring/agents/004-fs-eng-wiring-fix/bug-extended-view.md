## Bug: extended view doesn't show files inside agent dirs

The extended view (Cmd+E) should show files inside each agent directory (prompt.md, response.md, etc.). Currently it only shows agent dir names because the napkin watcher doesn't read agent dir contents.

### Root cause

`readNapkinDir()` in `napkin-watcher.ts` line 48-53 reads agent directory names but not the files inside them:
```typescript
data.agents.push(entry.name);  // just the dir name, no contents
```

### Fix needed

1. Extend `NapkinData.agents` from `string[]` to include file lists:
   ```typescript
   agents: { name: string; files: string[] }[]
   ```
   Or add a separate field like `agentFiles: Record<string, string[]>`

2. In `readNapkinDir()`, for each agent dir, also `readdir` its contents and include the file names

3. Update the store type and NapkinBrowser's extended view to render the files

4. The watcher already watches recursively — so changes inside agent dirs trigger re-scans. The data just needs to be richer.

### Also

When a NEW file is created in a napkin dir (not agent dir), does the extended view update? Verify that artifact list updates work end-to-end for the extended view, not just the focused view.

### Reference

- Screenshot of extended view: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01a.png` (architect extended) and `03.png` (napkin extended with agent files)
- Voiceover: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md` (sections "01a" and "03")
- HTML reference: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`
- Test with: `npm run dev -- -- --cwd ~/dvl/aibanana/test-nap`
