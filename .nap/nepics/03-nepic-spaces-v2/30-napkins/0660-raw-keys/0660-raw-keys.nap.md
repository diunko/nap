* 0660 — raw key sending via CLI

* the problem
  * `nap3 poke` uses three-step delivery (text → Escape → CR)
  * works for CC's main input prompt
  * breaks for other contexts: permission dialogs, Ink TUI menus, raw-mode apps
  * Escape cancels the action after the text is already consumed
  * need a way to send raw bytes / individual keypresses to a pty

* two modes

  * `nap3 poke <name> <message>` — existing, unchanged
    * three-step delivery for CC main input
    * best for: sending text prompts to an agent

  * `nap3 key <name> <key>` — new command
    * sends a single keypress or raw sequence directly to pty
    * no wrapping, no Escape, no CR — just the bytes
    * best for: approving dialogs, navigating menus, sending control sequences

* named keys
  * `nap3 key <name> enter` → \r
  * `nap3 key <name> esc` → \x1b
  * `nap3 key <name> tab` → \t
  * `nap3 key <name> space` → " "
  * `nap3 key <name> backspace` → \x7f
  * `nap3 key <name> up` → \x1b[A
  * `nap3 key <name> down` → \x1b[B
  * `nap3 key <name> left` → \x1b[D
  * `nap3 key <name> right` → \x1b[C
  * `nap3 key <name> ctrl-c` → \x03
  * `nap3 key <name> ctrl-d` → \x04
  * `nap3 key <name> ctrl-z` → \x1a

* raw text (no wrapping)
  * `nap3 key <name> "1"` → sends 0x31 (just the character)
  * `nap3 key <name> "yes"` → sends y, e, s (three bytes)
  * any string not matching a named key → sent as raw bytes

* escape sequences
  * `nap3 key <name> --seq "\x1b[A"` → sends the raw escape sequence
  * for advanced use: arbitrary control codes

* implementation
  * new socket request type: `{ type: "key", name: <agent>, data: <bytes> }`
  * socket handler: resolves agent by name, calls ptySpawner.write(id, data)
  * no message queue — direct write, no delay
  * CLI parses named keys to bytes before sending

* use cases
  * `nap3 key 002-fs-eng "1"` — approve CC permission dialog
  * `nap3 key 002-fs-eng enter` — confirm a prompt
  * `nap3 key 002-fs-eng esc` — cancel/dismiss
  * `nap3 key 002-fs-eng ctrl-c` — interrupt a running command
  * guardian agent uses this to approve agent permission dialogs (fallback path)

* testing
  * small: named key parsing → correct bytes
  * small: socket handler routes key to pty write
  * medium: send key to real CC session → dialog responds
