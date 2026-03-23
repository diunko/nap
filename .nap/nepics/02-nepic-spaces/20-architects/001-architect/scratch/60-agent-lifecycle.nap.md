* agent lifecycle — tiers, home dirs, session tracking, resume

* the problem
  * three disconnected systems: CLI creates terminals, SQLite stores metadata, filesystem has dirs
  * nothing ties them together reliably
  * orphaned records, unresumable sessions, agents not showing under napkins
  * no way to distinguish "agent died" from "app closed"
  * architect is special-cased everywhere instead of being a regular agent with a role

* the model: every launched thing is a session, tiers add metadata

  * tier 1 — bare terminal
    * `nap start 'any command'`
    * just a pty with a name
    * track PID in SQLite, show in `nap ps`
    * no cc_session_uuid, no resume, no home dir
    * dies when app closes, gone
    * use for: shells, quick commands, `top`, `htop`, one-off scripts

  * tier 2 — napkin agent
    * `nap start claude "read prompt.md" --napkin 0100 --name 001-test-arch`
    * NAP manages full lifecycle
    * home dir: `30-napkins/0100/agents/001-test-arch/`
      * contains prompt.md, response.md, questions.md, scratch/
      * sidebar card = window into this dir
    * SQLite: uuid, pid, cc_session_uuid, napkin_slug, role, status
    * `--verbose --session-id <uuid>` injected automatically
    * resumable on app restart
    * shows nested under napkin card in sidebar
    * this is the pipeline agent

  * tier 3 — free-floating claude
    * `nap start claude "do something" --name Nova --dir .nap/nepics/01-v1/20-architects/001-architect`
    * or: `nap start claude "research X" --name research-auth`
      * auto-creates home dir if --dir not specified? or no home dir?
    * SQLite: uuid, pid, cc_session_uuid, role (optional), status
    * resumable
    * sidebar card: standalone, not under a napkin
    * if has --dir: card shows directory contents
    * if no --dir: card shows just [terminal], no files
    * this is: architects, research agents, ad-hoc helpers

* what makes `nap start claude` special
  * NAP detects `claude` as first arg (same as inject-session-id does now)
  * automatically adds `--verbose --session-id <uuid>`
  * creates SQLite session with full metadata
  * prompt is everything after `claude`: `nap start claude "read prompt.md and follow instructions"`
    * space between `claude` and prompt — these are NAP's args, not shell args
  * without `claude` as first arg: bare terminal (tier 1)

* the home directory
  * every managed agent (tier 2, tier 3) can have a home dir
  * the sidebar card is a window into this dir
    * same rendering for all: files as `*` bullets, `[terminal]` entry, hover controls
    * collapsed: name + dots + status
    * focused: files + [terminal]
    * extended (Cmd+E): all files with ⎘ ↗ controls
  * for napkin agents: home = `30-napkins/<slug>/agents/<name>/`
    * set automatically by `--napkin` flag + agent name
  * for architects: home = `20-architects/<name>/`
    * set by `--dir` flag or by `--role architect` convention
  * for free-floating: home = `--dir <path>` or none
    * if none: card has no files, just [terminal]

* napkin as container
  * napkin is the feature scope, the unit of work
  * agents are contained within a napkin — this is structural
  * the `--napkin` flag establishes this containment
    * sets home dir to `30-napkins/<slug>/agents/<name>/`
    * stores napkin_slug in SQLite
    * sidebar renders agent nested under napkin card
  * agents without `--napkin` float freely
  * the containment relationship is the core piece of NAP
    * it's what makes the sidebar a project view, not a terminal list

* SQLite sessions table — all tiers, one table

  * id (uuid)
  * name — display name
  * command — what was launched (full command for tier 1, prompt text for tier 2/3)
  * pid — process ID, updated on launch, cleared on exit
  * status — running / done / exited / new
  * cc_session_uuid — null for tier 1, present for tier 2/3
  * napkin_slug — null for tier 1/3, present for tier 2
  * role — null for tier 1, optional for tier 2/3 (architect, test-arch, fs-eng, test-eng)
  * home_dir — relative path to agent's home directory, null for tier 1 without dir
  * parent_id — who launched this agent
  * nepic_id — which nepic this belongs to
  * cwd
  * created_at, exited_at, exit_code

* session status lifecycle
  * on `nap start`: status = 'running', pid stored
  * on `nap done`: status = 'done' (pty still alive, session resumable)
  * on pty exit while app running (appIsClosing = false): status = 'exited', exit_code stored
  * on app close: don't touch statuses (appIsClosing = true)
  * on app launch:
    * check PID liveness for 'running' sessions (kill -0)
    * if PID dead but cc_session_uuid exists: resumable (launch `claude --resume`)
    * if PID dead and no uuid: mark exited (bare terminal died)
    * if PID alive: reconnect (shouldn't happen after app close, but defensive)

* `nap ps` — reads from SQLite, enriched with PID liveness

  ```
  NAME               PID    STATUS   NAPKIN       ROLE        CC-SESSION
  002-Nova           12347  running  -            architect   8e91c...
  001-test-arch      12346  done     0100         test-arch   a4f2b...
  002-fs-eng         -      exited   0100         fs-eng      b7c3d...
  shell              12345  running  -            -           -
  research-auth      12348  running  -            -           c3d4e...
  ```

* architect is just an agent with role + home dir
  * home: `20-architects/<name>/`
  * role: 'architect'
  * auto-resumed on app launch (find most recent where role='architect' + status != 'exited')
  * pinned at top of sidebar (renderer checks role)
  * handoff: old architect stays as 'done', new one created
  * old architect still resumable — poke or `claude --resume`
  * no special table, no special treatment in data model
  * behavior differences are in the app logic, not the schema

* filesystem watcher integration
  * watcher watches: `30-napkins/` (napkin agent homes) + `20-architects/` (architect homes)
  * free-floating agent dirs: need convention
    * option A: watch a `agents/` dir at nepic level for free-floating
    * option B: don't watch — free-floating agents get no file card unless they have --dir
    * option B is simpler, start there
  * snapshot model (1200) applies to all home dirs equally
  * the card rendering is the same regardless of where the home dir lives

* what this subsumes
  * 1500-session-resume-fix (appIsClosing flag, status lifecycle)
  * nap start --napkin (already implemented, but needs --dir, --role)
  * architect card rendering (currently special-cased, should be same as any agent with a home dir)
  * the orphaned agent display (resume logic based on cc_session_uuid presence)

* potential napkin split
  * napkin A: session schema + tier system + `nap start claude` detection
  * napkin B: home directory model + --dir flag + card rendering unification
  * napkin C: architect as regular agent (remove special cases, use role + home dir)
  * napkin D: resume lifecycle (appIsClosing, PID tracking, status transitions)
  * napkin E: `nap ps` redesign (show full metadata, PID liveness)
