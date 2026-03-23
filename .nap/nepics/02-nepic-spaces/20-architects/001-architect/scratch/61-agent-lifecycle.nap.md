* agent lifecycle — tiers, home dirs, session tracking, resume

* the problem
  * three disconnected systems: CLI creates terminals, SQLite stores metadata, filesystem has dirs
  * nothing ties them together reliably
  * orphaned records, unresumable sessions, agents not showing under napkins
  * no way to distinguish "agent died" from "app closed"
  * architect is special-cased everywhere instead of being a regular agent with a role


* resumability — the central concept

  * what makes a session resumable?
    * it has a cc_session_uuid (Claude Code session is persistent on disk)
    * it was NOT explicitly exited by the agent itself
    * that's it — two conditions

  * what does resume mean?
    * spawn new pty: `claude --verbose --resume <cc_session_uuid>`
    * Claude Code loads full conversation history from its persistent storage
    * the agent picks up where it left off — same context, same thinking
    * the pty is new (old one died), but the CC session is continuous

  * session status → resumability mapping
    * `running` → RESUME
      * agent was active when app closed
      * CC session exists, conversation intact
      * auto-resume for architect, manual for others
    * `done` → RESUME
      * agent called `nap done` — finished its task
      * but the CC session is still there, still resumable
      * why resume a done agent? follow-up bugs, questions, iterations
      * the agent has full context from the work it did
    * `new` → RESUME
      * session created (e.g., by nap init) but never started
      * CC session UUID pre-assigned but no conversation yet
      * resume = first launch
    * `exited` → DO NOT RESUME
      * agent's process died ON ITS OWN while app was running
      * this is the only terminal state — the agent chose to leave (or crashed)
      * CC session may exist but the agent explicitly ended
    * no `cc_session_uuid` → CANNOT RESUME
      * bare terminal (tier 1) — no CC session to resume from
      * gone when the pty dies

  * persistence: what survives app restart?
    * SQLite row: always persists (session metadata)
    * cc_session_uuid: always persists (in SQLite)
    * CC session history: persists on disk (~/.claude/) — managed by Claude Code, not us
    * pty process: DIES on app close — must be re-created on resume
    * xterm scrollback: DIES — in-memory only
      * but CC session history means the agent has full context regardless
    * home directory: persists — it's just files on disk
    * status: persists AS-IS through app close (appIsClosing flag prevents changes)

  * what triggers status transitions
    * `nap start` → 'running' (or 'new' if created by nap init before app launches)
    * `nap done` → 'done'
    * pty exit while app running (appIsClosing = false) → 'exited'
    * app closes (appIsClosing = true) → NO CHANGE — status frozen
    * nothing ever transitions FROM 'exited' — it's terminal

  * the appIsClosing flag
    * set to true in `window-all-closed` BEFORE killing ptys
    * onExit handler checks: if appIsClosing → skip status update
    * this is the mechanism that preserves status through restart
    * without it: every session becomes 'exited' on quit → nothing resumable

  * on app launch — the resume sequence
    * read all sessions from SQLite
    * for each session with cc_session_uuid where status != 'exited':
      * it's resumable
      * architect (role = 'architect', most recent): auto-resume
        * spawn `claude --verbose --resume <uuid>` immediately
        * becomes the first terminal
      * others: show as resumable in UI
        * orphaned dot style — "was running when you left" or "finished, still resumable"
        * human clicks → resume manually
    * for sessions without cc_session_uuid:
      * bare terminals — just metadata in SQLite, nothing to resume
      * show in session history but not as active/resumable
    * PID liveness check (defensive):
      * if a session claims 'running' but PID is dead → it's resumable (app crashed last time)
      * if PID is somehow alive → reconnect (edge case, shouldn't happen)


* three tiers — additive metadata

  * tier 1 — bare terminal
    * `nap start 'any command'`
    * just a pty with a name
    * SQLite: id, name, pid, status, command, cwd
    * no cc_session_uuid, no resume, no home dir
    * dies when app closes, gone — just a terminal tab
    * use for: shells, quick commands, scripts

  * tier 2 — napkin agent
    * `nap start claude "read prompt.md" --napkin 0100 --name 001-test-arch`
    * NAP manages full lifecycle
    * home dir: `30-napkins/0100/agents/001-test-arch/`
    * SQLite: + cc_session_uuid, napkin_slug, role, home_dir
    * `--verbose --session-id <uuid>` injected automatically
    * resumable, shows nested under napkin card
    * this is the pipeline agent

  * tier 3 — free-floating claude
    * `nap start claude "do something" --name Nova --dir 20-architects/001-architect`
    * or: `nap start claude "research X" --name research-auth` (no dir)
    * SQLite: + cc_session_uuid, role (optional), home_dir (optional)
    * resumable
    * sidebar card: standalone, not under a napkin
    * if has home dir: card shows directory contents
    * if no dir: card shows just [terminal]
    * this is: architects, research agents, ad-hoc helpers

  * the base layer (all tiers)
    * name, PID, poke, peek, kill, log — works for everything
    * `nap ps` shows all in one list
    * same sidebar card rendering (just with less metadata for tier 1)


* `nap start claude` — the detection point
  * NAP detects `claude` as first arg
  * automatically adds `--verbose --session-id <uuid>`
  * creates SQLite session with cc_session_uuid
  * prompt is everything after `claude`:
    * `nap start claude "read prompt.md and follow instructions"`
  * without `claude` as first arg: bare terminal (tier 1)
  * flags:
    * `--name <name>` — display name (all tiers)
    * `--napkin <slug>` — napkin containment, sets home dir conventionally (tier 2)
    * `--dir <path>` — explicit home directory (tier 3, or override for tier 2)
    * `--role <role>` — architect, test-arch, fs-eng, test-eng (tier 2/3)


* the home directory
  * every managed agent (tier 2, tier 3) can have a home dir
  * the sidebar card is a window into this dir
    * same rendering for all: files as `*` bullets, `[terminal]` entry, hover controls
    * collapsed: name + dots + status
    * focused: files + [terminal]
    * extended (Cmd+E): all files with ⎘ ↗ controls
  * for napkin agents: home = `30-napkins/<slug>/agents/<name>/`
    * set automatically by `--napkin` + agent name
  * for architects: home = `20-architects/<name>/`
    * set by `--dir` or by `--role architect` convention
  * for free-floating: home = `--dir <path>` or none


* napkin as container
  * napkin is the feature scope, the unit of work
  * agents are contained within a napkin — this is structural
  * `--napkin` flag establishes containment
    * sets home dir to `30-napkins/<slug>/agents/<name>/`
    * stores napkin_slug in SQLite
    * sidebar renders agent nested under napkin card
  * agents without `--napkin` float freely


* SQLite sessions table — all tiers, one table

  * id (uuid)
  * name — display name
  * command — full command for tier 1, prompt for tier 2/3
  * pid — process ID, updated on launch, null when dead
  * status — running / done / exited / new
  * cc_session_uuid — null for tier 1, present for tier 2/3
  * napkin_slug — null for tier 1/3, present for tier 2
  * role — null for tier 1, optional for tier 2/3
  * home_dir — relative path, null for tier 1 or dirless tier 3
  * parent_id — who launched this agent
  * nepic_id — which nepic
  * cwd
  * created_at, exited_at, exit_code


* architect is just an agent
  * role = 'architect'
  * home = `20-architects/<name>/`
  * auto-resumed on app launch (most recent where role='architect' + status != 'exited')
  * pinned at top of sidebar (renderer checks role)
  * handoff: old architect stays as 'done' (still resumable), new one created
  * same card rendering, same data model, same resume mechanics
  * behavior differences are in app logic, not schema


* `nap ps` — reads from SQLite, enriched with PID liveness

  ```
  NAME               PID    STATUS   NAPKIN       ROLE        CC-SESSION    RESUMABLE
  002-Nova           12347  running  -            architect   8e91c...      yes
  001-test-arch      -      done     0100         test-arch   a4f2b...      yes
  002-fs-eng         -      exited   0100         fs-eng      b7c3d...      no
  shell              -      exited   -            -           -             no
  research-auth      -      running  -            -           c3d4e...      yes
  ```


* filesystem watcher integration
  * watches: `30-napkins/` (napkin agent homes) + `20-architects/` (architect homes)
  * free-floating agent dirs: don't watch unless --dir points somewhere watched
  * snapshot model (1200) applies to all home dirs equally
  * card rendering identical regardless of home dir location


* what this subsumes
  * 1500-session-resume-fix (appIsClosing, status lifecycle)
  * nap start --napkin (already implemented, needs --dir, --role)
  * architect card rendering (should be same as any agent)
  * orphaned agent display (based on cc_session_uuid + status)


* potential napkin split
  * napkin A: `nap start claude` detection + tier system + schema changes
  * napkin B: home directory model + --dir flag + card rendering unification
  * napkin C: resume lifecycle (appIsClosing, PID tracking, status transitions, launch sequence)
  * napkin D: `nap ps` redesign (full metadata, PID liveness, RESUMABLE column)
  * napkin E: architect as regular agent (remove special cases, use role + home dir)
