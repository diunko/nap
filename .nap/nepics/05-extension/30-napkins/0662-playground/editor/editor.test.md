# monaco command — test architecture

## What's already tested (don't re-test)

* openDoc, pinTab, pinActiveEphemeral — IS-01c, IS-01g in store.test.ts
* activeSurface switching — IS-03 in store.test.ts, IM-08 in Playwright
* auto-save flow — IM-03 in Playwright
* defineCommand/shell execution — covered by git-command usage

## What's new

Two seams:

1. **Path resolution** — relative to cwd, absolute pass-through, `..` normalization
2. **Command dispatch** — args parsing (--help, no args, file arg), existence check, store calls (openDoc + pinActiveEphemeral + setActiveSurface)

The path resolution uses `resolvePath` from fs-adapter.ts (already exists). The new code is: argument parsing, existence check, and wiring three store calls together.

---

## Small tests (vitest)

### MC-S01: relative path resolved against cwd

* flow: `makeMonacoCommand(store, adapter)` → call with `args: ['playground.yaml'], ctx: { cwd: '/home/user' }`
* subsystems: path resolution, adapter.exists
* expected: adapter.exists called with `/home/user/playground.yaml`, store.openDoc called with same path
* breaks: path joined without `/`, or cwd not used
* verification: mock adapter.exists → true, mock store, assert openDoc received `/home/user/playground.yaml`

### MC-S02: absolute path used as-is

* flow: args `['/home/user/nap-repo/file.md']`, cwd `/home/user`
* subsystems: path resolution
* expected: adapter.exists called with `/home/user/nap-repo/file.md` — cwd ignored
* breaks: absolute path prepended with cwd, double `/home/user`
* verification: mock adapter.exists → true, assert openDoc path starts with `/home/user/nap-repo`

### MC-S03: `..` in relative path

* flow: args `['../other/file.md']`, cwd `/home/user/repo`
* subsystems: normalizePath via resolvePath
* expected: resolved to `/home/user/other/file.md`
* breaks: `..` not collapsed, literal `..` in path
* verification: assert openDoc received `/home/user/other/file.md`

### MC-S04: file doesn't exist → error, no tab

* flow: args `['nonexistent.yaml']`, adapter.exists → false
* subsystems: existence check, error path
* expected: `{ stderr: 'monaco: nonexistent.yaml: no such file\n', exitCode: 1 }`, openDoc NOT called
* breaks: exists check skipped, tab opened for missing file
* verification: assert openDoc not called, assert stderr contains filename, exitCode is 1

### MC-S05: --help flag

* flow: args `['--help']`
* subsystems: args parsing
* expected: `{ stdout: 'usage: monaco <file>...', exitCode: 0 }`, no store calls
* breaks: --help triggers file open instead of help text
* verification: assert stdout contains 'usage', openDoc not called

### MC-S06: no args → same as --help

* flow: args `[]`
* subsystems: args parsing
* expected: same output as --help
* breaks: empty args causes index-out-of-bounds or opens undefined path
* verification: assert stdout matches --help output

### MC-S07: successful open → permanent tab + editor surface

* flow: args `['file.md']`, adapter.exists → true
* subsystems: store.openDoc, store.pinActiveEphemeral, store.setActiveSurface
* expected: all three store methods called in order: openDoc(path), pinActiveEphemeral(), setActiveSurface('editor')
* breaks: tab left ephemeral (missing pin call), surface not switched (user stays on terminal)
* verification: mock store with spies, assert call order and arguments

### MC-S08: return value on success

* flow: args `['file.md']`, adapter.exists → true
* subsystems: command return shape
* expected: `{ stdout: '', stderr: '', exitCode: 0 }`
* breaks: non-zero exit code on success, or unexpected stdout
* verification: assert exact return value

---

## Medium tests (Playwright)

### MC-M01: `monaco` opens file from terminal

* flow: boot panel → clone repo → cd into repo → type `monaco <known-file>` in terminal → editor tab appears with file content → tab is permanent (not italic)
* subsystems: terminal shell → defineCommand → path resolution → adapter.exists → store.openDoc → pinActiveEphemeral → setActiveSurface → Monaco editor render
* expected: editor surface visible, file content in view-lines, tab label shows filename, tab is not ephemeral (no italic styling)
* breaks: command not registered with shell, store not injected, surface doesn't switch, file not readable
* verification: DOM assertions — editor surface visible, tab label matches filename, view-lines contain file text, tab has non-italic font-style

### MC-M02: `monaco nonexistent` shows error in terminal

* flow: type `monaco doesnt-exist.txt` in terminal
* subsystems: command → exists check → stderr output
* expected: terminal shows error text containing "no such file", no editor tab opened
* breaks: error not rendered in terminal, or tab opened despite missing file
* verification: terminal output contains "no such file", no new tab in tab bar

---

## Test count

* 8 small (vitest) — pure logic, mock store + adapter, no browser
* 2 medium (Playwright) — real shell, real editor, real DOM

## What these tests DON'T cover (and why)

* Monaco syntax highlighting for opened files — not our code
* Tab reuse when file already open — already tested in IS-01 (store.test.ts, openDoc upserts)
* Surface switch animation — already tested in IM-08
* `defineCommand` registration itself — framework code (just-bash), tested by git-command working
