* agent lifecycle — tiers, home dirs, session tracking, resume

* the problem
  * three disconnected systems: CLI creates terminals, SQLite stores metadata, filesystem has dirs
  * nothing ties them together reliably
  * no way to distinguish "agent died" from "app closed"
  * architect special-cased everywhere instead of being a regular agent with role


* the feel: close and open are invisible
  * like Cursor: you aren't afraid of closing it
  * you open it next time, everything stays exactly the same
  * all claude sessions auto-resume on launch — not just architect
  * you close, you blink, you open — your project is there
  * exited agents (died on their own): don't auto-resume, but still manually resumable


* the agent model — rich composite object

  * identity
    * id (uuid)
    * name — `001-test-arch`, `Nova`, `shell`
    * displayName — computed: `[Architect] Nova`, `[Test Arch] 001-test-arch`
    * role — architect / test-arch / fs-eng / test-eng / null

  * lifecycle
    * status — running / done / exited / new
    * resumable — derived: has cc_session_uuid? then yes
    * createdAt
    * exitedAt
    * exitCode

  * session
    * ccSessionUuid — the key to resume
      * pre-assigned by NAP on creation
      * passed to claude via `--session-id <uuid>`
      * CC stores conversation history at `~/.claude/`
      * resume = `claude --verbose --resume <uuid>`
    * command — prompt text for claude agents, full command for bare terminals
    * pid — current process ID, null when dead
    * cwd

  * context
    * nepicId — which nepic
    * napkinSlug — which napkin (null for architect, free-floating)
    * parentId — who launched this
    * parentName — denormalized for display

  * home
    * path — relative path to agent's home directory
    * entries — full filesystem tree (runtime, from watcher)
      * type: file — `{ name, absPath }`
      * type: dir — `{ name, absPath, entries[] }`
      * type: agent — `{ name, absPath, entries[], status, ccSessionUuid, hasTerminal }`
        * agent dirs inside napkins get decorated with runtime metadata
    * hasTerminal — is there a live pty? (runtime)

  * history
    * launches — how many times resumed (first = 1, each resume increments)
    * lastResumedAt — when last brought back
    * doneMessage
    * totalUptime — accumulated across launches

  * what's persisted (SQLite) vs runtime (assembled)
    * SQLite: identity, lifecycle, session (minus pid), context, history
    * runtime: pid, hasTerminal, home.entries (filesystem watcher), displayName, resumable
    * the store assembles the full object from both sources
    * components read assembled model, never query SQLite directly


* status → resumability

  * `running` → AUTO-RESUME
    * agent was active when app closed
    * on next launch: spawn `claude --verbose --resume <uuid>`
    * feels like nothing happened — you blinked

  * `done` → AUTO-RESUME
    * agent called `nap done`
    * CC session still there, full context
    * on next launch: resume — agent is at prompt, ready for follow-up
    * you close and open: done agents are still there, still talkable

  * `new` → AUTO-RESUME
    * session created but never launched (e.g., nap init)
    * on next launch: first start via `claude --verbose --session-id <uuid>`

  * `exited` → MANUAL RESUME ONLY
    * agent's process died on its own while app was running
    * don't auto-resume — agent chose to leave or crashed
    * user can still click → explicit resume action
    * CC session may still exist — resumable if user wants

  * no `ccSessionUuid` → CANNOT RESUME
    * bare terminal — no CC session
    * gone when pty dies


* the appIsClosing mechanism
  * flag in main process, set in `window-all-closed` BEFORE killing ptys
  * onExit handler: if appIsClosing → skip status update, leave as-is
  * onExit handler: if NOT appIsClosing → mark 'exited', store exit code
  * this is what preserves status through restart
  * without it: everything becomes 'exited' → nothing auto-resumes

* on app launch — the resume sequence
  * read all sessions from SQLite for active nepic
  * for each with ccSessionUuid where status != 'exited':
    * spawn `claude --verbose --resume <uuid>`
    * ALL of them, not just architect
    * architect gets pinned at top, becomes active terminal
    * others resume in background
  * for sessions without ccSessionUuid:
    * bare terminals — show in history but don't resume
    * maybe: easy action button to relaunch the command
  * process events update SQLite near-real-time
    * pty onExit → update status, exitCode
    * no PID polling needed — events are the source


* three tiers — additive metadata

  * tier 1 — bare terminal
    * `nap start 'any command'`
    * name, pid, status, command — that's it
    * no ccSessionUuid, no resume, no home dir
    * or: skip this tier entirely
      * Cmd+T creates tier 3 with no home dir
      * // bare term is super-useful for testing
      * // and tier 3 can build on top of tier 1
      * // maybe it's tier 1: this; tier 2: claude; tier 3: napkin-based
      * // from more simple to more complex
      * // cmd-t is claude; cmd-shift-t is bare
      * // and napkin is invoked by architect
      * // btw, what happens when napkin has multiple TAs? that's ok? 
        * // should be ok by design: indicators; open card; expanded card
      * everything is a claude session
      * simpler model, one fewer concept

  * tier 2 — napkin agent
    * `nap start claude "read prompt.md" --napkin 0100 --name 001-test-arch`
    * home dir: `30-napkins/0100/agents/001-test-arch/`
    * contained within a napkin — the core relationship
    * sidebar: nested under napkin card
    * all metadata: uuid, napkin, role, home dir

  * tier 3 — free-floating claude
    * `nap start claude "do something" --name Nova`
    * optionally: `--dir <path>` for a home directory
    * sidebar: standalone card
    * if has dir: card shows file tree
    * if no dir: card shows just [terminal]
    * this is: architects, research agents, ad-hoc helpers

  * base layer (all tiers)
    * name, pid, status — universal
    * poke, peek, kill, log — works for everything
    * `nap ps` shows all in one list


* `nap start claude` — the detection point
  * NAP detects `claude` as first arg
  * automatically adds `--verbose --session-id <uuid>`
  * prompt is everything after `claude`:
    * `nap start claude "read prompt.md and follow instructions"`
  * without `claude`: bare terminal (tier 1)
  * flags:
    * `--name <name>` — display name (all tiers)
    * `--napkin <slug>` — napkin containment, sets home dir (tier 2)
    * `--dir <path>` — explicit home directory (tier 3)
    * `--role <role>` — test-arch, fs-eng, test-eng
    * `--architect` — special flag: auto-numbers (001, 002...), home in `20-architects/NNN-name/`, display as `[Architect] Name`
      * ok to have multiple architects (transitioning)
      * one acting per nepic; switch is intentional action


* the home directory
  * every managed agent can have a home dir
  * sidebar card = window into this dir
    * same rendering everywhere
    * collapsed: name + dots + status
    * focused: file tree + [terminal]
    * extended (Cmd+E): full tree with ⎘ ↗ controls
  * entries are a full tree, not flat list
    * file: `{ type: file, name, absPath }`
    * dir: `{ type: dir, name, absPath, entries[] }`
    * within napkin view: agent dirs decorated with runtime metadata
      * `{ type: agent, name, absPath, status, ccSessionUuid, hasTerminal, entries[] }`
  * napkin agents: home = `30-napkins/<slug>/agents/<name>/`
  * architects: home = `20-architects/<NNN-name>/`
    * auto-numbered by `--architect` flag
  * free-floating: home = `--dir <path>` or none


* napkin as container
  * the feature scope, the unit of work
  * agents contained within — structural relationship
  * `--napkin` establishes containment
  * sidebar renders agents nested under napkin card
  * napkin extended view: full tree with agents/ children decorated
    * agents/ dir hidden, its children promoted as `type: agent` entries
    * each agent shows: status dot, [terminal], own files


* architect is just an agent
  * role = 'architect' — matching by role is fine now
  * `--architect` flag for creation: auto-numbers, sets home, display prefix
  * home = `20-architects/<NNN-name>/`
  * auto-resumed on launch (most recent where role='architect' + status != 'exited')
  * pinned at top of sidebar
  * handoff: old stays resumable, new created
  * same card rendering, same model, same resume


* `nap ps` — reads from SQLite
  * SQLite is source of truth, informed by process events near-real-time
  * no PID liveness checks on ps — status already accurate
  * shows all metadata present:

  ```
  NAME               PID    STATUS   NAPKIN       ROLE        CC-SESSION    RESUMABLE
  002-Nova           12347  running  -            architect   8e91c...      yes
  001-test-arch      -      done     0100         test-arch   a4f2b...      yes
  002-fs-eng         -      exited   0100         fs-eng      b7c3d...      manual
  shell              -      exited   -            -           -             no
  research-auth      -      running  -            -           c3d4e...      yes
  ```


* filesystem watcher integration
  * watches: `30-napkins/` + `20-architects/`
  * produces NapkinSnapshot (1200 model) for all home dirs
  * agent dirs inside napkins: `type: agent` with runtime decoration
  * free-floating without dir: no watcher, card shows [terminal] only, maybe command text
  * same component renders all cards
    * napkin agents: data from napkin watcher, enriched with session metadata
    * architect / home-dir agents: data from watcher on their home dir
    * dirless agents: session metadata only


* stale records in SQLite
  * problem: double invocations, errors → orphaned rows reported as "running"
  * each app launch could have an instance ID
    * sessions created in this launch tagged with instance
    * on launch: sessions from previous instances with status 'running' but no live PID → stale
  * or: trust the event system — if onExit fires, status updates
    * stale records only from crashes where onExit never fired
    * reconciliation on launch handles this edge case


* what this subsumes
  * 1500-session-resume-fix (appIsClosing, status lifecycle)
  * nap start --napkin (needs --dir, --role, --architect)
  * architect card rendering (same as any agent)
  * orphaned agent display (resume logic)


* potential napkin split
  * A: `nap start claude` detection + tier system + schema changes
  * B: home directory model + --dir + --architect flag + card rendering unification
  * C: resume lifecycle (appIsClosing, auto-resume all, launch sequence)
  * D: `nap ps` redesign (full metadata, no PID polling)
  * E: napkin extended view with agent decoration (builds on 1200 snapshot model)
