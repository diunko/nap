# delivery pipeline — order routing through warp gates

* the problem
  * customer orders pizza from Earth, destination is Mars/Europa/Titan
  * warp gates only work during planetary alignment windows
  * multiple gates per destination, each with a queue
  * need to pick the best gate, queue the order, track it through transit

* the approach
  * validate → route → queue → dispatch → track
  * validation is sync (fast, inline, no side effects)
  * routing picks shortest queue across gate cluster
  * dispatch waits for alignment window, then sends
  * tracking degrades with distance (Titan = expect signal gaps)

* the hard part
  * alignment windows are periodic — miss one, wait for next cycle
  * Mars: every 15min (5min window) — forgiving
  * Titan: every 6h (20min window) — miss it and the pizza is cold
  * priority orders (warp-rush) skip the queue — but still wait for alignment
