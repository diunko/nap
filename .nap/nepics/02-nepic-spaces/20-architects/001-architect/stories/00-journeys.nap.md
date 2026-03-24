* the arc
  * you have an idea — maybe it's been rattling around for weeks, maybe it hit you in the shower
  * you sit down. you click (+). a fresh space opens. a fresh architect. blank canvas.
  * fifteen minutes later, there's a napkin. three hundred bullets. every one load-bearing.
  * you walk away. agents unfold the napkin into a running system.
  * you come back. everything that happened is there — every decision, every wrong turn, every fix.
  * you ship it. you click (+) again. a new era. standing on what you just built.
  * this is the cycle. idea → napkin → system → ship → idea.
  * the whole thing is the product. not the code. the cycle.


* J1: the spark
  * the moment before
    * you know something needs to exist but you don't know its shape yet
    * maybe you sketched something on paper, maybe you have three bullet points in your head
    * the shape is fuzzy. that's fine. that's the starting state.

  * clicking (+)
    * it's right there in the gutter, where the next nepic would be
    * not at the bottom. not in a menu. it's the next thing in the sequence.
    * you click it and a space opens — fresh, empty, ready
    * an architect boots up. they're reading their onboarding — who you are,
      what the project is, what the previous version accomplished
    * by the time you start typing, they have context
    * it feels like sitting down with a colleague who just reviewed your last quarter

  * the conversation
    * you start talking. maybe it's messy. "I want something like X but not exactly X"
    * the architect doesn't nod along. they push.
      * "what happens when two agents edit the same file?"
      * "you said persist — do you mean survive restart or survive crash?"
      * "that contradicts what you said about keeping it simple"
    * this is not vibe coding. this is stress-testing in pure thought.
    * you chase a rabbit hole — nested agent hierarchies, agents spawning agents
      * it goes three levels deep
      * it collapses. too complex. the collapse is information.
      * you come back with a tag: "flat agents, poke protocol"
      * five words. that's the napkin bullet.

  * the mega-napkin takes shape
    * after thirty minutes, sixty, maybe three sessions across two days
    * there are three hundred lines of bullets
    * asterisks nested all the way down
    * labels, not sentences. nesting is zooming in.
    * each bullet is a pin that holds a bigger idea in place
      * the pin is tiny. the idea it holds is big.
    * you read it top to bottom in four minutes
    * everything is there. nothing is filler.
    * you could hand this to a stranger and they'd understand the system

  * the stress test
    * before moving on, you and the architect do a pass
    * "what breaks first?" "what did we forget?" "what did we assume?"
    * you trace a user through the system — mentally, on paper, in bullets
    * a few bullets get rewritten. two get deleted. one gets added.
    * the napkin survives. it's ready.

  * what you feel
    * clarity. the fog burned off.
    * the system exists in your head, fully formed, compressed into bullets
    * you didn't write a spec. you didn't write a PRD. you wrote an address.
    * the castle is in the sky. you just wrote down the address.


* J2: the unfolding
  * the architect reads the mega-napkin
    * not skimming — reading. every bullet. every nesting level.
    * they see the shape: these ten bullets are one feature.
      these five are another. this one is a dependency.
    * they start breaking it apart

  * napkins emerge
    * each feature gets its own napkin
    * 0100-this, 0200-that, 0300-the-other
    * each napkin is a slice of the mega-napkin — self-contained, implementable
    * some are three bullets. some are thirty. depends on the tension.
    * the architect writes a one-line description for each
    * the sidebar fills up with collapsed cards: ten, fifteen, twenty
      * each one a bullet with a name and a status: draft

  * sequencing
    * some napkins depend on others. 0200 needs 0100's socket server.
    * some are parallel. 0300 and 0400 can run simultaneously.
    * the architect builds a roadmap — not a gantt chart, just an ordering
    * first batch: the foundation. second batch: the features. third batch: the polish.
    * the kanban starts to take shape
      * a few move to backlog, a few to todo
      * the board is a living thing now, not empty columns

  * you review the split
    * the architect shows you the napkins. you scan the cards.
    * "this one is too big. split it." "these two should be one." "this can wait."
    * you open a napkin in your editor. add //comments inline.
    * go back to the architect terminal: "look at my comments on 0200"
    * they read, adjust, push back on one thing, agree on the rest
    * this takes fifteen minutes. the roadmap is set.

  * what you feel
    * momentum. the idea is no longer in your head — it's in the system.
    * each napkin is a commitment: this will get built.
    * the kanban has shape. you can see the version.


* J3: the pipeline
  * the architect picks up the first napkin
    * it moves to "doing" on the board
    * the card in the sidebar gains its first dots

  * the pipeline for one napkin
    * spec
      * the architect writes a min spec — not a document with sections,
        just the constraints the engineer couldn't derive on their own
      * "socket path is ~/.nap/sock. protocol is ndjson. CLI has no electron deps."
      * only what would go wrong if they guessed
    * test architecture
      * a test architect agent boots up. green dot in the sidebar.
      * they read the spec and think about seams
        * "where does module A hand off to module B?"
        * "what flows exercise the real integration points?"
      * they produce test cases — not test code. strategic descriptions.
        * what flow. what subsystems. what's expected. where it'll break.
      * they call nap done. the dot turns blue.
    * implementation
      * a fullstack engineer agent reads the spec AND the test cases
        * this is the key: they see what will be tested before writing code
        * they shape the code so the tests can actually run
        * pure functions where unit tests need them
        * proper APIs where integration tests need them
      * you can click into their terminal. watch them think.
        * "⏺ Write(src/main/socket-server.ts) — Wrote 189 lines"
        * they're building. in real time. you can see every decision.
    * tests
      * a test engineer implements the test architect's cases
      * they run them against code they didn't write
        * the bugs they find are real — not the author's blind spots
      * tests fail. the failure goes back to the engineer with specifics.
      * the engineer fixes. tests pass. the napkin moves to review.

  * multiple napkins in parallel
    * while 0100 is in the pipeline, the architect launches 0200, 0300
    * the sidebar has nine dots now. three features cooking simultaneously.
    * the kanban DOING column has three cards, each with agent dots pulsing
    * the architect is juggling — reading responses, launching next agents,
      routing failures back to engineers
    * you see all of this in the architect's terminal
      * "TA-001 done. 9 test cases. Launching FS-001."
      * "FS-002 stuck on a type error. Sending fix instructions."
      * "TE-003 found 2 bugs. Routing back to FS-003."

  * what you feel
    * the machine is running. you didn't configure it. you didn't write scripts.
    * you wrote a napkin and the system is building itself from it.
    * each agent is a teammate you can talk to, not a function returning a string.


* J4: the nap
  * you walk away
    * maybe for an hour. maybe overnight. maybe you had three meetings.
    * you come back. you open the app.
    * it's right where you left it — except the dots changed.

  * the architect is your single pane of glass
    * you don't scan ten terminals. you read the architect's latest output.
    * "0200 is done. TE-200 found a bug in board sync, FS-200 fixed it.
       0210 is stuck — FS-210 needs your input on the card layout.
       0100 is in review. all tests passing."
    * three sentences. you know the state of everything.

  * the kanban confirms it
    * Cmd+` — the board slides down
    * yesterday: 5 doing, 8 todo, 7 backlog
    * now: 3 doing, 2 review, 3 done, 7 todo, 5 backlog
    * the shape shifted. progress is visible. you exhale.

  * you go where you're needed
    * the architect said FS-210 needs input
    * you click -> on 0210 in the kanban. board slides away.
    * the sidebar scrolls to 0210, blue flash, card focuses
    * terminal shows FS-210 mid-thought:
      * "I'm unsure whether cards should expand in place or push others down.
         The spec says 'collapsible' but doesn't specify the behavior."
    * you type: "expand in place, push siblings down. like an accordion."
    * three seconds later they're building it
    * because they have the full context. they were THERE.
    * they just needed one sentence from you.

  * reviewing completed work
    * 0200 is in review. you click into it.
    * you hit Cmd+E — extended view. the directory unfolds.
    * you click [diff] on the engineer's entry
      * you see every file they changed. the actual impact.
    * you open spec.md in your editor. read it against the diff.
    * you add a //comment: "//why is board-sync a separate module? couldn't this live in database.ts?"
    * you go back to the architect: "look at my inline comment on 0200 spec"
    * the architect reads it, explains the reasoning, you're convinced
    * 0200 moves to done

  * what you feel
    * trust. the system worked while you were gone.
    * not blind trust — you can verify everything. every agent's thinking is right there.
    * but you didn't have to babysit. you showed up where you were needed.
    * the rest handled itself.


* J5: the ship
  * the version takes shape
    * three weeks in. maybe four.
    * the kanban tells the story:
      * done: 12. review: 2. doing: 1. todo: 3. backlog: 2.
    * 80% of what you imagined in the mega-napkin is built and tested
    * the remaining 20% — you look at it honestly
      * two of them are nice-to-haves. cut them. they go to the next version.
      * one is half done. the agent is stuck on an edge case.
        * you and the architect decide: ship without it, fix in next version.

  * the conversation before (+)
    * you and the architect reflect
    * "what worked?" "what surprised us?" "what would we do differently?"
    * this isn't retro theater. this is the onboarding for the next architect.
    * the insights get compressed into bullets
      * these bullets go into the handoff — the next architect reads them
      * mistakes won't repeat. patterns will carry forward.

  * architect succession
    * sometimes the architect's context is full before the version ships
    * they've been running for hours. the token count is high.
    * every request costs more. responses get slower.
    * time to hand off.
    * the architect writes an onboarding package for their successor
      * what's the state of each napkin
      * what decisions were made and WHY — not just what, but why
      * what's stuck, what's waiting, what's about to land
      * the tricky parts — the things that only make sense with context
    * a new architect boots up. reads the package. picks up the thread.
    * you can still poke the old architect — they're retired, not gone
      * "hey, why did you spec 0200 that way?"
      * they have the context. they were there. they answer.

  * clicking (+)
    * you're ready for the next version
    * click (+) in the gutter. a new nepic appears.
    * fresh architect. fresh space. fresh energy.
    * but the codebase is right there. the previous nepics are right there.
    * you're not starting over. you're starting AGAIN.
    * the first conversation in the new nepic feels like the first one ever
      * same excitement. same "what if we..."
      * but this time you're standing on validated ground
      * the castle you built is real. now you're adding a wing.

  * what you feel
    * accomplishment. you went from an idea to a shipped system.
    * and the path is traceable — from napkin to spec to test to code
    * every bullet in the mega-napkin became something real
    * and you're already thinking about the next one
    * because (+) is right there. one click away.
