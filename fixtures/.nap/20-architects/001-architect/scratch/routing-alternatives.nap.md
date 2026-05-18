# routing alternatives considered

* shortest-queue (current)
  * simple, predictable
  * downside: doesn't account for alignment window timing
  * an order queued at gate-m1 might wait 14min for alignment, while gate-m3 opens in 30s

* alignment-aware routing
  * pick gate whose window opens soonest, weighted by queue depth
  * better ETA but harder to reason about
  * risk: oscillation — all orders rush to the "next to open" gate

* decided: shortest-queue for v1
  * alignment-aware is a v2 optimization
  * //DU: agree — ship simple, measure, then optimize
