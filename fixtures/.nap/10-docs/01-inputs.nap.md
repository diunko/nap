# space-pizza — what you're reading about

* the project
  * interplanetary pizza delivery API
  * routes orders from Earth to Mars/Europa/Titan via warp gates
  * four modules: delivery, queue, validation, tracking

* why this mini-book exists
  * PR adds the order routing pipeline — the core feature
  * 4 new files, ~400 lines, lots of decisions worth explaining
  * the reviewer needs to understand: why gate clusters? why hold queues? why sync validation?

* the .nap repo
  * this is the guide repo — separate from the code
  * mini-book chapters link into the code repo via file:line references
  * reviewer reads here, clicks links, sees the code

* what to read
  * `30-napkins/0100-delivery-pipeline/mini-book/` — 5 chapters walking through the full order lifecycle
  * start with 01, read in order, click the links
