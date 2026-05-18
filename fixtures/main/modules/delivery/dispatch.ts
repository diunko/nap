/**
 * Dispatch — the final step before an order enters the warp gate.
 *
 * Dispatch happens when:
 *   1. The order reaches the front of the gate queue
 *   2. The alignment window for that destination is currently open
 *   3. The gate has capacity (not mid-transit with another order)
 *
 * If any condition fails, the order stays at the front and waits.
 */

import type { PizzaOrder } from './order-router';

export interface DispatchResult {
  orderId: string;
  gateId: string;
  dispatchedAt: number;
  alignmentWindowClosesAt: number;
}

// Alignment windows repeat on a cycle. Mars every 15 min, Europa every 2h, Titan every 6h.
const ALIGNMENT_CYCLES_MS: Record<string, number> = {
  mars: 900_000,
  europa: 7_200_000,
  titan: 21_600_000,
};

const WINDOW_DURATION_MS: Record<string, number> = {
  mars: 300_000,      // 5 min window
  europa: 600_000,    // 10 min window
  titan: 1_200_000,   // 20 min window — long because it's rare
};

/**
 * Check if the alignment window is currently open for a destination.
 *
 * Uses modular arithmetic on the current timestamp. The cycle is fixed —
 * every ALIGNMENT_CYCLES_MS milliseconds, a window of WINDOW_DURATION_MS opens.
 *
 * This is a simplification. Real planetary alignment is not periodic.
 * But for a pizza delivery API, close enough.
 */
export function isAlignmentOpen(destination: string, now: number = Date.now()): boolean {
  const cycle = ALIGNMENT_CYCLES_MS[destination];
  const duration = WINDOW_DURATION_MS[destination];
  if (!cycle || !duration) return false;

  const positionInCycle = now % cycle;
  return positionInCycle < duration;
}

/**
 * Attempt to dispatch an order through a gate.
 *
 * Returns null if the gate isn't ready (alignment closed, mid-transit).
 */
export async function tryDispatch(
  orderId: string,
  gateId: string,
  destination: string,
): Promise<DispatchResult | null> {
  const now = Date.now();

  if (!isAlignmentOpen(destination, now)) {
    return null; // Window closed — wait for next cycle
  }

  const cycle = ALIGNMENT_CYCLES_MS[destination] ?? 900_000;
  const duration = WINDOW_DURATION_MS[destination] ?? 300_000;
  const positionInCycle = now % cycle;
  const windowClosesAt = now + (duration - positionInCycle);

  return {
    orderId,
    gateId,
    dispatchedAt: now,
    alignmentWindowClosesAt: windowClosesAt,
  };
}
