## 0670 — setup command: spec

This spec gives you direction and constraints. Before writing any code, read the existing `nap3 init` implementation in `packages/v3/src/cli/nap.ts`, and understand how marker files, guardian setup, and skills copying work.

### The command

`nap3 setup [flags]` — additive project configuration. Requires `.nap/` to exist (errors otherwise — use `init` first). Idempotent — running twice with the same flags is a no-op.

### Flags

**`--guardian`**
- Creates `20-architects/002-guardian/` in the active nepic with `.agent.nap.json` (role: guardian) + `prompt.md` from template
- Writes `.claude/settings.json` with PermissionRequest hook config
- If guardian already exists → skip. If settings.json exists → merge hook config, don't overwrite other settings.

**`--skills`**
- Copies napkin + napkin-format skills from `src/templates/skills/` to `.claude/skills/`
- `--user` variant: copies to `~/.claude/skills/` instead
- If skill dirs already exist → overwrite with latest (templates may have been updated)

**`--import`**
- Scans the project for napkin/agent/architect dirs without marker files
- Creates markers — purely additive, never modifies existing markers, never deletes
- Runs without the app (filesystem only, no socket)

### Import logic

Walk `.nap/nepics/*/`:

**Napkins** (`30-napkins/*/`):
- If dir has no `.napkin.nap.json` → create with `{ status: "backlog", nepic: "<nepic-slug>" }`
- If marker exists → skip

**Agents** (`30-napkins/*/agents/*/`):
- Skip if empty dir (no files at all)
- If dir has no `.agent.nap.json` → create:
  ```json
  {
    "cc_session_uuid": "<fresh-uuid>",
    "role": "<inferred from dir name>",
    "name": "<dir name>",
    "napkin": "<parent napkin slug>",
    "nepic": "<nepic slug>",
    "started": false,
    "done": <true if response.md exists>,
    "exited": false,
    "archived": false,
    "created_at": <now>
  }
  ```
- Role inference: strip leading digits + hyphen from dir name. `001-test-arch` → `test-arch`, `002-fs-eng` → `fs-eng`
- If marker exists → skip

**Architects** (`20-architects/*/`):
- Same as agents but no `napkin` field
- If marker exists → skip

### init + setup relationship

`nap3 init` should internally use the same logic as `setup` for `--guardian` and `--skills` flags. Extract shared functions that both commands call. Don't duplicate code.

### What NOT to do

- Don't start the app or connect to socket — setup is filesystem-only
- Don't modify existing marker files — additive only
- Don't delete anything
- Don't break existing tests or init behavior
