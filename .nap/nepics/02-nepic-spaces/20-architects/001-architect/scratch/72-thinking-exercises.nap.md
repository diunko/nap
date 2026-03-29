* thinking exercises — product debt + state principles

* exercise 1: product debt and journey verification

  * the tension
    * agents build great components — give them a spec, they deliver
    * agents can't USE the product — can't click, can't feel, can't see
    * only the human can experience the product
    * so: how do we get journey-level verification into an agent-driven process?

  * approach 1: journey tests as acceptance criteria
    * PM writes user story
    * architect translates to Playwright test — BEFORE implementation
    * test fails initially — that's the point
    * implementation is done when the journey test passes
    * the test IS the user, automated
    * shift from component tests to journey tests as the primary quality gate
    * example:
      ```
      test('init → open → architect has claude', async () => {
        // nap init in tmpdir
        // launch app with --architect
        // assert first terminal name contains 'Architect'
        // assert pty command contains 'claude'
      });
      ```
    * the test-architect's job shifts: design journey tests, not seam tests
      * seam tests still valuable — but journey tests come FIRST
    * the pipeline becomes: story → journey test (fails) → spec → agents build → journey test (passes)

  * approach 2: manual journey review every 3-4 napkins
    * the human spends 10 minutes using the app
    * finds wiring bugs before building more on top
    * happened organically at end of nepic 02 — but after 16 napkins, not after 4
    * if done earlier: catch breaks before accumulating
    * the cost: human time
    * the value: 10 minutes of clicking > 10 hours of component tests that miss the real issues

  * approach 3: product witness agent
    * reads code paths, doesn't run the app
    * traces: "when user clicks (+) → what function? → what SQL? → what IPC? → what renders?"
    * flags: "this code path assumes X, but upstream never sets X"
    * cheaper than Playwright journey tests
    * catches logic bugs, misses timing/rendering bugs
    * good for FIRST pass — before any code
    * for nepic 03: have Kai trace existing code for each journey before writing new code

  * recommendation: 1 + 2 combined
    * write 5-8 journey tests as Playwright scripts before implementation
    * after every 3-4 features, human tests manually for 10 minutes
    * journey tests catch regression
    * human catches "it just feels wrong"

  * process change for nepic 03
    * before: napkin → spec → agents build → tests verify component
    * after: story → journey test (fails) → napkin → agents build → journey test (passes)
    * the unit of done is the journey, not the component


* exercise 2: state principles — what we followed, where they collided

  * the principles we had (from scratch/41)
    * P1: filesystem defines what exists (structure + content)
    * P2: SQLite annotates what exists (statuses, UUIDs, timestamps)
    * P3: reconciliation is additive, never destructive
    * P4: "what exists?" → filesystem. "what's the status?" → SQLite
    * P5: they never compete on the same question

  * what we actually did on each write operation
    * create agent
      * mkdir agent dir (filesystem)
      * INSERT session row (SQLite)
      * P1 + P2 both written — if mkdir succeeds but INSERT fails: dir exists, no status
      * if INSERT succeeds but mkdir fails: SQLite row exists, no dir → orphan
      * no transactional guarantee between them
    * change napkin status
      * UPDATE napkins table (SQLite)
      * mv symlink in 40-board/ (filesystem)
      * if UPDATE succeeds but mv fails: SQLite says "doing", symlink says "backlog"
      * the spec said "SQLite is authoritative" — but the symlink is what the human sees in their editor
    * agent calls nap done
      * UPDATE session status to 'done' (SQLite)
      * no filesystem write — the status only lives in SQLite
      * on restart: SQLite knows it's 'done', but no meta file on disk says so
      * if SQLite is lost (deleted nap.db): done status lost, agent looks new
    * app closes
      * pty onExit fires for each pty
      * if appIsClosing=false: UPDATE status to 'exited' (SQLite)
      * if appIsClosing=true: skip update
      * no filesystem write either way
      * the "is this agent resumable?" answer lives ONLY in SQLite
    * app opens — resume
      * read SQLite: find sessions with uuid where status != 'exited'
      * spawn `claude --resume <uuid>`
      * but: does the agent dir still exist? (filesystem not checked)
      * if dir was deleted (git clean, branch switch): SQLite says resume, but there's nothing to resume INTO

  * where P5 ("they never compete") broke
    * P5 is true for READS — you ask one system, not both
    * P5 is false for WRITES — every write touches both systems
    * the collision: a write to SQLite without a corresponding filesystem write creates drift
    * example: `nap done` updates SQLite but writes nothing to disk
      * after restart: SQLite knows the agent is done
      * but the filesystem has no record of this — if SQLite is lost, the done status is lost
    * example: `nap start` creates an agent dir AND a SQLite row
      * but the SQLite row has fields (status, uuid) that don't exist as files in the dir
      * the dir is the existence, the row is the metadata — but they're not linked except by name matching

  * what the state principles didn't address
    * write ordering and atomicity
      * which system gets written first?
      * what happens if the second write fails?
      * we never decided — each feature made its own choice
    * state transitions across restart
      * P1-P5 describe a running system
      * they say nothing about: "app closes, all ptys die, what happens to status?"
      * the appIsClosing flag was invented to fill this gap — but it's not a principle, it's a patch
    * ephemeral vs persistent state
      * which state should survive restart? which should die?
      * we never explicitly decided
      * "running" status persisted across restart — but the process is dead
      * "done" status persisted — but the agent could be resumed
      * "exited" was supposed to be terminal — but the CC session still exists on disk
    * agent identity across systems
      * in SQLite: session ID (uuid) + name
      * in filesystem: directory name
      * matching: by name string comparison
      * if names drift (rename dir, double invocation with same name): identity breaks

  * how state principles collided with product journeys

    * journey: "close app, reopen, everything is there"
      * requires: all session state survives restart
      * state reality: status is in SQLite, process is dead, pty doesn't exist
      * collision: SQLite says "running" but the process isn't running
      * the appIsClosing flag "fixes" this by not updating status on quit
      * but it's a hack on top of a model that doesn't account for restart

    * journey: "click (+), new nepic with architect"
      * requires: SQLite row + agent dir + pty + terminal in renderer
      * state reality: handleNepicCreate writes SQLite row and creates dir
        * but the architect prompt comes from a template that may not be found
        * the pty spawn command needs the UUID from SQLite
        * the renderer needs an IPC message to show the terminal
        * four writes across three systems (SQLite, filesystem, pty, IPC) — any can fail
      * collision: the journey is atomic (user clicks, architect appears) but the implementation is 4 separate writes

    * journey: "agent finishes, dot turns blue"
      * requires: nap done → status update → IPC → renderer re-renders dot
      * state reality: nap done → socket → main process → SQLite update → IPC → renderer
      * collision: if IPC doesn't fire (main window destroyed, race condition): SQLite says done, renderer shows running
      * the dot color is derived from in-memory store, not from SQLite
      * restart "fixes" it (rebuilds from SQLite) but during the session it's wrong

    * journey: "switch nepics, only that nepic's agents show"
      * requires: sidebar filters by active nepic
      * state reality: store has all sessions, renderer filters by nepicId
      * collision: sessions created via old nap start (before --napkin flag) have no nepicId
      * they show up in EVERY nepic because they're unfiltered
      * the bug isn't in the filter — it's in the data: agents without nepic association

  * what simpler state principles might look like
    * candidate rules:
      * R1: all persistent state lives in filesystem (meta.json files)
      * R2: all ephemeral state lives in memory (zustand store, pty map)
      * R3: app restart destroys ephemeral state — rebuilt from persistent layer
      * R4: every write to persistent state is a single file write (atomic at OS level)
      * R5: agent identity = directory path (not a name match across systems)
    * what these eliminate:
      * no SQLite for session state → no dual-truth
      * no reconciliation → persistent state is always consistent with filesystem
      * no appIsClosing → ephemeral state just dies, persistent state was never touched by pty exit
      * no name matching → agent IS its directory
    * what these require:
      * walking dirs on startup instead of SQLite query (fast enough for 100s of agents)
      * writing meta.json on every status change (one file write vs one SQLite UPDATE)
      * UI state persistence: either meta.json at nepic level or accept loss on restart
