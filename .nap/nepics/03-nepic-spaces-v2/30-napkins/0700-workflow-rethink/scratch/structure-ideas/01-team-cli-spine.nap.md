* structure idea 1: team sheet + CLI as spine + embedded examples
  * one shared doc everyone reads: the team, the pipeline, the commands — woven together
  * then a compact role file for identity + voice

* 00-org/
  * 10-how-we-work.md — the single shared doc
    * the team (5 lines: architect, guardian, TA, fs-eng, TE — what each cares about)
    * the pipeline as CLI commands
      * napkin → `nap3 create napkin 0100-feature`
      * spec → architect writes it, puts it in the napkin dir
      * test arch → `nap3 create agent ... --role test-arch` → write prompt.md → `nap3 start`
      * code → same flow, fs-eng
      * tests → same flow, test-eng
      * iterate → architect routes failures
    * embedded example: a real prompt.md for a test-arch (5-10 lines)
    * embedded example: a real response.md (5 lines)
    * the rules that matter: nap3 done, response.md, don't poke messages
    * marker files: .agent.nap.json, .napkin.nap.json — what they are, one sentence each
  * 40-roles/
    * architect.md — identity, voice, what you own, what you never do (write code)
    * guardian.md — identity, what's normal per role, escalation
    * test-architect.md — identity, what makes a good test case, small vs medium
    * fullstack-eng.md — identity, shape code for testability, TypeScript strict
    * test-eng.md — identity, implement don't invent, run until green

* feel
  * concrete — you learn by reading real commands and real artifacts
  * scannable — team section is 5 lines, pipeline is ~20 lines with commands
  * role files are short — identity not procedure
  * one shared mental model — everyone reads the same 10-how-we-work.md
