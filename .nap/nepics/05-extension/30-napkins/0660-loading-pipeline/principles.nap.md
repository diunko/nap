# principles — pipeline design + testing

* pipeline design
  * Rich Hickey — "Simple Made Easy", "The Value of Values"
    * separate what happens from when and how it's communicated
    * each step: pure operation, input → result | error
    * pipeline orchestrates sequence. UI observes state. no reaching in.
  * Kleppmann — "Designing Data-Intensive Applications" ch. 11-12
    * idempotent operations → natural retry safety
    * staging pattern = exactly-once semantics without transactions
    * clone into .tmp, rename on success. retry = same result.
  * Guy Steele — "Growing a Language"
    * small composable pieces that combine
    * step = `async (ctx) → result | error`
    * pipeline = `steps.reduce`
    * UI = `state → view`
  * Unix pipes
    * each step reads input, writes output, reports errors
    * shell orchestrates. failure stops the pipe. retry = run again.
    * the pipeline IS this, with async steps and UI instead of terminal

* testing approach
  * Nygaard — "Release It!"
    * don't test that things work — test that things fail gracefully
    * for each step: when it fails, does everything around it stay sane?
    * stability patterns: bulkheads, timeouts, circuit breakers
  * Bach & Bolton — "Rapid Software Testing"
    * testing is exploration, not verification
    * "what happens if?" over "verify that"
    * SFDPO heuristic:
      * Structure — step order, dependencies
      * Function — each step's error modes
      * Data — what flows between steps, malformed inputs
      * Platform — Chrome APIs, IDB, network unavailable
      * Operations — retry, close, reopen mid-flight
  * John Hughes — QuickCheck / property-based testing
    * don't write examples, write properties
    * "after any sequence of successes, failures, and retries: user never sees partial state"
    * throw random failure patterns at the pipeline, check invariants hold
  * Dijkstra
    * "testing shows the presence, not the absence of bugs"
    * choose tests that reveal the most about behavior under stress
    * one mid-flight failure test teaches more than ten happy-path tests
