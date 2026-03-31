* 0600 — polish: things to fix
  * living doc — add items as they come up during use
  * consolidate, prioritize, then launch agents

* debug panel default closed
  * flickers on open even when state says collapsed
  * default to closed for all users
  * preserve state after first toggle (if user opens it, remember that)
  * fix the flicker — probably rendering full panel then collapsing on state load
    * render collapsed initially, expand only after state confirms it should be open
