* structure idea 2: Feynman lecture + journey map
  * one narrative doc — follow a napkin from idea to shipped
  * each role introduced at the moment they matter
  * philosophy emerges from the story, not from a manifesto section

* 00-org/
  * 10-how-we-work.md — the story
    * starts: "you have an idea. maybe it's been rattling around, maybe it just hit you."
    * the architect brainstorms with you. 15 minutes. /napkin skill. what survives fits on a napkin.
    * the napkin exists now: `nap3 create napkin 0100-feature`
    * the architect writes a spec — not a doc, just the constraints an implementer can't derive
    * but who tests this? not the person who designed it — their blind spots are baked in
      * enter the test architect. fresh eyes. reads the spec. thinks about seams.
      * `nap3 create agent 001-test-arch --role test-arch` → prompt.md → `nap3 start`
    * the test architect delivers test.md — what to test, where it breaks, how to verify
    * now someone builds it. the fullstack engineer reads spec + test.md
      * they shape the code so the tests are possible — APIs, boundaries, injectables
      * `nap3 create agent 002-fs-eng --role fs-eng` → prompt.md → `nap3 start`
    * code exists. now someone who didn't write it tests it.
      * enter the test engineer. reads test.md + the code. writes tests. runs them.
      * tests fail → architect routes: code bug? spec problem? test wrong?
      * loop until green
    * meanwhile, the guardian watches. every tool call goes through permission review.
      * most are routine — guardian approves silently
      * one looks off — guardian asks you in its terminal: "this agent wants to push to main. approve?"
    * the napkin ships. `nap3 set-status 0100-feature done`
    * you click (+). a new nepic. fresh architect. standing on what you just built.
  * 40-roles/ — compact identity files (same as idea 1)

* feel
  * engaging — you learn by following a story, not reading a manual
  * philosophy earned — "why separate agents?" answered by the story, not stated
  * every CLI command appears in context — you know when and why to use it
  * risk: harder to scan for reference later (narrative vs structured)
