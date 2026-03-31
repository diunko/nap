* 0600 — polish: things to fix
  * living doc — add items as they come up during use
  * consolidate, prioritize, then launch agents

* debug panel default closed
  * problem: flickers open briefly on app launch even when saved state says collapsed
  * default to closed for all users
  * preserve state after first toggle (if user opens it, remember that)
  * fix: render collapsed initially, expand only after state load confirms it should be open
