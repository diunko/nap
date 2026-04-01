## 0620 — archived agents: spec

This spec gives you direction and constraints. Before writing any code, thoroughly study the v3 codebase — especially model.ts (agent lifecycle), coordinators.ts (startAgents, resume logic), node-pty-spawner.ts (spawn/exit), and Sidebar.tsx (dot rendering).

### Two entry points, one flow

**Path A — archived flag (import):**
- Marker has `archived: true`
- `computeResumeActions` skips it entirely — no --resume attempt
- Click in sidebar → show successor prompt in terminal area

**Path B — resume fails at runtime:**
- App tries `claude --resume <uuid>` as normal
- CC exits quickly: "No conversation found with session ID: ..."
- Detection: pty onExit within ~5 seconds of spawn + command was --resume
- Additionally: check pty output buffer for "No conversation found"
- Same pattern as v2's architect resume fallback (`packages/v2/src/main/main.ts` line 191)
- On detection → show successor prompt in terminal area

Both paths converge to the successor flow.

### Successor flow

When triggered (either path):
1. Terminal area shows message: "Session expired — invoke a successor maintainer?" with clickable action
2. User clicks → fresh Claude spawns with generated prompt as FIRST MESSAGE (not a file)
3. The generated prompt includes:
   - Role context: path to role file
   - "read prompt.md — what was originally asked"
   - "read response.md — what was delivered"
   - "explore the code — understand what was built"
   - Napkin context: path to the napkin's .nap.md
4. After spawn:
   - New UUID replaces old dead one in marker
   - Status: done=true, exited=false, archived=false
   - Agent is regular from here — can nap done, can be resumed

### nap3 import-agents <nepic-dir>

CLI command for onboarding existing manual-workflow projects.

- Walks `30-napkins/*/agents/*/` looking for dirs with prompt.md or response.md but no .agent.nap.json
- For each found: creates .agent.nap.json with:
  - `cc_session_uuid`: fresh UUID (for identity)
  - `role`: inferred from dir name convention (001-test-arch → test-arch, 002-fs-eng → fs-eng)
  - `name`: dir name
  - `napkin`: parent napkin slug
  - `nepic`: nepic slug
  - `archived: true`
  - `started: false`
- Also checks `20-architects/*/` for architect dirs without markers
- Runs WITHOUT the app (filesystem only, like nap init)

### Model changes

- `AgentState` gains `archived: boolean`
- `computeResumeActions`: skip agents where `archived === true`
- Resume failure detection in `startAgents` or pty-spawner level:
  - Track which spawns are --resume attempts
  - On fast exit (~5s): check output for "No conversation found"
  - Mark agent as archived in model (don't write to disk — let the successor flow handle it)
  - Push snapshot → renderer shows the successor prompt

### Dot style

Same as exited: grayed out hollow border. Label: "archived".

### What NOT to do

- Don't write successor-prompt.md to disk — send as first message
- Don't add `nap3 archive` command — skipped for now
- Don't change existing agent lifecycle (started/done/exited) — archived is additive
- Don't break existing tests
