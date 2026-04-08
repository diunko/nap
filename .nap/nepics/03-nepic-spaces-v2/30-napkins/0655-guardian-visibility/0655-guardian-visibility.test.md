# 0655 — Guardian Visibility: Test Design

## The seam

Guardian lives physically in the first nepic's `20-architects/`. When the user switches to a different nepic, `loadFromFilesystem` reloads architects from the new nepic's `20-architects/`. If that directory has no guardian, `findAgentByRole('guardian')` returns null — permission hooks break silently, sidebar loses the purple dot.

The fix adds ~10 lines to `loadFromFilesystem`: after loading architects from the active nepic, check if guardian is missing, and if so, load it from the first nepic. The seam is the boundary between "active nepic" and "first nepic" during architect loading.

---

### T-0655-01: Guardian loaded from first nepic when active nepic differs

**Flow:** Two nepics — guardian in first (01-v1), none in second (02-spaces). Load model from second nepic dir → `getArchitects()` should include the guardian from first nepic.
**Subsystems:** model (loadFromFilesystem)
**Expected:** `getArchitects()` returns both the second nepic's architect AND the guardian. Guardian's `role === 'guardian'`. Guardian's `nepicId === '01-v1'`.
**Likely to break:** If the code doesn't look beyond the active nepic's `20-architects/`. If the first nepic path is computed incorrectly from `nepicList`.
**Size:** small
**Verification:** `expect(model.getArchitects().find(a => a.role === 'guardian')).toBeTruthy()` — loaded from second nepic dir.

---

### T-0655-02: Guardian NOT duplicated when active nepic IS the first nepic

**Flow:** Two nepics — guardian in first (01-v1). Load model from first nepic dir → only one guardian in architects.
**Subsystems:** model (loadFromFilesystem)
**Expected:** `getArchitects().filter(a => a.role === 'guardian')` has length 1. No duplicate.
**Likely to break:** If the "append from first nepic" logic runs even when active === first.
**Size:** small
**Verification:** `expect(model.getArchitects().filter(a => a.role === 'guardian')).toHaveLength(1)`

---

### T-0655-03: No guardian in first nepic → no-op

**Flow:** Two nepics — neither has a guardian. Load from second → architects contain only the architect, no error.
**Subsystems:** model (loadFromFilesystem)
**Expected:** `findAgentByRole('guardian')` returns null. No crash.
**Size:** small
**Verification:** `expect(model.findAgentByRole('guardian')).toBeNull()`

---

### T-0655-04: Guardian exists in BOTH first and active nepic → use active nepic's

**Flow:** Two nepics, both have a guardian agent (different UUIDs). Load from second nepic → architects include the active nepic's guardian, NOT the first nepic's.
**Subsystems:** model (loadFromFilesystem)
**Expected:** Only one guardian. Its `id` matches the active nepic's guardian UUID.
**Likely to break:** If code appends first nepic's guardian without checking whether active already has one.
**Size:** small
**Verification:** `expect(guardians).toHaveLength(1)` and `expect(guardians[0].id).toBe('uuid-active-guardian')`

---

### T-0655-05: Empty nepicList → skip guardian cross-load (guard)

**Flow:** Model loaded with no nepic list (edge case: single nepic, or empty parent dir). Guardian cross-load should not crash.
**Subsystems:** model (loadFromFilesystem)
**Expected:** No error. Guardian loaded normally from active nepic if present, or absent if not.
**Size:** small
**Verification:** No throw. Architects match what's in the single nepic.

---

### T-0655-06: findAgentByRole('guardian') finds cross-loaded guardian

**Flow:** Load from second nepic (guardian in first nepic only) → `findAgentByRole('guardian')` returns the guardian.
**Subsystems:** model (findAgentByRole)
**Expected:** Returns AgentState with `role === 'guardian'` from first nepic.
**Likely to break:** If guardian was appended to a different array than what findAgentByRole searches.
**Size:** small
**Verification:** `expect(model.findAgentByRole('guardian')?.role).toBe('guardian')`

---

### T-0655-07: Cross-loaded guardian survives filesystem reload

**Flow:** Load from second nepic → guardian cross-loaded → trigger filesystem reload (simulated) → guardian still in architects.
**Subsystems:** model (loadFromFilesystem, ephemeral state)
**Expected:** After reload, guardian still present. `findAgentByRole('guardian')` still returns it.
**Likely to break:** If cross-load logic only runs on initial load, not on watcher-triggered reloads.
**Size:** small
**Verification:** Call `loadFromFilesystem` again, verify guardian still present.

---

### T-0655-08: Cross-loaded guardian preserves ephemeral flags across reload

**Flow:** Load from second nepic → guardian cross-loaded → set guardian as running + set pendingApproval → trigger reload → ephemeral flags still set.
**Subsystems:** model (loadFromFilesystem, ephemeral state sets)
**Expected:** After reload, guardian's `running === true`, `pendingApproval !== null`.
**Likely to break:** If the ephemeral restoration loop (`runningAgents`, `pendingApprovals`) doesn't match the cross-loaded guardian's ID.
**Size:** small
**Verification:** `expect(guardian.running).toBe(true)` and `expect(guardian.pendingApproval).toBeTruthy()` after reload.

---

### T-0655-09: Nepic switch — guardian visible before AND after switch

**Flow:** Start on first nepic (guardian loaded locally) → switch to second nepic → guardian still in architects. Switch back to first → guardian still there, no duplication.
**Subsystems:** model (switchNepic, loadFromFilesystem)
**Expected:** `findAgentByRole('guardian')` returns non-null in all three states. No duplicate guardians at any point.
**Likely to break:** If switchNepic clears state without re-running cross-load logic.
**Size:** small
**Verification:** Three sequential checks: guardian found on nepic 1, found on nepic 2, found again on nepic 1. Count never exceeds 1.

---

### T-0655-10: Guardian's nepicId reflects its home nepic, not the active one

**Flow:** Load from second nepic → cross-loaded guardian → check its nepicId.
**Subsystems:** model (loadFromFilesystem)
**Expected:** `guardian.nepicId === '01-v1'` (the first nepic), not the active nepic.
**Likely to break:** If the guardian's marker has no nepic field and defaults to the current active nepic ID.
**Size:** small
**Verification:** `expect(guardian.nepicId).toBe('01-v1')`

---

### T-0655-11: Guardian homePath points to first nepic's directory

**Flow:** Load from second nepic → cross-loaded guardian → check homePath.
**Subsystems:** model (loadFromFilesystem)
**Expected:** `guardian.homePath` starts with the first nepic's path, not the active nepic's.
**Likely to break:** If homePath is constructed relative to active nepic dir.
**Size:** small
**Verification:** `expect(guardian.homePath).toContain('01-v1/20-architects/002-guardian')`

---

### T-0655-12: Permission hook + cross-loaded guardian — poke reaches guardian

**Flow:** Model on second nepic with cross-loaded guardian (running). Send `hook-permission-request` via socket → guardian gets poked.
**Subsystems:** socket-handler, model, message-queue
**Expected:** `enqueue()` called with guardian's ID and structured permission request message.
**Likely to break:** If handler's `findAgentByRole('guardian')` returns null because cross-load didn't happen.
**Size:** small
**Verification:** Spy on `enqueue()` → called with guardian ID. Same pattern as T-0650-09 but loaded from different nepic.

---

### T-0655-13: Cross-loaded guardian's entries populated (file tree)

**Flow:** Load from second nepic → guardian cross-loaded → check guardian's `entries` field.
**Subsystems:** model (loadFromFilesystem, readEntries)
**Expected:** Guardian's `entries` array is populated (prompt.md, etc.), not empty.
**Likely to break:** If cross-load creates a minimal AgentState without reading the directory.
**Size:** small
**Verification:** `expect(guardian.entries.length).toBeGreaterThan(0)`

---

### T-0655-14: Three nepics — guardian always from first regardless of which is active

**Flow:** Three nepics (01, 02, 03). Guardian in 01 only. Load from 03 → guardian present. Load from 02 → guardian present. Both have same ID.
**Subsystems:** model (loadFromFilesystem)
**Expected:** Guardian found with same ID regardless of which non-first nepic is active.
**Size:** small
**Verification:** Load from nepic 03, save guardian ID. Switch to nepic 02, verify same guardian ID.

---

### T-0655-15: Medium — sidebar shows guardian dot after nepic switch

**Flow:** Launch Electron app with multi-nepic fixture (guardian in first). Switch to second nepic. Verify sidebar renders guardian dot.
**Subsystems:** main, renderer (Sidebar), model
**Expected:** Guardian dot visible in sidebar after nepic switch. Purple color distinguishes it.
**Likely to break:** If snapshot sent to renderer after switch doesn't include the cross-loaded guardian.
**Size:** medium
**Verification:** `page.evaluate(() => document.querySelectorAll('[data-agent-role="guardian"]').length)` → 1.

---

### T-0655-16: Medium — guardian terminal accessible from non-home nepic

**Flow:** Launch app → switch to second nepic → click guardian in sidebar → guardian's terminal visible with scrollback.
**Subsystems:** renderer (Terminal, Sidebar), pty
**Expected:** Guardian's terminal is reachable and shows its session. No "terminal not found" error.
**Likely to break:** If terminal registry only tracks agents from the active nepic.
**Size:** medium
**Verification:** `page.evaluate(() => document.querySelector('[data-terminal-id="uuid-guardian"]'))` is truthy after switching to guardian.

---

### T-0655-17: Medium — guardian permission cycle works from non-home nepic

**Flow:** Launch app on nepic 02. Agent on nepic 02 triggers permission request → hook fires → guardian (from nepic 01) gets poked → guardian resolves → hook unblocks.
**Subsystems:** socket-handler, model, message-queue, CLI
**Expected:** Full permission cycle identical to being on nepic 01. No difference in behavior.
**Likely to break:** If any step in the permission flow uses nepicId to route and fails for cross-nepic guardian.
**Size:** medium
**Verification:** Same as T-0650-19 but with multi-nepic fixture. Hook connection resolves with `{ decision: "allow" }`.
