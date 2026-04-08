## 0710 — nap3 doctor: spec

This spec gives you direction and constraints. Before writing any code, study how `nap3 dev` and `nap3 open` resolve paths to the nap repo — the doctor uses the same pattern.

### What to build

A `doctor` command in the CLI that spawns claude with a diagnostic prompt assembled at runtime from two template files. No socket, no running app, no build step.

### How path resolution works

The CLI needs to find two things:

1. **Project root** — walk up from cwd looking for `.nap/` (same as `nap3 open`)
2. **Nap repo root** — walk up from `__dirname` (the CLI's own location) to find `src/templates/` (same pattern as `nap3 dev` finding electron)

Study `packages/v3/src/cli/nap.ts` — look at how `findTemplatesDir()` and the `open`/`dev` commands resolve paths. Use the same approach.

### Prompt assembly

Read two files at runtime:

1. `<nap-repo>/src/templates/doctor/diagnostic.md` — the framing, diagnostic phases, report format
2. `<nap-repo>/src/templates/00-org/50-internals.md` — the full system anatomy

Combine them:

```
<diagnostic.md content up to the "---" separator after the preamble>

## System anatomy

<50-internals.md content, starting from "## The two states">

---

<rest of diagnostic.md — the diagnostic phases and report format>
```

The exact split point in diagnostic.md: everything before "## Your diagnostic process" is the preamble. Insert internals between the preamble and the diagnostic process.

### Spawning claude

```bash
claude --verbose "<combined-prompt>" --cwd <project-root>
```

Not detached — runs in the current terminal. The user watches claude work and reads the report directly.

If `--cwd` is not supported as a claude flag, just spawn from the project root directory.

### Error cases

- No `.nap/` found walking up → print error: "Not a NAP project. Run `nap3 init` to create one." Exit 1.
- Template files not found → print error: "Could not find nap templates at <path>. Is nap3 installed correctly?" Exit 1.
- `claude` not on PATH → let it fail naturally (user will see "command not found")

### Flags

- `nap3 doctor` — run diagnostic
- `nap3 doctor --help` — show usage

No `--fix` flag for now. Diagnosis only. Fix can be a follow-up.

### Testing

Small tests only. The doctor is thin glue — path resolution, file reading, string concatenation, spawn. No medium tests needed.

**Small tests:**
- Path resolution: given a mock directory structure, does `findTemplatesDir` resolve correctly?
- Prompt assembly: given two real template files, does concatenation produce the expected structure (preamble → internals → diagnostic phases)?
- Error handling: no `.nap/` → correct error message
- Error handling: missing template files → correct error message

### What NOT to do

- Don't embed the prompt at build time — read files at runtime
- Don't require the app to be running
- Don't modify any project files
- Don't add a `--fix` flag yet
