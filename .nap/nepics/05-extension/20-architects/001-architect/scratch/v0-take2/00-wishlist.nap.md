# v0-take2 — wishlist

* fixtures
  * move to /fixtures/{main,.nap} in monorepo
  * keep same github urls (diunko/nap-test-main, diunko/nap-test-nap)
  * replace copy-pipeline fiction with something new
  * main repo: a tiny fictional project, not referencing any internal codebase
  * .nap repo: mini-book chapters with file:line links into main repo
  * idea: space-pizza — interplanetary pizza delivery API
    * main repo has: order-router.ts, warp-queue.ts, crust-validator.ts
    * .nap mini-book walks through "how an order gets from Earth to Mars"
    * file:line links: [order-router.ts:23](modules/delivery/order-router.ts#L23) etc
    * funny enough to not look corporate, small enough to clone in 2s
