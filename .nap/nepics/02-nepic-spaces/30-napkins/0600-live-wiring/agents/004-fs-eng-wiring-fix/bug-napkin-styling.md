## Bug: sidebar lost the napkin nested feel

The reference implementation (HTML mock) has clean nested `*` bullet styling that reads like a napkin. The current implementation lost this — it looks flatter, less structured.

### Compare

Screenshots in this directory:
- `screenshots/reference.png` — the HTML mock (correct)
- `screenshots/current.png` — what the app currently shows

### Key differences

Reference has:
- `*` asterisks as visible bullet markers at each nesting level
- Clear indentation hierarchy — napkin → artifacts → agents → agent files
- Agent dirs show as `*` bullets with status dot and label (done/run/nap)
- Agent files (prompt.md, response.md) nested under agent with `*`
- `[terminal]` italic entries nested under agents
- File controls (⎘ ↗) on hover, not always visible
- Consistent monospace rhythm

Current is missing:
- The nested `*` feel — items look like a flat list with indentation
- Agent status labels may be styled differently
- The overall visual rhythm of "bullets all the way down"

### Reference

- HTML mock to match exactly: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`
- Design voiceover: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`
- All screenshots: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png` through `04.png`
- Component to fix: `src/renderer/components/NapkinBrowser.tsx`
- Test with: `npm run dev -- -- --cwd ~/dvl/aibanana/test-nap`
