# Chapter 5: Putting It Together

## The Full Pipeline

Here's the complete flow for one order, from click to delivery:

```
Customer places order
    ↓
routeOrder()           [order-router.ts:54](/modules/delivery/order-router.ts#L54)
    ├→ validateOrder() [crust-validator.ts:40](/modules/validation/crust-validator.ts#L40)
    │   └→ rejected? → return immediately, order never touches queue
    ├→ findShortestQueue() [warp-queue.ts:31](/modules/queue/warp-queue.ts#L31)
    │   └→ all full? → holdOrder(), wait for space
    ├→ enqueue()       [warp-queue.ts:56](/modules/queue/warp-queue.ts#L56)
    │   └→ priority handling: rush front, express middle, standard back
    └→ startTracking() [delivery-tracker.ts:41](/modules/tracking/delivery-tracker.ts#L41)
        └→ phase: queued

... order waits in queue ...

tryDispatch()          [dispatch.ts:57](/modules/delivery/dispatch.ts#L57)
    ├→ isAlignmentOpen() [dispatch.ts:43](/modules/delivery/dispatch.ts#L43)
    │   └→ closed? → wait, try again next second
    └→ open + gate idle → dispatch!
        └→ markDispatched() [delivery-tracker.ts:57](/modules/tracking/delivery-tracker.ts#L57)
            └→ phase: in-transit

... pizza in warp ...

updateSignal()         [delivery-tracker.ts:75](/modules/tracking/delivery-tracker.ts#L75)
    ├→ signal < 10 → phase: lost-signal
    ├→ signal recovers → phase: in-transit
    ├→ progress ≥ 95% → phase: arriving
    └→ progress = 100% → phase: delivered
```

## What We Got Right

**Validation is sync and stateless.** No database call, no async operation. A bad order is rejected in microseconds, before it ever touches a gate queue. This was controversial — the TA argued for a separate validation service. But inline validation means the routing path has one fewer network hop and one fewer failure mode.

**Gate clusters isolate destinations.** A Mars gate can't accidentally receive a Titan order. The routing layer enforces this through [GATE_CLUSTERS](/modules/delivery/order-router.ts#L33). This is a hard constraint, not a soft preference.

**Priority is simple and brutal.** Three tiers, deterministic ordering, no fairness guarantees for standard. The business owns this decision. Engineering just implements the `unshift` / `splice` / `push`.

## What We Got Wrong (Known Issues)

**Alignment window boundary bug.** Orders dispatched in the last ~100ms of a window may fail because the gate hardware needs initiation time. See [dispatch.ts:43](/modules/delivery/dispatch.ts#L43) — the fix is a buffer subtraction. Not done yet because it hasn't caused customer-visible failures (the dispatch loop retries next second).

//TA: it HAS caused customer-visible failures. gate-m2 drops ~0.3% of orders at window boundaries. they get re-queued automatically but the customer sees a brief "error" flash in the tracking UI.
//A: ok, prioritizing the fix. 200ms buffer, one-line change in isAlignmentOpen.

**In-memory everything.** Queues, tracking state, hold queues — all in-memory. Service restart means re-queuing from gate logs. For Mars (3min transit, short queues), this is barely noticeable. For Titan (80min transit, tracking gap), it's bad. v2 adds Redis for queues and tracking.

**Titan signal gap.** 48 minutes of radio silence is real. We're honest about it ("tracking resumes closer to destination") but it's not great. Relay beacons or predictive tracking are v2.

## What's Not in This PR

- **Dispatch loop** — the process that calls `tryDispatch()` every second. That's a separate service, not part of the routing library.
- **Customer-facing API** — the REST endpoints that accept orders and return tracking state. This PR is the core logic; the API layer wraps it.
- **Metrics/alerting** — gate utilization, queue depths, signal loss rates. Critical for operations, but a separate concern.
- **Config-driven validation** — crust rules are hardcoded. Making them config-driven is [napkin 0200](/30-napkins/0200-crust-validation/0200-crust-validation.nap.md).

## Reading Order

If you're doing a code review, here's the order that makes the most sense:

1. [crust-validator.ts](/modules/validation/crust-validator.ts#L1) — stateless, standalone, no dependencies. Read first to understand what gets rejected.
2. [warp-queue.ts](/modules/queue/warp-queue.ts#L1) — the data structure. Priority handling is the interesting part.
3. [order-router.ts](/modules/delivery/order-router.ts#L1) — the entry point. Now you understand what it calls.
4. [dispatch.ts](/modules/delivery/dispatch.ts#L1) — alignment windows. The modular arithmetic is the tricky bit.
5. [delivery-tracker.ts](/modules/tracking/delivery-tracker.ts#L1) — signal decay. The weakest module architecturally, but does its job for v1.

Previous: [04-tracking.md](04-tracking.md)
