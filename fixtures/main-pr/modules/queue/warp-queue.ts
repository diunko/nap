/**
 * WarpQueue — manages per-gate order queues.
 *
 * Each warp gate has its own queue. Orders wait here until:
 *   1. They reach the front
 *   2. The alignment window opens
 *   3. The gate completes its current transit
 *
 * Priority orders (express, warp-rush) skip to the front.
 * Standard orders are FIFO.
 *
 * Hold queue is separate — orders waiting for ANY gate to become available.
 */

export interface QueueEntry {
  orderId: string;
  priority: 'standard' | 'express' | 'warp-rush';
  enqueuedAt: number;
}

const MAX_QUEUE_DEPTH = 50;

// Capacity warning threshold — emit warning when queue reaches 80%
const CAPACITY_WARNING_THRESHOLD = 0.8;

export class WarpQueue {
  private queues: Map<string, QueueEntry[]> = new Map();
  private holdQueue: Map<string, string[]> = new Map(); // destination → orderIds
  private warnings: Array<{ gateId: string; depth: number; timestamp: number }> = [];

  /**
   * Find the gate with the shortest queue from a set of candidates.
   * Returns null if all gates are at MAX_QUEUE_DEPTH.
   */
  async findShortestQueue(gateIds: string[]): Promise<string | null> {
    let best: string | null = null;
    let bestLength = Infinity;

    for (const gateId of gateIds) {
      const queue = this.queues.get(gateId) ?? [];
      if (queue.length < MAX_QUEUE_DEPTH && queue.length < bestLength) {
        best = gateId;
        bestLength = queue.length;
      }
    }

    return best;
  }

  /**
   * Add an order to a gate's queue.
   *
   * Priority handling:
   *   - warp-rush: position 0 (front of queue, even before other rush orders — last in wins)
   *   - express: after all rush orders, before all standard
   *   - standard: back of queue
   *
   * Returns the order's position in the queue (0 = next to dispatch).
   * Emits a capacity warning if queue crosses the 80% threshold.
   */
  async enqueue(gateId: string, orderId: string, priority: string): Promise<number> {
    if (!this.queues.has(gateId)) {
      this.queues.set(gateId, []);
    }
    const queue = this.queues.get(gateId)!;
    const entry: QueueEntry = { orderId, priority: priority as QueueEntry['priority'], enqueuedAt: Date.now() };

    if (priority === 'warp-rush') {
      queue.unshift(entry);
      this.checkCapacity(gateId, queue);
      return 0;
    }

    if (priority === 'express') {
      // Insert after all rush orders
      const insertAt = queue.findIndex(e => e.priority !== 'warp-rush');
      if (insertAt === -1) {
        queue.push(entry);
        this.checkCapacity(gateId, queue);
        return queue.length - 1;
      }
      queue.splice(insertAt, 0, entry);
      this.checkCapacity(gateId, queue);
      return insertAt;
    }

    // Standard — back of queue
    queue.push(entry);
    this.checkCapacity(gateId, queue);
    return queue.length - 1;
  }

  /** Check if queue crossed capacity warning threshold. */
  private checkCapacity(gateId: string, queue: QueueEntry[]): void {
    const ratio = queue.length / MAX_QUEUE_DEPTH;
    if (ratio >= CAPACITY_WARNING_THRESHOLD) {
      this.warnings.push({ gateId, depth: queue.length, timestamp: Date.now() });
    }
  }

  /** Get recent capacity warnings. */
  getWarnings(since?: number): Array<{ gateId: string; depth: number; timestamp: number }> {
    if (since) return this.warnings.filter(w => w.timestamp >= since);
    return [...this.warnings];
  }

  /** Move an order to the hold queue (all gates full). */
  async holdOrder(orderId: string, destination: string): Promise<void> {
    if (!this.holdQueue.has(destination)) {
      this.holdQueue.set(destination, []);
    }
    this.holdQueue.get(destination)!.push(orderId);
  }

  /** Peek at the front of a gate's queue without removing. */
  peek(gateId: string): QueueEntry | undefined {
    return this.queues.get(gateId)?.[0];
  }

  /** Remove the front order from a gate's queue (after dispatch). */
  dequeue(gateId: string): QueueEntry | undefined {
    return this.queues.get(gateId)?.shift();
  }

  /** Get queue depth for a gate. */
  depth(gateId: string): number {
    return this.queues.get(gateId)?.length ?? 0;
  }
}
