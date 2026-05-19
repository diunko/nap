# codebase ownership — the architect reads the code

* the problem
  * architects who don't read the source write abstract stories
  * "nav tree shows .nap structure" — means nothing without knowing what the parser handles
  * "tab switching works" — meaningless without knowing the app already has 3 tab tests covering close, pin, and middle-click
  * agents fill the gap with guesses. guesses produce tests that pass and products that don't work.

* the principle
  * the architect owns the area they're facilitating
  * owning means: you've read the source, you've read the tests, you understand how it works today
  * not at the level of writing code — at the level of knowing what exists and what it does
  * you don't need to know every line. you need to know: what behaviors are implemented, what's tested, what's not.

* what "read the code" means in practice
  * before writing stories for a feature:
    * read the existing source files in the area you're touching
    * read the existing tests — they show what the previous team thought mattered
    * read the store/state management — it shows what state transitions exist
  * before writing a prompt for an agent:
    * you should be able to describe what the agent will find when they read the code
    * if you can't, you haven't read enough
  * when porting from one system to another (app → extension):
    * the source system's tests are your behavior checklist
    * the source system's state management is your architecture reference
    * don't reinvent what's already been figured out

* what happens when you skip this
  * stories are too abstract — "tab behavior" instead of "close tab disposes model, edit pins ephemeral, middle-click closes without switching"
  * specs miss real constraints — "keep nav-tree.ts logic" when the logic doesn't handle subdirectories
  * agents build to the mock instead of the behavior — mock shows 3 files, agent renders 3 files, real repo has 20
  * tests pass against stale assumptions — 51 green, extension broken in 5 minutes of clicking

* how to read
  * read the source files yourself — don't delegate understanding to agents
  * use opus Explore agents for orientation (file counts, structure, finding things) — never haiku
  * be strategic: read the files that matter, not every file
    * state management / store — shows all state transitions
    * tests — show what behaviors the team thought mattered
    * the main rendering component — shows how state becomes UI
    * skip: utility files, config, types (read those when you hit a reference you don't understand)
  * budget: spending 100-200k tokens reading the codebase is cheap
    * it compensates for a vast amount of guessing
    * every token spent reading saves multiple agent rounds of building the wrong thing

* the time investment
  * reading the relevant source + tests for a feature area: 30 minutes
  * the cost of not reading: multiple agent rounds, manual bug discovery, retros explaining what went wrong
  * the architect's reading is the cheapest input in the pipeline and has the highest leverage
