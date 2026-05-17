# wishlist

* fork session from current point (`--fork-session` flag)
  * use case: go on side-quests from the current context
  * CC supports this natively: `claude --resume <id> --fork-session --session-id <new-id>`
  * forks the conversation — new session has full history, diverges from there
  * the fork is a new agent — shows as additional [terminal] in nav
  * also shows as related tab in right pane
  * layout/behavior TBD — needs design thinking
  * simple version first: just the fork mechanic, minimal UI
