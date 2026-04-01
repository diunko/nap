# Workflow

## Where things live

Napkins live in `30-napkins/` and never move. That's the canonical path — all references point there. Status is tracked separately via symlinks in `40-board/`.

```
30-napkins/
  0100-feature/          ← canonical, never moves
    0100-feature.nap.md
    0100-feature.spec.md
    0100-feature.journeys.md
    0100-feature.test.md
    agents/
      001-test-arch-feature/
        prompt.md
        response.md
      002-fs-eng-feature/
        prompt.md
        response.md
      003-test-eng-feature/
        prompt.md
        response.md

40-board/
  10-draft/
  20-backlog/
  30-todo/
  40-doing/
    0100-feature → ../../30-napkins/0100-feature   (symlink)
  50-review/
  60-done/
```

## Status transitions

Moving a symlink IS the status change. The canonical path never breaks.

```bash
# napkin shaped, ready for backlog
ln -s ../../30-napkins/0100-feature 40-board/20-backlog/0100-feature

# scheduled for implementation
rm 40-board/20-backlog/0100-feature
ln -s ../../30-napkins/0100-feature 40-board/30-todo/0100-feature

# agents launched
rm 40-board/30-todo/0100-feature
ln -s ../../30-napkins/0100-feature 40-board/40-doing/0100-feature

# agents done, ready for review
rm 40-board/40-doing/0100-feature
ln -s ../../30-napkins/0100-feature 40-board/50-review/0100-feature

# human approves
rm 40-board/50-review/0100-feature
ln -s ../../30-napkins/0100-feature 40-board/60-done/0100-feature
```

**Who moves symlinks:** the architect, as part of the workflow. When SQLite lands (M1), the app automates this.

## The happy path

### 1. Napkin → spec (architect + human)

Architect reads the napkin. Writes:
- `NNNN-feature.spec.md` — min spec, only constraints the implementer can't derive
- `NNNN-feature.journeys.md` — concrete developer/user journeys

### 2. Spec → test architecture (test-architect agent)

Test architect reads spec + journeys. Writes:
- `NNNN-feature.test.md` — strategic test cases focused on integration seams

Launched by architect via `nap start`. Gets its own context window.

### 3. Code (fullstack-eng agent)

Reads spec + test.md. Writes code shaped so the tests are possible — proper APIs, module boundaries, injectable dependencies.

Also builds test infrastructure: fakes (FakeFileSystem, FakePtySpawner, FakeBridge), fixture helpers, test utility functions. These are architecture, not tests — they enable the TE to write tests without building plumbing.

May write a few smoke tests to validate own work during development. But the full test suite is the TE's job. The TA's test spec is a contract — the fs-eng builds code that makes those tests possible, the TE implements them.

### 4. Tests (test-eng agent)

Reads test.md + the code + the fs-eng's test infrastructure. Implements ALL test cases from the TA's spec — both small (vitest) and medium (Playwright). The TA's spec is a contract, not a menu.

The TE validates the code with fresh eyes. They didn't build it — they test it. If the code doesn't match what the TA spec'd, they find the gap. If the fs-eng's API is hard to test, that's a signal.

The TE implements tests independently. They don't ask the fs-eng "how should I test this?" — they read the TA's cases and figure it out from the code. Inconsistencies found this way are real bugs.

### 5. Iterate

Test eng reports failures → fullstack eng fixes → test eng re-runs. Loop until green.

## IMPORTANT: Two ways to use agents

**Research (Claude Code internal Explore agent):**
- Use for one-off codebase questions, finding code, quick investigations
- The report comes back into YOUR context — fast, lightweight
- Use freely — this is like googling something or checking docs
- Example: "find all files that import session-store" or "how does the pty lifecycle work?"

**Work (NAP agents via `nap start`):**
- Use for EVERYTHING that produces artifacts — implementation, test writing, design exploration
- Creates a full Claude Code session in its own terminal
- The human can watch, talk to, steer — full visibility
- **ALWAYS use this for anything beyond research**
- Example: writing code, running tests, building mocks, fixing bugs

The difference: research is a quick round-trip inside your head. Work creates a teammate the human can see.

## Launching agents

Every agent is a full Claude Code session in its own terminal. Not a subagent buried inside another session. The human can click on any agent in the sidebar, watch it work, talk to it, invoke skills — full Claude Code capabilities.

Each agent gets a directory inside the napkin:

```
30-napkins/0100-feature/agents/
  001-test-arch-feature/
    prompt.md          ← architect writes
    response.md        ← agent writes when done
```

Architect launches via NAP CLI:

```bash
nap start claude "read .nap/.../001-test-arch-feature/prompt.md and follow its instructions" \
  --name 001-test-arch-feature --napkin 0100-feature --role test-arch
```

Flags:
- `claude` as first arg → Claude session (auto-injects --verbose --session-id, resumable)
- `--name` → display name in sidebar
- `--napkin <slug>` → ties agent to napkin, sets homeDir to `agents/<name>/`
- `--role <role>` → metadata (architect, test-arch, fs-eng, test-eng)
- `--dir <path>` → explicit home directory (overrides convention)

This spawns a real Claude Code session in a real terminal. The agent appears in the sidebar with a green dot. The human can click it and watch it think.

Architect waits:

```bash
nap nap 001-test-arch-feature --timeout 300
```

Blocks until agent signals completion. Then architect reads `response.md`.

**Critical:** agents must call `nap done` when finished — with NO message argument. Just `nap done`, not `nap done "some message"`. Done messages arrive in the architect's terminal as if the human typed them — the architect can't tell who sent it. Use `response.md` for all communication, `nap done` only as a signal.

## The prompt.md contract

Every prompt.md is self-contained. It includes:
- Role (or path to role file)
- What to read (exact file paths)
- What to produce
- Where to write output

If you handed this prompt to a stranger with access to the repo, they could do the job.

**Every prompt must end with this, verbatim:**

```
CRITICAL: when you are done, write your response to <path>/response.md, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
```

Last line of the prompt. Every time. Agents forget if it's buried in the middle.

## Agent communication

- **Files:** prompt.md (architect → agent), response.md (agent → architect)
- **`nap done`:** signal completion — the only CLI command agents use
- **`nap nap`:** architect waits for agent completion
- **Questions:** agent writes to `questions.md`, calls `nap done` with a message. Architect reads, updates spec or answers, re-launches.

**Do NOT send messages through the terminal.** Both `nap poke` and `nap done "message"` deliver text to another agent's input as if the human typed it — the receiving agent can't tell who sent it. Use files (response.md, questions.md) for all communication. Use `nap done` (no arguments) purely as a completion signal. Message-based communication is reserved for future work with proper sender identity.

## Failure flow

Test eng reports failure → architect decides:
- Code bug? Route to fullstack eng.
- Spec problem? Update spec, re-run from step 3.
- Test wrong? Update test.md, re-run test eng.
