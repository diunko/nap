# prompt craft — how to set agents up for success

* the compression problem
  * napkins are compressed — they only work if the reader can decompress them
  * "card focus system" means something to someone with context
  * to a fresh agent it's just two words
  * the architect's job: ensure every agent has enough context to decompress the napkin

* one level of indirection, max
  * prompt → files. no intermediate index files that point to other files.
  * agents lose things at each hop
  * the role file already does one hop (role → org docs). that's the budget.
  * everything else the agent needs: list directly in the prompt, flat

* the prompt template
  * layer 1: role → org docs (established, handled by role file)
  * layer 2: project context — flat list in the prompt
    * what we're building and why (the UX model, the problem being solved)
    * the vision (where this evolves — so they don't close off paths)
    * the approved design (what it should look like)
    * the workflow (how the user enters and uses the thing)
  * layer 3: the feature — napkin, spec, stories, test cases
  * layer 4: the task — what to build, what to keep, what to throw away

* context > instructions
  * an agent with deep context and a vague task will figure it out
  * an agent with detailed instructions and no context will miss the point
  * the designer had detailed instructions but didn't know it was Monaco
    * spent an hour being taught what the app actually is
  * the fs-eng had detailed CSP instructions but never understood the reading experience
    * built tests that bypassed every user action

* don't let agents test their own blind spots
  * if the same agent writes code and tests, the tests reflect the author's assumptions
  * the 47 tests that passed while the extension didn't work
    * every test used window.__ hooks that bypassed the actual UI
    * the tests proved internals worked. they didn't prove the user could use it.
  * the UX e2e test — the one that drove real fixes — used zero hooks
  * lesson: at least one test must do what a human does

* shared context docs
  * maintain a set of context docs in the nepic's 10-docs/
  * these are the materials the architect reads before writing prompts
  * the architect flattens the relevant links into each prompt
  * agents don't read the index — the architect does
  * when a new context doc is added, the architect includes it in future prompts
  * no automated discovery — the architect is the curator

* agent sequencing
  * respect data dependencies between agents
  * if agent A produces a file that agent B reads, B must wait for A
  * don't parallelize for convenience when there's a sequential dependency
  * if you want to launch both: include `nap3 nap <agent-A> --timeout N` in B's prompt
    * B waits for A to signal done, then reads the fresh file
    * the dependency is expressed in the prompt, not managed by the architect's timing

* the comprehension stack
  * every project has a "why" that agents need to feel, not just know
  * for the extension: PRs are hard to review → mini-books solve comprehension → extension brings mini-books to GitHub
  * an agent who feels this won't build a nav tree with triangles
  * an agent who just knows "build a nav tree" will reach for the nearest pattern
  * the UX model doc (navigation/map/territory) is the compression of this feeling
  * it's the most important thing an agent reads — before specs, before design, before code
