# Chapter 1: How an Order Gets from Earth to Mars

## The Journey

A customer on Earth orders a pizza for delivery to Mars. Between "order placed" and "pizza arrives" are four steps, each in its own module. This chapter covers the first and most important: routing.

The router's job: given an order, pick the best warp gate and queue the order at that gate. Simple to state, but the details matter — the wrong gate choice means an extra 15 minutes waiting for the next alignment window, and by then the crust is compromised.

## The Entry Point

**`routeOrder()`** in [order-router.ts:54](/modules/delivery/order-router.ts#L54) is where every order starts.

It does three things, in this order:

1. **Validate** — call `validateOrder()` to check crust/destination compatibility and topping limits. This is synchronous and fast ([crust-validator.ts:40](/modules/validation/crust-validator.ts#L40)). Rejected orders never touch the queue.

2. **Find the best gate** — each destination has a cluster of 2-3 gates. The router picks the one with the shortest queue ([warp-queue.ts:31](/modules/queue/warp-queue.ts#L31)). If ALL gates are at max capacity (50 orders), the order enters a hold queue.

3. **Queue and track** — the order goes into the gate's queue, and the tracker starts monitoring it ([delivery-tracker.ts:41](/modules/tracking/delivery-tracker.ts#L41)).

```typescript
const bestGate = await queue.findShortestQueue(gates);
if (!bestGate) {
  await queue.holdOrder(order.id, order.destination);
  return { orderId: order.id, gateId: '', estimatedTransitMs: 0, status: 'hold' };
}
```

The hold path is important — it's not a failure. It means "all gates are busy, we'll try again when one frees up." The customer sees "queued" either way; the difference is internal.

## Gate Clusters

Each destination has its own gates. This is a physical constraint — a gate tuned for Mars can't reach Titan. The clusters are defined in [order-router.ts:33](/modules/delivery/order-router.ts#L33):

```
mars:   gate-m1, gate-m2, gate-m3  (3 gates — Mars is popular)
europa: gate-e1, gate-e2           (2 gates)
titan:  gate-t1                    (1 gate — Titan is niche)
```

//DU: should we add a gate-t2? single point of failure for Titan
//A: not yet — Titan orders are <1% of volume. one gate handles it. if it goes down, orders hold until it recovers. adding a gate is expensive (alignment calibration takes weeks).

## Transit Times

After dispatch, the pizza is in warp. Transit times are fixed per destination ([order-router.ts:40](/modules/delivery/order-router.ts#L40)):

- **Mars:** 3 minutes — practically instant. This is why Mars deliveries dominate.
- **Europa:** 40 minutes — Jupiter distance. Crust quality degrades but is still edible.
- **Titan:** 80 minutes — Saturn. Only thin crust and stuffed survive the transit. Deep-dish arrives as a brick.

The ETA the customer sees includes both transit time AND wait time in the queue. Each position in the queue adds ~30 seconds. The queue depth formula is documented at https://docs.warp-logistics.dev/gate-api and implemented in warp-queue.ts:31.

## What Happens Next

The order is now sitting in a gate's queue. Chapter 2 covers what happens when it reaches the front: the alignment window check and dispatch decision.

Next: [02-warp-queue.md](02-warp-queue.md)
