/**
 * OrderRouter — receives customer orders and dispatches them to the right warp gate.
 *
 * The routing decision depends on two things:
 *   1. The destination planet (determines which gate cluster to use)
 *   2. The current alignment window (gates only work during planetary alignment)
 *
 * If no gate is available, the order enters a hold queue until the next window opens.
 */

import { WarpQueue } from '../queue/warp-queue';
import { validateOrder } from '../validation/crust-validator';
import { DeliveryTracker } from '../tracking/delivery-tracker';

export interface PizzaOrder {
  id: string;
  customer: string;
  destination: 'mars' | 'europa' | 'titan';
  crust: 'thin' | 'deep-dish' | 'stuffed' | 'cosmic-fold';
  toppings: string[];
  priority: 'standard' | 'express' | 'warp-rush';
  createdAt: number;
}

export interface RouteResult {
  orderId: string;
  gateId: string;
  estimatedTransitMs: number;
  status: 'queued' | 'hold' | 'rejected';
}

// Gate clusters by destination. Each planet has 2-3 gates for redundancy.
const GATE_CLUSTERS: Record<string, string[]> = {
  mars: ['gate-m1', 'gate-m2', 'gate-m3'],
  europa: ['gate-e1', 'gate-e2'],
  titan: ['gate-t1'],
};

// Transit times in milliseconds (at warp speed, obviously)
const TRANSIT_MS: Record<string, number> = {
  mars: 180_000,      // 3 minutes — it's close
  europa: 2_400_000,  // 40 minutes — Jupiter is far
  titan: 4_800_000,   // 80 minutes — Saturn, bring a book
};

/**
 * Route an order to the best available warp gate.
 *
 * The "best" gate is the one with the shortest queue. If all gates for the
 * destination are full (queue depth > MAX_QUEUE_DEPTH), the order goes on hold.
 *
 * Express and warp-rush orders skip the queue and go to the front.
 */
export async function routeOrder(
  order: PizzaOrder,
  queue: WarpQueue,
  tracker: DeliveryTracker,
): Promise<RouteResult> {
  // Validate first — reject bad crusts before they waste a gate slot
  const validation = validateOrder(order);
  if (!validation.valid) {
    return { orderId: order.id, gateId: '', estimatedTransitMs: 0, status: 'rejected' };
  }

  const gates = GATE_CLUSTERS[order.destination];
  if (!gates || gates.length === 0) {
    return { orderId: order.id, gateId: '', estimatedTransitMs: 0, status: 'rejected' };
  }

  // Find the gate with the shortest queue
  const bestGate = await queue.findShortestQueue(gates);

  if (!bestGate) {
    // All gates full — hold until next alignment window
    await queue.holdOrder(order.id, order.destination);
    return { orderId: order.id, gateId: '', estimatedTransitMs: 0, status: 'hold' };
  }

  // Queue the order
  const position = await queue.enqueue(bestGate, order.id, order.priority);
  const transitMs = TRANSIT_MS[order.destination] ?? TRANSIT_MS.mars;

  // Start tracking
  tracker.startTracking(order.id, bestGate, transitMs);

  return {
    orderId: order.id,
    gateId: bestGate,
    estimatedTransitMs: transitMs + position * 30_000, // 30s per position in queue
    status: 'queued',
  };
}
