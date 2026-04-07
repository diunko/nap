## 0660 — raw key sending: test cases

### Fixtures

**F20: key parsing fixture** — no filesystem, pure data
- Named key map: `{ enter: '\r', esc: '\x1b', tab: '\t', space: ' ', backspace: '\x7f', up: '\x1b[A', down: '\x1b[B', left: '\x1b[D', right: '\x1b[C', 'ctrl-c': '\x03', 'ctrl-d': '\x04', 'ctrl-z': '\x1a' }`

**F10** — existing CLI integration fixture (reuse for socket handler tests)

---

### T-0660-10: named key parsing — each name maps to correct bytes
- **Flow**: parse each named key string → byte sequence
- **Subsystems**: key parser (new pure function)
- **Expected**: every entry in the named key map produces exact bytes per spec
- **Breaks if**: typo in escape sequences (e.g., `\x1b[D` vs `\x1b[C` for left/right), missing entry, case sensitivity
- **Size**: small
- **Verification**: `expect(parseKey('enter')).toBe('\r')`, `expect(parseKey('up')).toBe('\x1b[A')`, etc. — exhaustive for all 12 named keys

### T-0660-11: unknown name falls through to raw text
- **Flow**: parse a string that doesn't match any named key → returns raw bytes
- **Subsystems**: key parser
- **Expected**: `parseKey('1')` → `'1'` (0x31), `parseKey('yes')` → `'yes'` (three bytes), `parseKey('hello world')` → `'hello world'`
- **Breaks if**: parser throws on unknown keys instead of passing through, or wraps/escapes the text
- **Size**: small
- **Verification**: `expect(parseKey('1')).toBe('1')`, `expect(parseKey('yes')).toBe('yes')`

### T-0660-12: --seq flag parses C-style escape sequences
- **Flow**: parse `--seq` value with C-style escapes → raw bytes
- **Subsystems**: escape sequence parser (new pure function)
- **Expected**:
  - `\x1b` → 0x1B (ESC)
  - `\r` → 0x0D (CR)
  - `\n` → 0x0A (LF)
  - `\t` → 0x09 (TAB)
  - `\\` → 0x5C (literal backslash)
  - `\x1b[A` → ESC + `[` + `A` (3 bytes, arrow up)
- **Breaks if**: hex parsing wrong (e.g., `\x1b` parsed as literal string), `\\` not unescaped, incomplete `\x` at end of string
- **Size**: small
- **Verification**: `expect(parseSeq('\\x1b')).toBe('\x1b')`, `expect(parseSeq('\\x1b[A')).toBe('\x1b[A')`, `expect(parseSeq('\\\\'))`→ `'\\'`

### T-0660-13: --seq with edge cases
- **Flow**: parse degenerate --seq inputs
- **Subsystems**: escape sequence parser
- **Expected**:
  - empty string → empty string
  - plain text (no escapes) → passed through verbatim
  - trailing `\x` with < 2 hex chars → treated as literal or error (define behavior)
  - mixed: `hello\r\n` → `hello` + 0x0D + 0x0A
- **Breaks if**: parser crashes on edge cases, or silently drops characters
- **Size**: small
- **Verification**: assert byte-level equality

---

### T-0660-20: socket handler `key` → direct pty write (bypasses message queue)
- **Flow**: send `{ type: "key", name: "001-test-arch", data: "\r" }` → handler resolves agent → calls `ptySpawner.write(id, data)` directly
- **Subsystems**: socket-handler, name-resolver, pty-spawner
- **Expected**: data arrives at pty write immediately, no Escape or CR appended, no message queue involvement
- **Breaks if**: handler uses `enqueue()` instead of direct write, or appends Escape/CR like poke does
- **Size**: small
- **Verification**: add `write` method to FakePtySpawner that records calls. Assert `writes === [{ id: 'uuid-ta', data: '\r' }]`. Assert message queue `enqueue` was NOT called.
- **Implementation note**: `PtySpawner` interface needs `write(id, data)` added — currently only on `NodePtySpawner`. FakePtySpawner needs a `writes: Array<{id, data}>` recorder.

### T-0660-21: socket handler `key` with unknown agent → error with suggestions
- **Flow**: send `{ type: "key", name: "test-arch", data: "\r" }` (no matching exact name)
- **Subsystems**: socket-handler, name-resolver
- **Expected**: error response with "no agent named" and "did you mean" suggestions (same behavior as poke/stop)
- **Breaks if**: name resolution not wired up, or different error format than other commands
- **Size**: small
- **Verification**: `expect(res.error).toBe(true)`, `expect(res.message).toContain('did you mean')`

### T-0660-22: socket handler `key` to non-running agent
- **Flow**: send `{ type: "key", name: "001-fs-eng", data: "\r" }` where agent exists but hasn't been started
- **Subsystems**: socket-handler, pty-spawner
- **Expected**: write still goes through (ptySpawner.write on a non-existent process is a no-op in NodePtySpawner), or error if we decide to guard this
- **Breaks if**: crashes when writing to non-running pty, or blocks
- **Size**: small
- **Verification**: assert no crash, check return value
- **Design decision needed**: should `key` to a non-running agent error, or silently no-op?

---

### T-0660-30: key vs poke — key has no 3-step delivery
- **Flow**: send key "1" and poke "1" to same agent, observe what gets written to pty
- **Subsystems**: socket-handler, message-queue, pty-spawner
- **Expected**:
  - key: pty receives exactly `"1"` (1 byte)
  - poke: pty receives `"1"` + `\x1b` + `\r` (3 writes with delays)
- **Breaks if**: key accidentally goes through message queue
- **Size**: small
- **Verification**: compare recorded writes from FakePtySpawner for both code paths

---

### T-0660-40: CLI `nap3 key` parses named key and sends correct socket request
- **Flow**: `nap3 key 002-fs-eng enter` → CLI resolves "enter" to `\r` → sends `{ type: "key", name: "002-fs-eng", data: "\r" }`
- **Subsystems**: CLI arg parser, key parser, socket client
- **Expected**: socket receives correct request type and pre-resolved bytes
- **Breaks if**: CLI sends the string "enter" instead of `\r`, or sends as `type: "poke"`
- **Size**: small (unit test for CLI command building) or medium (if testing through real socket)
- **Verification**: mock or intercept the socket `send()`, assert request shape

### T-0660-41: CLI `nap3 key` with --seq flag
- **Flow**: `nap3 key 002-fs-eng --seq "\x1b[A"` → CLI parses escapes → sends `{ type: "key", data: "\x1b[A" }`
- **Subsystems**: CLI arg parser, escape parser, socket client
- **Expected**: --seq value is C-style parsed before sending
- **Breaks if**: --seq value sent as literal string, or flag not recognized
- **Size**: small
- **Verification**: assert socket request data is `\x1b[A` (3 bytes), not `\\x1b[A` (6 chars)

### T-0660-42: CLI `nap3 key` with raw text (no named key match)
- **Flow**: `nap3 key 002-fs-eng "1"` → CLI passes through as raw text → sends `{ type: "key", data: "1" }`
- **Subsystems**: CLI arg parser, key parser
- **Expected**: non-named-key string sent verbatim
- **Breaks if**: CLI throws error for unknown key name
- **Size**: small
- **Verification**: assert socket request data is `"1"`

### T-0660-43: CLI `nap3 key` with no arguments → usage error
- **Flow**: `nap3 key` or `nap3 key agent-name` (missing key arg)
- **Subsystems**: CLI arg parser
- **Expected**: stderr with usage message, exit code 1
- **Breaks if**: silent failure, or crash with unhandled exception
- **Size**: small
- **Verification**: `expect(stderr).toContain('Usage:')`, `expect(exitCode).toBe(1)`

---

### T-0660-50: medium — key reaches real pty stdin
- **Flow**: launch Electron app with F10 fixture → start agent (cat process in test mode) → send key via socket → read pty output
- **Subsystems**: full pipeline: socket → handler → NodePtySpawner.write → pty stdin → pty stdout (cat echoes)
- **Expected**: key data appears in pty output (cat echoes stdin to stdout)
- **Breaks if**: write method doesn't reach pty process, IPC breaks, pty closed before write
- **Size**: medium (Playwright + Electron)
- **Verification**: `app.evaluate()` to send key request, then read terminal output buffer — verify sent bytes appear

### T-0660-51: medium — key vs poke timing
- **Flow**: start agent → send key "x" and poke "x" → measure when bytes appear in pty output
- **Subsystems**: socket-handler, message-queue, NodePtySpawner
- **Expected**: key write appears immediately (< 50ms), poke's CR appears after ~400ms (300ms Esc delay + 100ms CR delay)
- **Breaks if**: key routed through message queue, or timing constants changed
- **Size**: medium
- **Verification**: `performance.now()` before and after, or compare output buffer snapshots at different time points

### T-0660-52: medium — multiple keys in rapid succession
- **Flow**: send 5 keys rapidly (e.g., arrow keys for menu navigation) → all arrive in order
- **Subsystems**: socket-handler, NodePtySpawner
- **Expected**: all 5 writes arrive at pty in order, no drops, no batching delay
- **Breaks if**: writes get queued or reordered, socket handler serializes requests with delay
- **Size**: medium
- **Verification**: read pty output, verify all 5 key sequences present in correct order

---

### Seam map

| Seam | What breaks | Test |
|------|-------------|------|
| Named key map → bytes | Wrong escape sequence for arrow keys, ctrl chars | T-0660-10 |
| Unknown key → raw passthrough | Parser rejects non-named strings | T-0660-11 |
| --seq → C-style unescape | Hex parsing, backslash handling | T-0660-12, T-0660-13 |
| Handler key case → ptySpawner.write | Goes through MQ instead, appends Esc/CR | T-0660-20, T-0660-30 |
| Name resolver for key | Different error path than poke/stop | T-0660-21 |
| PtySpawner.write interface gap | FakePtySpawner lacks write(), tests pass but production breaks | T-0660-20 note |
| CLI key parsing → socket request | Sends "enter" string instead of \r bytes | T-0660-40 |
| CLI --seq parsing before send | Sends literal \x1b instead of ESC byte | T-0660-41 |
| Direct write vs 3-step delivery | Wrong code path chosen | T-0660-30, T-0660-51 |
| Rapid key writes → ordering | Socket handler serialization | T-0660-52 |

### Implementation notes for engineers

1. **PtySpawner interface must gain `write(id: string, data: string): void`** — currently only on `NodePtySpawner`. Without this, socket-handler can't call write through the interface, and FakePtySpawner can't record writes for testing.

2. **FakePtySpawner needs a `writes` recorder** — `writes: Array<{id: string, data: string}> = []` and `write(id, data) { this.writes.push({id, data}); }`.

3. **Named key parser and --seq parser should be pure exported functions** — easy to test in small tests, no I/O dependencies.

4. **Socket handler key case pattern** — follow existing poke case structure: resolve name → act → return `{ id: reqId }`. But call `ptySpawner.write()` instead of `enqueue()`.
