## 0660 — raw key sending: spec

This spec gives you direction and constraints. Before writing any code, read the existing poke implementation (`packages/v3/src/main/message-queue.ts`, socket handler's poke case in `socket-handler.ts`, CLI poke command in `nap.ts`).

### The problem

`nap3 poke` uses three-step delivery (text → Escape 300ms → CR 100ms). This works for CC's main input but breaks for permission dialogs and other Ink TUI menus — Escape cancels the selection after the text is consumed.

### New command: `nap3 key <name> <key>`

Sends a single keypress or raw sequence directly to the pty. No wrapping, no Escape, no CR.

### Named keys

Map of human-readable names to byte sequences:

| Name | Bytes | Notes |
|------|-------|-------|
| enter | \r | CR |
| esc | \x1b | Escape |
| tab | \t | Tab |
| space | " " | Space |
| backspace | \x7f | DEL |
| up | \x1b[A | Arrow up |
| down | \x1b[B | Arrow down |
| left | \x1b[D | Arrow left |
| right | \x1b[C | Arrow right |
| ctrl-c | \x03 | SIGINT |
| ctrl-d | \x04 | EOF |
| ctrl-z | \x1a | SIGTSTP |

### Raw text

Any argument not matching a named key is sent as raw bytes:
- `nap3 key agent "1"` → sends 0x31
- `nap3 key agent "yes"` → sends y, e, s

### Escape sequences via --seq flag

For arbitrary control codes:
- `nap3 key agent --seq "\x1b[A"` → parses C-style escapes and sends raw bytes
- Parsing: `\x1b` → 0x1B, `\r` → 0x0D, `\n` → 0x0A, `\t` → 0x09, `\\` → 0x5C

### Implementation

- New socket request type: `{ type: "key", name: <agent>, data: <bytes> }`
- Socket handler: resolves agent by name, calls `ptySpawner.write(id, data)` directly
- No message queue — direct write, no delay
- CLI: `nap3 key` command parses named keys / raw text / --seq, sends socket request

### What NOT to do

- Don't change existing `nap3 poke` behavior — it stays as-is
- Don't add this to the message queue — direct write only
