# crust validation — what can survive warp transit

* the problem
  * different crusts degrade differently in warp transit
  * cosmic-fold collapses at Jupiter+ distances
  * deep-dish can't reheat after 80min (Titan)
  * need destination-specific crust rules

* current state
  * hardcoded in DISTANCE_SENSITIVE_CRUSTS map
  * works but not extensible — new crust types require code change
  * should probably be config-driven

* backlog because
  * current hardcoded rules are correct and tested
  * config-driven is a nice-to-have, not blocking
