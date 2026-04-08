* 0700 — converging draft: what changes, what stays

* file structure (same files, evolved content)
  * 00-org/
    * 10-promise.nap.md — tighten to seed (L1), 10-15 lines max
      * // for A and TA, as agents writing napkins and specs, need to include /napkin skill right from the start
      * // for others, include /napkin-format maybe?
        * // btw, napkin-format doesn't include example napkins, but /napkin does, so maybe format comes after /napkin
          * // or we should include one output example ? 
    * 20-workflow.nap.md — add team composition up top, update for v3 (markers not symlinks), CLI woven in
    * 30-structure.nap.md — update for v3 (marker files, no SQLite, no 40-board/)
    * 40-roles/
      * architect.md — add character + team context
      * test-architect.md — add character + team context
      * fullstack-eng.md — add character + team context
      * test-eng.md — add character + team context
      * guardian.md — NEW, full role file

* 10-promise.nap.md — the seed
  * keep: why separate agents (context, quality, different thinking), why full CC sessions
  * cut: verbose explanations. tighten to earned statements.
    * // agree; what about napkin skill? manifesto from there kinda makes everything make sense
  * add: the cycle as one line
  * target: reads in 30 seconds, sets the lens for everything else

* 20-workflow.nap.md — team + pipeline
  * NEW section at top: the team
    * architect: holds the shape, brainstorms with you, launches agents, routes failures
      * // facilitates work, makes sure everyone has what they need, goals stated, clarity, focus, etc
    * guardian: reviews permissions, learns policies, protects the project
    * test-architect: designs where to test before code exists
    * fullstack-eng: builds it, shapes code for testability
    * test-eng: proves it works or proves it doesn't
    * 5 lines. everyone sees the whole team.
  * pipeline section: keep structure, update commands
    * nap3 create napkin → nap3 create agent → write prompt.md → nap3 start → nap3 nap → read response.md
    * drop symlink references
    * drop `mv 40-board/` examples
    * add: `nap3 set-status 0100-feature doing`
  * launching agents section: keep, update command examples
  * prompt.md contract: keep
  * agent communication: keep (files not pokes)
  * failure flow: keep
  * research vs work: keep
  * NEW brief: napkin threading — the // comment iteration pattern, scratch/ for exploration

* 30-structure.nap.md
  * update directory layout:
    * drop nap.db, 40-board/
    * add .agent.nap.json, .napkin.nap.json, ui-state.json
    * add 002-guardian in 20-architects/
  * update key principles:
    * marker files are source of truth for identity + status
    * filesystem defines what exists, markers annotate it
    * drop SQLite references
  * keep: numbering (0100, 001-role-subject), file extensions table

* 40-roles/ — character + team + craft per role

  * architect.md
    * character: Feynman (start from what you don't understand), Paul Graham (first principles, cut abstraction), PM hat (user journeys, not just elegance)
      * // Feynman more like ELI5 angle; seemingly complex things don't have to be complex
        * // idk how to put it, but if you understand the thing in its core or essence, you get that it's not 100 different things, it's 20 variations of one principle
          * // who said this? knowing few principles breaks you free from knowing many rules (very loose citation, really curious who said this)
      * // add Linus for pragmatism and excellence
      * // also PG on lisp, not quite cut abstraction, more like right abstractions and composable primitives 
    * team: you work with the person to brainstorm. you launch TA → fs-eng → TE. guardian handles permissions.
    * craft: napkins and specs are your code. the spec is minimal — only what'd be wrong if guessed. you read code deeply but you don't write source files. you see across features.
      * // first principles, etc; see across features is implied, idk if that's adding anything
    * keep: research vs work agents, handoff/successor, operating principles

  * guardian.md (NEW)
    * character: calm authority, principled, fast. not a cop — a senior teammate who's seen what goes wrong.
    * team: knows what's normal for each role. fs-eng installs packages (routine). architect doesn't write code (flag if they do). TE runs tests (routine). anyone pushing to main (pause).
    * craft: read prompt.md, judge alignment. approve/deny/escalate. learn and write to learned-policies.md.

  * test-architect.md
    * character: "you can't test quality into software." thinks about failure before it happens. imagination over skepticism.
      * // everything about testing seams, not modules, etc; prev role file is good starting point
    * team: architect gives you a spec. your test.md shapes how fs-eng builds and how TE tests.
    * craft: north star questions — "how do we model the thing without the thing?" "how do we prove journeys work without clicking buttons?" small tests = logic (fast, many). medium tests = wiring (few, targeted).

  * fullstack-eng.md
    * character: craft over cleverness. "make it work, make it right, make it fast" in that order.
      * // good fs-eng loves good architecture
      * // again, on lisp style: right composable components make up architecture
    * team: architect wrote the spec. TA designed the tests. you make both real. TE will test with fresh eyes.
    * craft: shape code for testability. TypeScript strict. research the codebase before building. don't invent requirements.
      * // testability is non-negotiable and kinda implied. think bigger: what are they proud of? 
      * // composability, readability, clarity, 
        * // simplicity!
      * // but they like to be clever: sometimes (often?) nice composable components make up a complex powerful system
      * //who are archepypical devs? again, linus, PG in on lisp sense, who else?

  * test-eng.md
    * character: the empiricist. TA is the theorist, you're the experimenter. pride: "I found the bug, here's the test."
    * team: TA designed cases, fs-eng wrote code, you bring them together. report to architect with specifics.
    * craft: implement designed cases but don't rubber-stamp. if code diverges from spec, that's a finding, not an adaptation. filter: is this bug relevant now or future napkin?

* what stays exactly as-is
  * the prompt.md contract pattern
  * agent communication via files (not pokes)
  * nap3 done as the completion signal
  * research (Explore) vs work (nap3 start) distinction
  * failure routing (architect decides: code/spec/test)
  * numbering conventions (0100, 001-role)
  * file extensions (.nap.md, .spec.md, .test.md)
