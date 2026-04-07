## Test architect response — 0660 raw key sending

### What I read
- Role file, promise, spec, napkin
- All source: socket-handler.ts, message-queue.ts, pty-spawner.ts, node-pty-spawner.ts, name-resolver.ts, nap.ts CLI, protocol.ts, socket-server.ts, bridge.ts
- All test files: socket-handler.test.ts, message-queue.test.ts, name-resolver.test.ts, fixtures.ts, helpers.ts

### Key findings

**Critical interface gap**: `PtySpawner` interface has no `write()` method — it exists only on `NodePtySpawner`. The `key` handler needs this on the interface so it can:
1. Be tested with FakePtySpawner in small tests
2. Be called through the interface in socket-handler.ts (which takes `PtySpawner`, not `NodePtySpawner`)

**Message queue is the anti-pattern for key**: The existing poke path uses `enqueue()` → 3-step delivery (text → Esc 300ms → CR 100ms). Key must bypass this entirely. The test T-0660-30 explicitly guards this seam.

**Named key parser + --seq parser should be pure functions**: Separate from CLI and socket handler so they're testable in isolation. The napkin's suggested test sizes (small: parsing, small: routing, medium: real pty) align well.

### Test design — 14 test cases

- **4 small: parsing** (T-0660-10 through T-0660-13) — named keys, raw text fallthrough, --seq C-style escapes, edge cases
- **3 small: socket handler** (T-0660-20 through T-0660-22) — direct write, name resolution errors, non-running agent
- **1 small: key vs poke** (T-0660-30) — explicit guard that key doesn't use message queue
- **4 small: CLI command** (T-0660-40 through T-0660-43) — named key, --seq, raw text, missing args
- **3 medium: real pty** (T-0660-50 through T-0660-52) — bytes reach pty, timing difference from poke, rapid succession ordering

### Confidence
~85% from small + medium tests. The parsing tests catch the most likely bugs (wrong escape sequences). The socket handler tests guard the critical seam (key ≠ poke path). Medium tests verify the full pipeline works with real pty.

### Open design question
T-0660-22: should `nap3 key` to a non-running agent return an error, or silently no-op? Recommend: error — consistent with `nap3 stop` behavior, and the caller (guardian agent) needs to know the write failed.
