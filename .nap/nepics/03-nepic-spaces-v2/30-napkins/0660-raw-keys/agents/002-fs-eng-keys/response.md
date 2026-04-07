## 0660 — fs-eng response

### What was built

**New file: `packages/v3/src/main/key-parser.ts`**
- `parseKey(name)` — maps named keys (enter, esc, tab, space, backspace, up, down, left, right, ctrl-c, ctrl-d, ctrl-z) to their byte sequences. Case-insensitive. Unknown names pass through as raw text.
- `parseSeq(input)` — parses C-style escape sequences (`\x1b`, `\r`, `\n`, `\t`, `\\`). Incomplete/invalid `\x` passes through as literal. Unknown escapes pass through verbatim.

**Modified: `packages/v3/src/main/pty-spawner.ts`**
- Added `write(id: string, data: string): void` to the `PtySpawner` interface
- Added `writes: { id: string; data: string }[]` recorder and `write()` method to `FakePtySpawner`

**Modified: `packages/v3/src/main/socket-handler.ts`**
- Added `key` case: resolves agent by name (same pattern as poke/stop), calls `ptySpawner.write()` directly — no message queue, no Escape/CR wrapping

**Modified: `packages/v3/src/shared/protocol.ts`**
- Added `KeyRequest` type to the union

**Modified: `packages/v3/src/cli/nap.ts`**
- Added `nap3 key <name> <key> [--seq <value>]` command
- CLI resolves named keys / --seq before sending to socket — socket receives pre-parsed bytes
- Usage error if missing args

**New file: `packages/v3/tests/key-parser.test.ts`**
- 26 tests: all 12 named keys, case insensitivity, raw passthrough, C-style escape parsing, edge cases (empty string, trailing \x, mixed text+escapes)

**Modified: `packages/v3/tests/socket-handler.test.ts`**
- 3 new tests: key → direct pty write, unknown agent → error with suggestions, key sends exact bytes (no wrapping)

### Decisions

1. **Design decision T-0660-22** (key to non-running agent): The `write()` call on `NodePtySpawner` is a no-op when the process doesn't exist (`.get(id)?.write(data)` — optional chaining). No error thrown. This matches the existing pattern where `kill()` on a non-running pty is also a no-op.

2. **Incomplete `\x` in parseSeq**: Treated as literal `\x` (pass-through), not an error. Keeps the parser fault-tolerant.

3. **Unknown escape sequences**: `\q` → literal `\q`. Consistent with "don't crash on unexpected input."

### Test coverage for TE

All seams are exposed and testable:
- `parseKey` and `parseSeq` are pure exported functions — direct unit testing
- `FakePtySpawner.writes` records all direct writes — no mock setup needed
- Socket handler `key` case follows same pattern as poke/stop — TE can reuse existing F10 fixture
- CLI key command can be tested via `execNap('key ...')` against a real socket server

### All tests pass

- 206 tests across 17 files
- `tsc --noEmit` — zero type errors
