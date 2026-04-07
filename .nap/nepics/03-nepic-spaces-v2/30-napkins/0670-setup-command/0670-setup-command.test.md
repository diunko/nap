# 0670 — Setup Command: Test Cases

## Seam Analysis

The setup command is filesystem-only (no socket, no Electron). The seams are:

1. **Guard: .nap/ must exist** — setup is not init. Errors early if no project.
2. **--guardian: create + merge** — creates agent dir + marker + prompt. Merges hook config into existing settings.json without destroying other settings.
3. **--guardian: idempotent** — second run skips everything, doesn't duplicate.
4. **--skills: copy + overwrite** — copies from templates. Overwrites if already present (template update path).
5. **--skills --user: target directory** — global vs project install.
6. **--import: walk + filter** — correctly walks nepics/*/30-napkins/*/ and nepics/*/20-architects/*. Skips dirs with existing markers. Skips empty dirs.
7. **--import: marker correctness** — role inference from dir name, done detection from response.md, correct nepic/napkin slug wiring, fresh UUIDs.
8. **--import: additive guarantee** — never modifies existing markers, never deletes. The hardest seam to verify (need existing markers with specific data and verify they're untouched).
9. **--import: architects vs agents** — architects have no napkin field. Same marker logic otherwise.
10. **Combined flags** — --guardian --skills --import all run in one invocation.
11. **init delegates to setup** — shared functions, not duplicated code.

---

## Test Cases

### T-0670-01: Setup without .nap/ → error

**Flow:** Run `nap3 setup --guardian` in a directory with no `.nap/`.
**Subsystems:** CLI (nap.ts)
**Expected:** stderr contains error message. Exit code non-zero. No files created.
**Likely to break:** If guard check is forgotten during implementation.
**Size:** small
**Verification:** `expect(() => runNapSetup(tmpDir, ['--guardian'])).toThrow()`. No `.nap/` or `.claude/` dirs created.

---

### T-0670-02: Setup --guardian creates guardian agent dir and marker

**Flow:** Run `nap3 init` → `nap3 setup --guardian` → verify `20-architects/002-guardian/` exists with correct marker.
**Subsystems:** CLI
**Expected:** `.agent.nap.json` contains `{ role: "guardian", name: "002-guardian", nepic: "01-v1", started: false, cc_session_uuid: <uuid>, created_at: <number> }`.
**Likely to break:** Wrong nepic slug. Missing fields in marker. Wrong directory path.
**Size:** small
**Verification:** Parse marker JSON. `expect(marker.role).toBe('guardian')`. `expect(marker.cc_session_uuid).toMatch(/^[0-9a-f-]{36}$/)`.

---

### T-0670-03: Setup --guardian copies prompt.md from template

**Flow:** Run init → setup --guardian → verify prompt.md exists in guardian dir.
**Subsystems:** CLI
**Expected:** `002-guardian/prompt.md` exists and has content.
**Size:** small
**Verification:** `expect(fs.existsSync(promptPath)).toBe(true)`. `expect(fs.readFileSync(promptPath, 'utf8').length).toBeGreaterThan(0)`.

---

### T-0670-04: Setup --guardian writes .claude/settings.json with hook config

**Flow:** Run init → setup --guardian → read `.claude/settings.json`.
**Subsystems:** CLI
**Expected:** Settings contains `{ hooks: { PermissionRequest: [{ type: "command", command: "nap3 hook permission-request" }] } }`.
**Likely to break:** Wrong hook format. Missing nested structure.
**Size:** small
**Verification:** Parse JSON. `expect(settings.hooks.PermissionRequest[0].command).toBe('nap3 hook permission-request')`.

---

### T-0670-05: Setup --guardian merges into existing settings.json

**Flow:** Create `.claude/settings.json` with `{ "permissions": { "allow": ["Bash"] } }` → run init → setup --guardian → verify permissions still present AND hook added.
**Subsystems:** CLI
**Expected:** Both `permissions` and `hooks.PermissionRequest` exist. Original data preserved.
**Likely to break:** If implementation overwrites instead of merging. The most likely real bug.
**Size:** small
**Verification:** Parse JSON. `expect(settings.permissions.allow).toContain('Bash')`. `expect(settings.hooks.PermissionRequest).toBeDefined()`.

---

### T-0670-06: Setup --guardian idempotent — second run is no-op

**Flow:** Run init → setup --guardian → note marker's cc_session_uuid → setup --guardian again → verify UUID unchanged, no error.
**Subsystems:** CLI
**Expected:** No error on second run. Marker unchanged (same UUID, same content). Settings.json unchanged.
**Likely to break:** If implementation creates a second guardian or regenerates the UUID.
**Size:** small
**Verification:** `expect(markerAfter.cc_session_uuid).toBe(markerBefore.cc_session_uuid)`. No throw on second call.

---

### T-0670-07: Setup --skills copies napkin and napkin-format to .claude/skills/

**Flow:** Run init → setup --skills → verify `.claude/skills/napkin/` and `.claude/skills/napkin-format/` exist with content.
**Subsystems:** CLI
**Expected:** Both skill dirs exist under `.claude/skills/`. Each contains at least one file.
**Size:** small
**Verification:** `expect(fs.existsSync(napkinSkillDir)).toBe(true)`. `expect(fs.readdirSync(napkinSkillDir).length).toBeGreaterThan(0)`.

---

### T-0670-08: Setup --skills overwrites existing skills (template update path)

**Flow:** Run init → setup --skills → write a canary file inside `.claude/skills/napkin/canary.txt` → setup --skills again → canary is gone, fresh template files present.
**Subsystems:** CLI
**Expected:** Skills are fresh copies from templates. Canary file overwritten or removed.
**Likely to break:** If implementation skips when dir exists (wrong idempotency — skills should overwrite, unlike guardian which should skip).
**Size:** small
**Verification:** `expect(fs.existsSync(canaryPath)).toBe(false)`. Skill files match template contents.

---

### T-0670-09: Setup --skills --user installs to ~/.claude/skills/

**Flow:** Run init → setup --skills --user → verify skills in `~/.claude/skills/` not `.claude/skills/`.
**Subsystems:** CLI
**Expected:** `~/.claude/skills/napkin/` exists. `.claude/skills/napkin/` does NOT exist (unless it was there before).
**Likely to break:** Wrong target path logic.
**Size:** small (needs cleanup of global dir after test)
**Verification:** Check both paths. Global has skills, local doesn't.

---

### T-0670-10: Setup --import creates napkin markers for unmarked napkins

**Flow:** Create a project with `30-napkins/0100-explore/` dir but no `.napkin.nap.json` → setup --import → marker created.
**Subsystems:** CLI
**Expected:** `.napkin.nap.json` contains `{ status: "backlog", nepic: "<slug>" }`.
**Likely to break:** Wrong default status. Missing nepic field.
**Size:** small
**Verification:** Parse marker. `expect(marker.status).toBe('backlog')`. `expect(marker.nepic).toBeDefined()`.

---

### T-0670-11: Setup --import skips napkins that already have markers

**Flow:** Create project with `30-napkins/0100-explore/.napkin.nap.json` containing `{ status: "doing" }` → setup --import → marker unchanged.
**Subsystems:** CLI
**Expected:** Marker still says "doing", not overwritten with "backlog".
**Likely to break:** If import blindly writes without checking existence.
**Size:** small
**Verification:** `expect(marker.status).toBe('doing')`.

---

### T-0670-12: Setup --import creates agent markers with correct fields

**Flow:** Create project with agent dir `agents/001-test-arch/prompt.md` (no marker) → setup --import → marker created.
**Subsystems:** CLI
**Expected:** `.agent.nap.json` with: `cc_session_uuid` (valid UUID), `role: "test-arch"`, `name: "001-test-arch"`, `napkin: "0100-explore"`, `nepic: "<slug>"`, `started: false`, `done: false`, `exited: false`, `archived: false`, `created_at: <number>`.
**Likely to break:** Role inference regex. Missing napkin/nepic fields. Wrong done detection.
**Size:** small
**Verification:** Parse JSON, verify each field.

---

### T-0670-13: Setup --import role inference — strips leading digits + hyphen

**Flow:** Create agent dirs: `001-test-arch`, `002-fs-eng`, `003-reviewer` (no markers) → setup --import → verify inferred roles.
**Subsystems:** CLI
**Expected:** Roles: "test-arch", "fs-eng", "reviewer".
**Likely to break:** Regex edge cases. What if dir is "test-arch" with no number prefix?
**Size:** small
**Verification:** `expect(marker.role).toBe('test-arch')` for each.

---

### T-0670-14: Setup --import detects done from response.md

**Flow:** Create agent with `prompt.md` + `response.md` → setup --import → marker has `done: true`. Create agent with only `prompt.md` → marker has `done: false`.
**Subsystems:** CLI
**Expected:** response.md presence → `done: true`. Absence → `done: false`.
**Likely to break:** Wrong file check path. Case sensitivity.
**Size:** small
**Verification:** `expect(doneAgent.done).toBe(true)`. `expect(notDoneAgent.done).toBe(false)`.

---

### T-0670-15: Setup --import skips empty agent dirs

**Flow:** Create agent dir with no files at all (empty) → setup --import → no marker created.
**Subsystems:** CLI
**Expected:** No `.agent.nap.json` in the empty dir.
**Likely to break:** If "empty" check doesn't account for hidden files or placeholder files.
**Size:** small
**Verification:** `expect(fs.existsSync(markerPath)).toBe(false)`.

---

### T-0670-16: Setup --import skips agents with existing markers

**Flow:** Create agent with existing `.agent.nap.json` containing `{ cc_session_uuid: "original-uuid" }` → setup --import → UUID unchanged.
**Subsystems:** CLI
**Expected:** Marker untouched. UUID still "original-uuid".
**Likely to break:** If import overwrites existing markers.
**Size:** small
**Verification:** `expect(marker.cc_session_uuid).toBe('original-uuid')`.

---

### T-0670-17: Setup --import creates architect markers (no napkin field)

**Flow:** Create `20-architects/001-architect/prompt.md` (no marker) → setup --import → marker created without napkin field.
**Subsystems:** CLI
**Expected:** Marker has role, name, nepic, cc_session_uuid, started, done, exited, archived. No `napkin` field.
**Likely to break:** If architect code path reuses agent code without stripping napkin.
**Size:** small
**Verification:** `expect(marker.napkin).toBeUndefined()`. `expect(marker.role).toBe('architect')`.

---

### T-0670-18: Setup --import generates unique UUIDs per agent

**Flow:** Create 3 unmarked agents → setup --import → each gets a different UUID.
**Subsystems:** CLI
**Expected:** All three `cc_session_uuid` values are distinct.
**Likely to break:** If UUID generation is seeded or reused.
**Size:** small
**Verification:** Collect all 3 UUIDs into a Set. `expect(uuids.size).toBe(3)`.

---

### T-0670-19: Setup --import walks multiple nepics

**Flow:** Create project with `nepics/01-v1/` and `nepics/02-v2/`, each with unmarked napkins and agents → setup --import → markers created in both.
**Subsystems:** CLI
**Expected:** Markers in both nepic dirs. Each marker has correct nepic slug.
**Likely to break:** If walk only visits first nepic, or hardcodes "01-v1".
**Size:** small
**Verification:** Verify markers exist in both nepic dirs. `expect(v1Marker.nepic).toBe('01-v1')`. `expect(v2Marker.nepic).toBe('02-v2')`.

---

### T-0670-20: Setup --import never deletes files

**Flow:** Create a project with a stray file in an agent dir (e.g., `scratch.md`) → setup --import → stray file still exists.
**Subsystems:** CLI
**Expected:** All pre-existing files untouched.
**Size:** small
**Verification:** `expect(fs.existsSync(strayFilePath)).toBe(true)`.

---

### T-0670-21: Combined flags — --guardian --skills --import in one call

**Flow:** Create project with unmarked agents → `nap3 setup --guardian --skills --import` → guardian created, skills copied, markers imported.
**Subsystems:** CLI
**Expected:** All three effects happen. No partial failure.
**Likely to break:** Flag parsing. Order of operations (if guardian writes to 20-architects/, does import then try to re-import it?).
**Size:** small
**Verification:** Verify guardian marker, skills dirs, and import markers all exist.

---

### T-0670-22: Setup with no flags → helpful error or no-op

**Flow:** Run `nap3 setup` with no flags.
**Subsystems:** CLI
**Expected:** Either exits with usage/help message, or runs as no-op without error. (Spec doesn't specify — this test documents the chosen behavior.)
**Size:** small
**Verification:** Exit code and stderr checked.

---

### T-0670-23: Setup --import handles agent dir with only response.md (no prompt.md)

**Flow:** Create agent dir with only `response.md` (unusual but possible) → setup --import.
**Subsystems:** CLI
**Expected:** Marker created (dir is not empty — has a file). `done: true` (response.md exists).
**Likely to break:** If "non-empty" check requires prompt.md specifically.
**Size:** small
**Verification:** Marker exists. `expect(marker.done).toBe(true)`.

---

### T-0670-24: Init --guardian uses same logic as setup --guardian

**Flow:** Run `nap3 init --guardian` → verify guardian dir + settings.json match what `nap3 setup --guardian` would produce.
**Subsystems:** CLI
**Expected:** Identical output (same marker structure, same hook config format). Confirms init delegates to shared setup logic.
**Likely to break:** If init has its own copy of guardian creation that diverges.
**Size:** small
**Verification:** Compare marker fields and settings.json structure between both paths.

---

### T-0670-25: Setup --guardian on multi-nepic project uses active nepic

**Flow:** Create project with multiple nepics, active nepic is "02-v2" (from ui-state.json) → setup --guardian → guardian created in `nepics/02-v2/20-architects/`.
**Subsystems:** CLI
**Expected:** Guardian agent in the active nepic, not in all nepics.
**Likely to break:** If setup hardcodes nepic path or picks first nepic instead of active.
**Size:** small
**Verification:** Verify guardian exists in `02-v2`, not in `01-v1`.

---

### T-0670-26: Setup --import role inference edge case — no numeric prefix

**Flow:** Create agent dir named `custom-agent` (no leading digits) → setup --import.
**Subsystems:** CLI
**Expected:** Role should be the full dir name ("custom-agent") or some reasonable fallback. No crash.
**Size:** small
**Verification:** Marker exists. Role is a non-empty string. No throw.

---

### T-0670-27: Medium — imported project loads correctly in Electron app

**Flow:** Create a project manually (napkin dirs, agent dirs with prompt.md/response.md, no markers) → `nap3 setup --import` → launch app → verify model has all napkins and agents.
**Subsystems:** CLI, model, main
**Expected:** App boots. Model shows imported napkins with "backlog" status. Agents visible with correct roles and done status.
**Likely to break:** Marker format subtly incompatible with model loader. Missing required fields.
**Size:** medium
**Verification:** `app.evaluate(() => (global as any).__napModel__.getNapkins())` → array with expected napkins. Each agent has correct role, done status.

---

### T-0670-28: Medium — guardian installed via setup works with permission hook

**Flow:** Create project → setup --guardian → launch app → start agents → send hook-permission-request → guardian gets poked.
**Subsystems:** CLI, model, socket-handler, message-queue
**Expected:** Full permission flow works with setup-installed guardian (same as init --guardian).
**Likely to break:** Guardian marker from setup missing fields that the running model/handler expects.
**Size:** medium
**Verification:** After hook-permission-request, verify guardian's pendingApproval was set and poke was enqueued.

---

### T-0670-29: Setup --import with deeply nested nepic structure

**Flow:** Create `nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/agents/001-test-arch-setup/prompt.md` → setup --import → marker created with correct napkin and nepic slugs.
**Subsystems:** CLI
**Expected:** Napkin slug: "0670-setup-command". Nepic slug: "03-nepic-spaces-v2". Agent name: "001-test-arch-setup". Role: "test-arch-setup".
**Likely to break:** Slug extraction from deeply nested paths. Off-by-one in path segment indexing.
**Size:** small
**Verification:** Parse marker. Verify all slug fields match the directory structure.

---

### T-0670-30: Setup --import concurrent markers have monotonically increasing created_at

**Flow:** Create 5 unmarked agents → setup --import → all markers have created_at timestamps.
**Subsystems:** CLI
**Expected:** All created_at values are valid timestamps (within last few seconds). All are >= previous (monotonically ordered or equal).
**Likely to break:** If Date.now() is called once and reused vs called per marker.
**Size:** small
**Verification:** Collect all created_at values. Verify all are within 10s of `Date.now()`. Verify sorted order.

---

## Priority order for implementation

1. **T-0670-01** — guard clause (blocks everything if wrong)
2. **T-0670-10, 11, 12, 13, 14, 15, 16, 17** — import core logic (most code, most seams)
3. **T-0670-02, 03, 04, 05, 06** — guardian (merge is the real risk)
4. **T-0670-07, 08, 09** — skills (simplest flag)
5. **T-0670-21** — combined flags (integration of all three)
6. **T-0670-18, 19, 20, 23, 26, 29, 30** — edge cases
7. **T-0670-22, 24, 25** — UX and delegation
8. **T-0670-27, 28** — medium tests (verify full cycle)
