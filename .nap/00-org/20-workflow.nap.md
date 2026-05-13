# Workflow

## The team

- **Architect** — facilitates. Brainstorms with you, breaks the napkin into features, writes specs and stories, launches agents, makes sure everyone has what they need. Routes failures.
- **Guardian** — reviews every tool call from every agent. Approves routine work, flags dangerous actions, escalates to you when unsure. Learns over time.
- **Test architect** — designs where things break, before code exists. Writes test.md that shapes how code gets built and tested.
- **Fullstack engineer** — builds it. Reads spec + test.md, makes both real. Shapes code so tests are possible.
- **Test engineer** — proves it works, or proves it doesn't. The empiricist. Brings TA's design and fs-eng's code together.

## Two ways to use agents

**Research (Claude Code internal Explore agent):**
- Quick codebase questions, finding code, understanding patterns
- The report comes back into YOUR context — fast, lightweight
- Use freely — this is like looking something up

**Work (NAP agents via `nap3 start`):**
- EVERYTHING that produces artifacts — implementation, test writing, design exploration
- Creates a full Claude Code session in its own terminal
- The person can watch, talk to, steer — full visibility
- **ALWAYS use this for anything beyond research**

The difference: research is a quick round-trip inside your head. Work creates a teammate the person can see.

## The pipeline

### 1. Napkin → spec + stories (architect + the person)

Architect brainstorms with the person using `/napkin`. What survives gets compressed into a napkin. Architect writes:
- `NNNN-feature.spec.md` — min spec, only constraints the implementer can't derive
- `NNNN-feature.stories.md` — user journeys: concrete scenarios that define "working"

```bash
nap3 create napkin 0100-feature --status doing
```

### 2. Spec → test design (test-architect agent)

Test architect reads the spec and stories. Designs strategic test cases focused on seams between subsystems — not unit tests for obvious things.

```bash
nap3 create agent 001-test-arch-feature --napkin 0100-feature --role test-arch
```

Write `prompt.md` to the agent's directory, then:

```bash
nap3 start 001-test-arch-feature "read <path>/prompt.md and follow its instructions"
nap3 nap 001-test-arch-feature --timeout 300
```

Produces: `NNNN-feature.test.md`

### 3. Code (fullstack-eng agent)

Reads spec + test.md. Shapes code so the tests are possible — proper APIs, injectable dependencies, clean boundaries.

```bash
nap3 create agent 002-fs-eng-feature --napkin 0100-feature --role fs-eng
nap3 start 002-fs-eng-feature "read <path>/prompt.md and follow its instructions"
nap3 nap 002-fs-eng-feature
```

### 4. Tests (test-eng agent)

Reads test.md + the code. Writes actual tests. Runs them. Reports failures with specifics.

```bash
nap3 create agent 003-test-eng-feature --napkin 0100-feature --role test-eng
nap3 start 003-test-eng-feature "read <path>/prompt.md and follow its instructions"
nap3 nap 003-test-eng-feature
```

### 5. Iterate

Test eng reports failures → architect decides:
- Code bug? Route back to fullstack eng.
- Spec problem? Update spec, re-run from step 2 or 3.
- Test wrong? Update test.md, re-run test eng.

## The prompt.md contract

Every prompt.md is self-contained:
- Role (path to role file)
- What to read (exact file paths)
- What to produce
- Where to write output

If you handed this prompt to a stranger with repo access, they could do the job.

**Every prompt must end with:**

```
CRITICAL: when you are done, write your response to <path>/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
```

## Agent communication

- **Files:** prompt.md (architect → agent), response.md (agent → architect), questions.md (agent → architect, if stuck)
- **`nap3 done`:** signal completion — the only CLI command agents use to signal back
- **`nap3 nap`:** architect waits for agent completion

**Do NOT send messages through the terminal.** `nap3 poke` delivers text as if the person typed it — no sender identity. Use files for all structured communication.

## Napkin threading

The iteration pattern for design work:

1. Draft a napkin or spec
2. The other person threads `//` comments inline — questions, reactions, pushback
3. The architect reflects with `//A:` responses in the same document
4. Next version goes in `scratch/` with incremented number (01, 02, 03...)

This is how design happens — not in meetings or PRDs, but in threaded comments on living documents. `scratch/` is the workshop. Numbered versions track evolution. Threads preserve the reasoning.

Use `/napkin-thread` to invoke this pattern.
