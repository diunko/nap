# Chapter 3: Dispatch — Alignment Windows and the Gate

## The Dispatch Decision

An order reaches the front of a gate's queue. Now what?

The dispatcher checks two things:
1. Is the alignment window open for this destination?
2. Is the gate idle (not mid-transit)?

Both must be true. If either is false, the order stays at the front and waits. No re-routing — the order already committed to this gate when it was queued.

//DU: why not re-route to another gate if this one's window is closed?
//A: because re-routing requires leaving the current queue and joining another one. if the other gate's queue is longer, you've made things worse. and the alignment windows for same-destination gates are synchronized — if gate-m1's window is closed, gate-m2's window is also closed. they all point at the same planet.

## Alignment Windows

[dispatch.ts:43](/modules/delivery/dispatch.ts#L43) — `isAlignmentOpen()` uses modular arithmetic on the timestamp:

```typescript
export function isAlignmentOpen(destination: string, now: number = Date.now()): boolean {
  const cycle = ALIGNMENT_CYCLES_MS[destination];
  const duration = WINDOW_DURATION_MS[destination];
  if (!cycle || !duration) return false;
  const positionInCycle = now % cycle;
  return positionInCycle < duration;
}
```

The model is simple: every `cycle` milliseconds, a window of `duration` milliseconds opens. Mars: 5-minute window every 15 minutes. Europa: 10-minute window every 2 hours. Titan: 20-minute window every 6 hours.

This is a simplification. Real planetary alignment is NOT periodic — orbital mechanics are elliptical, gravitational assists change the equation, warp corridors shift. But for a v1 API, periodic windows are close enough and much easier to reason about.

The risk is at cycle boundaries. At `positionInCycle = 0`, the window just opened. At `positionInCycle = duration - 1`, it's about to close. Dispatching an order 1ms before the window closes is technically valid but practically dangerous — the gate might not complete the transit handshake in time.

//TA: this is exactly the bug we found. gate-m2 drops orders dispatched in the last 100ms of the window. the modular arithmetic says "open" but the gate hardware needs 100ms to initiate.
//A: filed as a known issue. fix: subtract a GATE_INITIATION_BUFFER (200ms to be safe) from the duration check. easy fix, just hasn't been prioritized.

## The Dispatch Attempt

[dispatch.ts:57](/modules/delivery/dispatch.ts#L57) — `tryDispatch()` returns null if the gate isn't ready, or a `DispatchResult` if the order was sent:

```typescript
export async function tryDispatch(
  orderId: string,
  gateId: string,
  destination: string,
): Promise<DispatchResult | null> {
  const now = Date.now();
  if (!isAlignmentOpen(destination, now)) {
    return null;
  }
  // ... calculate window close time, return result
}
```

The caller (the dispatch loop, not shown in this PR) calls `tryDispatch()` for the front-of-queue order every second. When it returns non-null, the order is dispatched and removed from the queue.

## Window Close Time

The `DispatchResult` includes `alignmentWindowClosesAt` — when the current window ends. This is useful for two things:

1. **Customer ETA** — if the window closes in 30 seconds and there are 5 orders ahead, we know those 5 won't make this window. The next window is `cycle - duration` milliseconds away.
2. **Dispatcher pacing** — don't dispatch an order if the window closes in less than the gate initiation time (the bug mentioned above).

## What Happens After Dispatch

The order enters warp. The gate is busy for `transitMs` milliseconds. The tracker takes over. Chapter 4 covers tracking — how we monitor orders through warp transit and what happens when we lose signal.

Previous: [02-warp-queue.md](02-warp-queue.md)
Next: [04-tracking.md](04-tracking.md)
