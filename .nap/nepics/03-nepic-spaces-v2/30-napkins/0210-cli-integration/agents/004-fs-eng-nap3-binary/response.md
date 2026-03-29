# Response: nap3 binary rename

## What was done

Renamed the v3 package and binary to avoid conflicting with the stable `nap` CLI at `~/nap-app/`.

### Changes

1. **`packages/v3/package.json`** — `"name": "nap"` → `"nap-v3"`, `"bin": {"nap": ...}` → `{"nap3": ...}`

2. **`packages/v3/src/cli/nap.ts`** — all user-facing strings updated:
   - Help text header: `nap — Napkin Agent Protocol` → `nap3 —`
   - All `Usage: nap <cmd>` → `Usage: nap3 <cmd>`
   - Inline examples: `nap create napkin/agent/architect/nepic` → `nap3 create ...`
   - Error messages: `nap is not running`, `not a nap project`, `nap is already running`, `not running inside nap` — all updated to reference `nap3`

3. **Template files** (`packages/v3/src/templates/`) — all CLI command references updated:
   - `00-org/20-workflow.nap.md` — `nap start`, `nap done`, `nap nap`, `nap poke`, `nap status`, code block examples
   - `00-org/40-roles/architect.md` — `nap start`, `nap nap`, `nap status`, `nap done`
   - `00-org/40-roles/fullstack-eng.md` — `nap done`
   - `00-org/40-roles/test-eng.md` — `nap done`
   - `00-org/40-roles/test-architect.md` — `nap done`

### NOT changed (intentionally)
- `.nap/` directory name — that's the protocol directory, not the CLI
- `NAP_` environment variables — internal, not CLI name
- `Nap.app` — app brand name
- `napkin`, `Napkin Agent Protocol` — protocol terms
- Internal variable/function names
- `packages/v2/` — untouched per instructions
- Bridge-types internal code comment

### Verification
- `npm run build:cli -w packages/v3` — pass
- `npm run typecheck:v3` — pass
- `npm run test:v3:small` — 114 tests pass
- `npm run test:v3:medium` — 21 tests pass
- `npm link -w packages/v3` — `nap3` symlink created
- `which nap3` → v3 CLI
- `which nap` → `~/nap-app/` (stable CLI, untouched)
