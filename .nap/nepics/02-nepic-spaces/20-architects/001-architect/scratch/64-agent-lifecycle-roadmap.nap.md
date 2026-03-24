* agent lifecycle — roadmap

* reference: `63-agent-lifecycle.nap.md` (system design)

* sequencing: 1 → 3 → 2
  * 1: foundation (data model, nap start claude, status freeze)
  * 3: visual (home dirs, card rendering, see the metadata in UI)
  * 2: resume (auto-resume all, invisible close/open)
  * CLI part of 2 (nap ps tree) can ship as 1a, quick win before 3

* approach
  * one fs-eng implements each phase, guided by test cases
  * test-eng runs after, writes/adjusts tests
  * avoids test churn during refactoring


* phase 1: foundation (~300-400 lines)

  * 1600-session-schema
    * what's implemented:
      * schema migration: add columns to sessions table
        * homeDir TEXT
        * exitCode INTEGER
        * launches INTEGER DEFAULT 1
        * lastResumedAt INTEGER
      * `nap start claude` detection in CLI
        * `claude` as first arg → auto-inject `--verbose --session-id <uuid>`
        * prompt = everything after `claude`
        * without `claude` → bare terminal (no uuid, no resume)
      * `--role` flag on nap start (passes to createSession)
      * `--dir` flag on nap start (passes to createSession as homeDir)
      * appIsClosing flag in main.ts
        * set in window-all-closed BEFORE killAllPtys
        * onExit: if appIsClosing → skip status update
        * onExit: if NOT appIsClosing → set 'exited' + exitCode
      * status queries broadened: `status != 'exited'` replaces `status = 'running'`
    * flows changed:
      * nap start → createSession with new fields
      * pty onExit → conditional status update
      * app quit → status freeze
      * app launch → broadened architect query

  * 1650-nap-ps-tree (quick, 1a)
    * what's implemented:
      * nap ps output as tree (parent-child indentation)
      * show all metadata: PID, status, napkin, role, cc-session, resumable
      * reads SQLite only, no PID polling
    * output:
      ```
      [Architect] Nova          ● running   8e91c...
        001-test-arch           ● done      0100    a4f2b...
        002-fs-eng              ● running   0100    b7c3d...
        research-auth           ● running           c3d4e...
      shell                     ● running
      ```


* phase 3: visual (~400-500 lines)

  * 1700-home-dir-cards
    * what's implemented:
      * sidebar card renders from homeDir
        * same component for all: napkin agents, architects, free-floating
        * collapsed: name + dots + status
        * focused: file tree + [terminal]
        * extended: full tree with ⎘ ↗
      * fs watcher watches `20-architects/` in addition to `30-napkins/`
      * architect card: pinned at top of sidebar, same rendering otherwise
      * napkin extended view: agent dirs decorated with runtime metadata
        * status dot, [terminal] entry, session info from SQLite
      * free-floating without dir: card shows [terminal] + command text only
    * flows changed:
      * fs watcher → expanded scope (architects dir)
      * NapkinBrowser → unified card component
      * store → merges session metadata into home dir entries


* phase 2: resume (~200-300 lines)

  * 1800-auto-resume-all
    * what's implemented:
      * on app launch: resume ALL sessions with ccSessionUuid where status != 'exited'
        * not just architect — every claude session
        * architect pinned at top, others resume in background
      * exited sessions: show in UI, manual resume on click
      * bare terminals (no uuid): show in history, not resumed
      * launches counter incremented on each resume
      * lastResumedAt updated
    * the feel: close, open, everything is there
    * flows changed:
      * app launch sequence → multi-session resume
      * renderer → handle N resumed terminals arriving at once


* tests (~600-800 lines total, after each phase)

  * after phase 1:
    * nap start claude detection (tier 1 vs tier 2)
    * appIsClosing: quit doesn't mark exited
    * agent exits while running → exited with exit code
    * schema: new columns populated correctly
    * broadened queries find done + running + new sessions

  * after phase 3:
    * architect card renders from homeDir
    * napkin agent card same component as architect card
    * fs watcher picks up 20-architects/ changes
    * extended view shows full file tree

  * after phase 2:
    * all claude sessions resume on launch
    * exited sessions don't auto-resume
    * launches counter increments
    * bare terminals don't resume
    * quit → relaunch round-trip: everything intact
