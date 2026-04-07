## Test engineer response — 0660 raw key sending

### Summary

All 14 test cases from the TA's spec implemented and passing. Zero bugs found. Zero type errors.

### Test inventory

| Test | Size | Status | File |
|------|------|--------|------|
| T-0660-10 | small | pass (12 subtests) | key-parser.test.ts (fs-eng's) |
| T-0660-11 | small | pass (3 subtests) | key-parser.test.ts (fs-eng's) |
| T-0660-12 | small | pass (6 subtests) | key-parser.test.ts (fs-eng's) |
| T-0660-13 | small | pass (4 subtests) | key-parser.test.ts (fs-eng's) |
| T-0660-20 | small | pass | socket-handler.test.ts (added enqueue spy) |
| T-0660-21 | small | pass | socket-handler.test.ts (fs-eng's) |
| T-0660-22 | small | pass | socket-handler.test.ts (new) |
| T-0660-30 | small | pass | socket-handler.test.ts (new — full key vs poke comparison) |
| T-0660-40 | small | pass (2 subtests) | key-cli.test.ts (new) |
| T-0660-41 | small | pass (2 subtests) | key-cli.test.ts (new) |
| T-0660-42 | small | pass (2 subtests) | key-cli.test.ts (new) |
| T-0660-43 | small | pass (5 subtests) | key-cli.test.ts (new) |
| T-0660-50 | medium | pass | key-medium.spec.ts (new) |
| T-0660-51 | medium | pass | key-medium.spec.ts (new) |
| T-0660-52 | medium | pass | key-medium.spec.ts (new) |

### What I wrote

**New file: `packages/v3/tests/key-cli.test.ts`** (11 tests)
- T-0660-40: Named key resolution — verifies CLI resolves "enter" to `\r` before sending, not the string "enter". All 12 named keys checked.
- T-0660-41: `--seq` parsing — verifies `\x1b[A` becomes 3 bytes (ESC + [ + A), not the 6-char literal.
- T-0660-42: Raw text passthrough — "1" and "yes" sent verbatim.
- T-0660-43: Missing args guard — 5 tests covering the `!args[0] || (!args[1] && !seqValue)` condition in both error and valid cases.

**New file: `packages/v3/tests/key-medium.spec.ts`** (3 tests)
- T-0660-50: Creates agent, sends key "X" and enter via socket to real pty (cat in test mode). Both succeed.
- T-0660-51: Key response returns in <100ms (direct write). Poke also returns fast (enqueue is async), but delivery has 300ms+100ms delays.
- T-0660-52: 5 rapid keys (a,b,c,d,e) sent in parallel — all 5 succeed with no errors.

**Modified: `packages/v3/tests/socket-handler.test.ts`** (+3 tests)
- T-0660-20 (extended): Added `vi.spyOn(mq, 'enqueue')` assertion — verifies key handler does NOT call enqueue. The fs-eng's existing test checked ptySpawner.writes but didn't verify the MQ bypass.
- T-0660-22: Key to non-running agent (001-fs-eng with started=false). No crash, no error.
- T-0660-30 (full): Side-by-side key vs poke comparison. Key → 1 direct write of "1". Poke → enqueue called, zero direct writes.

### What I didn't change

- T-0660-10 through T-0660-13: fs-eng's 26 tests in key-parser.test.ts cover the TA's spec accurately. I verified every assertion matches the spec's expected values. No changes needed.
- T-0660-21: fs-eng's test covers this correctly.

### Design decision: T-0660-22

The fs-eng decided: `write()` on a non-running pty is a no-op (optional chaining: `processes.get(id)?.write(data)`). FakePtySpawner records the write regardless. The socket handler returns success. This is consistent with how `kill()` handles non-running ptys. Test confirms: no crash, no error.

### Bugs found

None. All seams hold.

### Final numbers

- 220 small tests, 38 medium tests — all passing
- `tsc --noEmit` — zero type errors
