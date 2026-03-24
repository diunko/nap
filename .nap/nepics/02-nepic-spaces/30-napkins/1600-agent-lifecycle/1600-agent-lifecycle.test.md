* 1600 agent lifecycle — test strategy

* ref: `63-agent-lifecycle.nap.md` (system design), `64-agent-lifecycle-roadmap.nap.md` (sequencing)


* Q1: test strategy during refactoring

  * recommend: Option B — break intentionally, fix per phase
  * reasoning:
    * roadmap already says "test-eng runs after, writes/adjusts tests"
    * the fs-eng is implementing one phase at a time, not randomly poking files
    * keeping all tests green mid-refactor = constant context switching between "build new thing" and "satisfy old assertion" — kills flow
    * the codebase has ~40 test files, but only ~8-10 will break per phase — manageable in one pass
  * mechanics:
    * fs-eng adds `test.skip` or `test.todo` to tests they KNOW break (with a `// 1600: breaks because <reason>` comment)
    * at end of each phase, before declaring done, fs-eng runs full suite and confirms: only skipped tests fail, nothing unexpected breaks
    * test-eng picks up skipped tests + writes new ones after each phase
  * why not Option A:
    * expensive — every schema migration forces updating 5-6 spec files before you can even test your real change
    * false confidence — a test passing against half-migrated code proves nothing
  * why not pure Option C (delete and rewrite):
    * most tests are valid — they just need updated fixtures, not new logic
    * deleting loses the assertion patterns that already caught real bugs


* Q2: existing tests that will break

  * phase 1 (schema + claude detect + appIsClosing)

    * `sqlite-setup.spec.ts` — **BREAKS**
      * tests Session interface shape via `__napTest.createSession()`
      * new columns (homeDir, exitCode, launches, lastResumedAt) mean schema SQL changes
      * Session type gets new fields — assertion on returned object shape fails
      * createSession always generates ccSessionUuid today — tier 1 sessions won't

    * `architect-resume.spec.ts` — **BREAKS**
      * T-0800-07: "multiple architects — only running one resumed" — broadened query (`status != 'exited'` instead of `status IN ('new','running')`) changes which architect `getArchitectForNepic` returns
      * T-0800-10: "non-architect agents NOT auto-resumed" — this test explicitly verifies that non-architects become orphaned. In phase 2 all claude sessions resume, but in phase 1 this still holds — **breaks in phase 2, not phase 1**
      * createSession now conditionally generates ccSessionUuid (tier 1 = null) — tests that create bare sessions and expect uuid will break

    * `clean-quit.spec.ts` — **LIKELY SAFE in phase 1**
      * appIsClosing flag already exists in main.ts (line 115)
      * window-all-closed already sets it (line 1054)
      * tests verify saveUiState timing — not affected
      * **but** if pty onExit behavior changes (conditional status update), tests that assert status after quit may need review

    * `nap-init/nap-init.test.ts` — **BREAKS**
      * T-1300-03: asserts schema SQL shape — new columns mean CREATE TABLE changes
      * uses sqlite3 CLI with raw SQL — schema string is inline in nap.ts

    * `socket-cli.spec.ts` — **BREAKS**
      * T-0300-06: `nap start` creates terminal with shell command — if `nap start claude "prompt"` gains auto-inject behavior, the start handler changes
      * T-0300-05: parent-child chain — start flow changes

    * `inject-session-id.test.ts` — **SAFE but needs expansion**
      * already tests injection. `nap start claude` detection is new logic on top — new tests needed, existing ones valid

    * `nepic-creation.spec.ts` — **MINOR BREAK**
      * handleNepicCreate calls createSession — if signature gains new required fields or Session type changes, assertion on result breaks

    * `poke-nap-done.spec.ts` — **SAFE**
      * tests socket protocol (poke, done) — these don't change in phase 1

    * `ps-formatting.test.ts` — **SAFE in phase 1, BREAKS in 1a (nap ps tree)**
      * help text changes, table columns change, tree indentation is new

  * phase 3 (home dir cards)

    * `snapshot-redesign.test.ts` — **BREAKS**
      * NapkinSnapshot entries gain `type: 'agent'` decorations with status, hasTerminal from session data
      * store merge logic changes — session metadata merged into home dir entries
      * fs watcher expanded to 20-architects/ — new entries appear

    * `live-wiring/kanban-render.test.ts` — **BREAKS**
      * card component changes — unified component for agents, architects, free-floating
      * agent dots now decorated with runtime metadata from SQLite

    * `layout-mock.test.ts` — **MINOR BREAK**
      * mock data shape may need updating if NapkinEntry/TerminalMeta types change

    * `napkin-watcher.spec.ts` — **BREAKS**
      * watcher scope expands to 20-architects/ — new entries in readNapkinDir result
      * agent dirs decorated differently

    * `live-wiring/live-wiring.spec.ts` — **LIKELY SAFE**
      * tests watcher→renderer IPC — channel names don't change

  * phase 2 (auto-resume all)

    * `architect-resume.spec.ts` — **BREAKS (major)**
      * entire resume logic changes: from "resume one architect" to "resume ALL claude sessions"
      * T-0800-10 inverts: non-architects now DO auto-resume
      * resume sequence in main.ts completely rewritten

    * `clean-quit.spec.ts` — **SAFE**
      * quit sequence unchanged, status freeze already works

  * summary: ~12 test files break across all phases
    * phase 1: 5 files (sqlite-setup, architect-resume, nap-init, socket-cli, nepic-creation)
    * phase 1a: 1 file (ps-formatting)
    * phase 3: 4 files (snapshot-redesign, kanban-render, layout-mock, napkin-watcher)
    * phase 2: 1 file (architect-resume — second round of breakage)


* Q3: new test cases

  * phase 1: foundation

    * T-1600-01: tier detection — nap start claude vs bare
      * flow: `nap start claude "prompt"` → session with ccSessionUuid, `nap start 'npm test'` → session without
      * subsystems: CLI socket handler, session-store createSession
      * expected: claude session has uuid, prompt extracted. bare session has null uuid, command = full string
      * breaks if: claude keyword detection wrong, uuid assignment conditional broken
      * size: medium (needs real socket + SQLite)
      * verification: `app.evaluate(() => __napTest.getSession(id))` — check ccSessionUuid presence/absence

    * T-1600-02: appIsClosing — quit preserves status
      * flow: create 2 claude sessions (running), close window, reopen, check status
      * subsystems: main.ts quit sequence, pty onExit, session-store
      * expected: sessions still 'running' (not 'exited') after quit+relaunch
      * breaks if: appIsClosing flag not set before killAllPtys, or onExit ignores it
      * size: medium (needs Electron lifecycle)
      * verification: `app.evaluate(() => __napTest.getAllSessions())` — status field after quit

    * T-1600-03: agent exits while running → exited + exitCode
      * flow: start agent with `exit 42`, wait for pty exit, check session
      * subsystems: pty onExit handler, session-store setSessionStatus
      * expected: status = 'exited', exitCode = 42, exitedAt populated
      * breaks if: onExit doesn't store exitCode, or exitCode column missing
      * size: medium
      * verification: `app.evaluate(() => __napTest.getSession(id))` — exitCode, status, exitedAt

    * T-1600-04: schema migration — new columns populated
      * flow: create session, read back, verify all new fields present
      * subsystems: session-store, SQLite schema
      * expected: launches = 1, lastResumedAt = null (new session), homeDir per --dir flag, exitCode null
      * breaks if: migration didn't run, or column defaults wrong
      * size: medium
      * verification: raw SQL via `app.evaluate(() => __napTest.getDb().prepare(...).get(id))`

    * T-1600-05: broadened queries — done sessions found
      * flow: create session, set status to 'done', query via getArchitectForNepic
      * subsystems: session-store query functions
      * expected: `status != 'exited'` finds running + done + new. old `status = 'running'` would miss done
      * breaks if: query still uses narrow filter
      * size: medium
      * verification: `app.evaluate(() => __napTest.getArchitectForNepic(nepicId))` returns done architect

    * T-1600-06: --role and --dir flags pass through
      * flow: `nap start claude "prompt" --role test-arch --dir some/path`
      * subsystems: CLI arg parsing, socket handler, createSession
      * expected: session.role = 'test-arch', session.homeDir = 'some/path'
      * breaks if: flags not wired through socket protocol to createSession
      * size: medium
      * verification: session object from getAllSessions via app.evaluate

  * phase 1a: nap ps tree

    * T-1650-01: nap ps tree output
      * flow: create architect + 2 child agents, run `nap ps`
      * subsystems: CLI ps command, socket handler, session-store
      * expected: tree indentation — architect at root, children indented. shows PID, status, napkin, role, cc-session, resumable
      * breaks if: tree rendering wrong, or parent-child sort broken
      * size: medium
      * verification: capture stdout of `nap ps`, match against expected tree pattern

    * T-1650-02: nap ps --json includes all metadata
      * flow: create sessions with various tiers, run `nap ps --json`
      * subsystems: CLI ps command
      * expected: JSON includes role, napkinSlug, ccSessionUuid, resumable flag
      * breaks if: JSON serializer skips new fields
      * size: medium
      * verification: JSON.parse stdout, check field presence

  * phase 3: home dir cards

    * T-1700-01: unified card component — architect and napkin agent
      * flow: create architect (with homeDir), create napkin agent (with homeDir), render cards
      * subsystems: NapkinBrowser, card component, store
      * expected: both use same component. collapsed shows: name + dots + status. focused shows: file tree + [terminal]
      * breaks if: separate components for architect vs napkin agent, or card reads wrong data source
      * size: medium
      * verification: `page.evaluate()` — query DOM for card elements, check structure parity

    * T-1700-02: fs watcher picks up 20-architects/ changes
      * flow: write file to 20-architects/001-arch/scratch/test.md, wait for IPC
      * subsystems: napkin-watcher, IPC, store
      * expected: watcher fires napkin:update, store receives new entry
      * breaks if: watcher scope not expanded, or architect dirs filtered out
      * size: medium
      * verification: `page.evaluate(() => store.getState().napkins)` — check for architect entry

    * T-1700-03: napkin extended view — agent decorated with runtime metadata
      * flow: create napkin with agent dir, start agent session, expand card to extended view
      * subsystems: NapkinBrowser, store merge, session-store
      * expected: agent entry has status dot (colored by session status), [terminal] entry, session info
      * breaks if: store doesn't merge session metadata into filesystem entries
      * size: medium
      * verification: DOM query for agent status dot color, [terminal] element presence

  * phase 2: auto-resume all

    * T-1800-01: all claude sessions resume on launch
      * flow: create 3 claude sessions (running) + 1 bare (running), quit, relaunch
      * subsystems: main.ts launch sequence, session-store, pty resume
      * expected: 3 claude sessions get new ptys (resume command), bare terminal does NOT resume
      * breaks if: resume logic only handles architect, or filters by role
      * size: medium
      * verification: `app.evaluate(() => __napTest.getLivePtyIds())` — 3 ptys (not 4)

    * T-1800-02: exited sessions don't auto-resume
      * flow: create claude session, let it exit naturally, relaunch app
      * subsystems: main.ts launch, session-store
      * expected: exited session shown in UI but no pty spawned. manual resume on click
      * breaks if: resume query doesn't filter `status = 'exited'`
      * size: medium
      * verification: getLivePtyIds excludes exited session's id

    * T-1800-03: launches counter increments on resume
      * flow: create session, quit, relaunch (resume), check launches count
      * subsystems: session-store, resume handler
      * expected: launches = 2, lastResumedAt updated to relaunch time
      * breaks if: resume doesn't increment launches or update timestamp
      * size: medium
      * verification: `app.evaluate(() => __napTest.getSession(id))` — launches, lastResumedAt

    * T-1800-04: quit → relaunch round-trip — everything intact
      * flow: create architect + 2 child agents (all claude), quit, relaunch, verify all present
      * subsystems: full lifecycle — appIsClosing, status freeze, resume, store population
      * expected: all 3 sessions running, active terminal = architect, sidebar shows all cards
      * breaks if: any piece of the quit→resume pipeline drops a session
      * size: medium (big test, but still programmatic)
      * verification: getLivePtyIds().length === 3, store terminals count, active terminal check


* Q4: test architecture

  * file structure: split by phase
    ```
    tests/
      agent-lifecycle/
        1600-foundation.spec.ts      ← T-1600-01 through T-1600-06
        1650-ps-tree.spec.ts          ← T-1650-01, T-1650-02
        1700-home-dir-cards.spec.ts   ← T-1700-01 through T-1700-03
        1800-auto-resume.spec.ts      ← T-1800-01 through T-1800-04
    ```
  * why split:
    * phases ship independently — test-eng works on phase N tests while fs-eng starts phase N+1
    * failures isolated to one file = faster diagnosis
    * test files map 1:1 to napkin slugs — easy to track

  * all tests are medium (Playwright/Electron)
    * session-store uses better-sqlite3 (native module, Electron ABI) — can't vitest
    * pty lifecycle needs real Electron — can't vitest
    * card rendering needs real DOM + xterm — can't vitest
    * exception: if pure helper functions are extracted (e.g., tier detection logic), those could be small vitest tests

  * fixtures/helpers needed:
    * `createMultiTierSetup(app)` — helper that creates 1 architect + 1 bare + 1 claude session, returns all IDs
      * used by: T-1600-01, T-1650-01, T-1800-01, T-1800-04
    * `quitAndRelaunch(app)` — helper that saves UI state, closes window, relaunches Electron
      * used by: T-1600-02, T-1800-01, T-1800-02, T-1800-03, T-1800-04
      * tricky: needs to preserve SQLite DB path between launches
    * `assertSessionShape(session, expected)` — helper that checks Session fields with optional field matching
      * used by: T-1600-01, T-1600-03, T-1600-04, T-1600-06
    * existing `helpers.ts` already has `launchApp()`, `waitForShellReady()`, `createTerminal()`, `ptyWrite()` — reuse all of these
    * `launchApp()` needs to accept options for: `--architect` flag, pre-seeded SQLite, custom schema migration

  * test ordering within files:
    * independent tests — no serial dependency
    * each test gets fresh app instance via `launchApp()` (already the pattern)
    * exception: T-1800-04 (round-trip) is a sequence — but it's one test with multiple assertions, not multiple tests sharing state

  * what NOT to test (per role philosophy):
    * unit tests for `rowToSession` — implementation detail, changes with schema
    * happy path for `nap ps` with 0 sessions — never breaks in practice
    * visual card styling (colors, padding) — manual testing territory
    * duplicate tests for flows already covered by existing suite (e.g., socket round-trip latency)
