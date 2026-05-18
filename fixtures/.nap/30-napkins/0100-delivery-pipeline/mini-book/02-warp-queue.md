# Chapter 2: The Warp Queue

## Why Queues Exist

A warp gate can only transit one order at a time. The pizza enters the gate, the gate fires, the pizza is in warp for N minutes, then the gate resets and is ready for the next one. During transit, the gate is occupied.

With Mars gates firing every few minutes and 3 gates available, the queue is usually short. But during peak hours (Earth lunch time across all timezones — a rolling 12-hour window), gate-m1 through gate-m3 can each have 20+ orders queued.

## The WarpQueue Class

[warp-queue.ts:23](/modules/queue/warp-queue.ts#L23) — one instance manages all gate queues. Each gate has its own FIFO list, plus a separate hold queue per destination.

The key design decision: queues are in-memory. No database, no persistence. If the service restarts, queues are lost. Orders aren't lost — the gates log every dispatch — but queue position is gone and orders need to be re-queued.

//DU: this seems fragile?
//A: it is. but queue state changes every 30 seconds. persisting to a database at that frequency adds latency to every enqueue. for v1, in-memory is the right call. v2 should use Redis or similar — fast writes, survives restart.

## Priority Handling

Not all pizzas are equal. The priority system at [warp-queue.ts:56](/modules/queue/warp-queue.ts#L56):

- **warp-rush** — front of the queue, even before other rush orders. Last in wins. This is the "I'm paying 10x and I need this pizza NOW" tier.
- **express** — after all rush orders, before all standard. A gentler skip.
- **standard** — back of the queue. FIFO.

```typescript
if (priority === 'warp-rush') {
  queue.unshift(entry);
  return 0;
}
```

The `unshift` is intentional and controversial. If two warp-rush orders arrive close together, the second one goes ahead of the first. We tried maintaining FIFO within priority tiers, but the code was more complex and warp-rush customers don't care about fairness — they care about speed.

//TA: what happens if a standard order has been waiting 45 minutes and a warp-rush comes in? the standard order just... waits more?
//A: yes. standard orders have no SLA. if you want guarantees, upgrade to express. the business decided this, not us.

## Hold Queue

When all gates for a destination are full (50 orders each), new orders don't get rejected — they enter the hold queue ([warp-queue.ts:85](/modules/queue/warp-queue.ts#L85)). The hold queue is per-destination, not per-gate.

The dispatcher (chapter 3) periodically checks hold queues and moves orders to gates as space opens up. The customer sees the same "queued" status regardless.

## Queue Depth and Back-pressure

MAX_QUEUE_DEPTH is 50 ([warp-queue.ts:23](/modules/queue/warp-queue.ts#L23)). This isn't arbitrary:

- At 30s per order, 50 orders = 25 minutes of wait time
- Mars alignment window is 5 minutes every 15 minutes
- A gate can dispatch ~10 orders per window (30s transit + reset time)
- 50 orders = ~5 windows = ~75 minutes worst case

Beyond 50, the wait time exceeds any reasonable delivery promise. Better to hold and redistribute than to promise an ETA we can't keep.

Previous: [01-order-routing.md](01-order-routing.md)
Next: [03-dispatch.md](03-dispatch.md)
