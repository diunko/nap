# Chapter 4: Tracking Through Warp

## The Problem with Distance

Once an order enters warp, we can't touch it. No cancellations, no re-routing, no "actually make that a deep-dish." The pizza is a photon packet in a warp corridor, moving at speeds that make TCP look glacial.

What we CAN do is track it. The warp corridor emits a beacon signal that the gate picks up. The signal tells us: the order is still in transit, it hasn't been lost to corridor collapse, and its approximate position.

The problem: signal strength degrades with distance. Mars deliveries maintain near-perfect signal throughout. Titan deliveries lose signal entirely for 10-20 minute windows in the middle of transit.

## The Tracker

[delivery-tracker.ts:34](/modules/tracking/delivery-tracker.ts#L34) — `DeliveryTracker` is an in-memory state machine. Each order goes through phases:

```
queued → in-transit → [lost-signal →] arriving → delivered
```

The `lost-signal` phase is optional and reversible. Signal can recover when the warp corridor passes through a region with better corridor geometry. The customer sees "tracking temporarily unavailable" — not "your pizza is lost."

## Signal Decay

[delivery-tracker.ts:28](/modules/tracking/delivery-tracker.ts#L28) — decay rates per destination:

```typescript
const SIGNAL_DECAY_RATE: Record<string, number> = {
  mars: 0.1,     // barely noticeable
  europa: 2.0,   // noticeable, brief gaps
  titan: 5.0,    // expect extended gaps
};
```

The `updateSignal()` method at [delivery-tracker.ts:75](/modules/tracking/delivery-tracker.ts#L75) computes signal strength based on progress through transit and the decay rate. When strength drops below 10, the phase changes to `lost-signal`.

```typescript
state.signalStrength = Math.max(0, 100 - progress * decay * 100);
```

For Mars (decay 0.1): signal never drops below 90. You always know where your pizza is.

For Titan (decay 5.0): signal hits zero around 20% into transit and doesn't recover until ~80%. That's 48 minutes of radio silence on an 80-minute journey. The customer sees their pizza enter the gate, then nothing for almost an hour, then "arriving."

//DU: that's a terrible customer experience
//A: agreed. two options we're considering for v2:
  * relay beacons at the Jupiter Lagrange points (expensive, but cuts the gap to ~10 min)
  * predictive tracking — we know the corridor path, so we can estimate position even without signal
  * for now, we show "in warp — tracking resumes closer to destination" which is honest if not satisfying

## In-Memory Limitation

The tracker is the weakest part of the architecture. It's in-memory, which means:

- Service restart = all tracking state lost
- The gate knows the order was dispatched (it has logs)
- But we don't know the current phase, signal strength, or ETA

For a Mars order (3 min transit), this barely matters — the order will arrive before anyone notices. For a Titan order (80 min transit), losing tracking mid-flight means the customer sees "unknown" for potentially an hour.

//A: this is the strongest argument for persistent state in v2. the tracker is the one component where in-memory is genuinely painful, not just theoretically fragile.

## Arrival Detection

At 95% progress, the phase changes to `arriving`. At 100%, `delivered`. These thresholds are hardcoded in [delivery-tracker.ts:96](/modules/tracking/delivery-tracker.ts#L96).

The 95% → arriving transition is a UX choice. We could wait for 100%, but customers appreciate the heads-up. "Your pizza is arriving" lets them get to the airlock.

Previous: [03-dispatch.md](03-dispatch.md)
Next: [05-putting-it-together.md](05-putting-it-together.md)
