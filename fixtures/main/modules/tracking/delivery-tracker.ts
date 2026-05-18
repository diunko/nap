/**
 * DeliveryTracker — tracks orders through warp transit.
 *
 * Once an order is dispatched through a gate, the tracker monitors:
 *   - Current phase (queued → in-transit → arriving → delivered)
 *   - Estimated arrival time (based on transit time + queue wait)
 *   - Warp signal strength (degrades with distance — Titan deliveries
 *     may lose tracking for 10-20 minute windows)
 *
 * The tracker is in-memory. If the service restarts, tracking state is lost.
 * This is acceptable for v1 — orders can be recovered from the gate logs.
 * Persistent tracking is a v2 concern.
 */

export type Phase = 'queued' | 'in-transit' | 'arriving' | 'delivered' | 'lost-signal';

export interface TrackingState {
  orderId: string;
  gateId: string;
  phase: Phase;
  dispatchedAt: number | null;
  estimatedArrivalAt: number | null;
  lastSignalAt: number;
  signalStrength: number; // 0-100, degrades with distance
}

// Signal degrades faster for distant destinations
const SIGNAL_DECAY_RATE: Record<string, number> = {
  mars: 0.1,     // barely noticeable — Mars is close
  europa: 2.0,   // noticeable — might lose signal briefly
  titan: 5.0,    // expect signal gaps
};

export class DeliveryTracker {
  private tracking: Map<string, TrackingState> = new Map();

  /**
   * Start tracking an order. Called when the order is queued at a gate.
   * The order starts in 'queued' phase and moves to 'in-transit' on dispatch.
   */
  startTracking(orderId: string, gateId: string, estimatedTransitMs: number): void {
    this.tracking.set(orderId, {
      orderId,
      gateId,
      phase: 'queued',
      dispatchedAt: null,
      estimatedArrivalAt: null,
      lastSignalAt: Date.now(),
      signalStrength: 100,
    });
  }

  /**
   * Mark an order as dispatched (entered the warp gate).
   * Transitions: queued → in-transit.
   */
  markDispatched(orderId: string, transitMs: number): void {
    const state = this.tracking.get(orderId);
    if (!state) return;

    const now = Date.now();
    state.phase = 'in-transit';
    state.dispatchedAt = now;
    state.estimatedArrivalAt = now + transitMs;
    state.lastSignalAt = now;
  }

  /**
   * Update signal strength. Called periodically by the gate heartbeat.
   *
   * Signal strength = 100 - (elapsed / total) * decayRate * 100
   * When it drops below 10, phase changes to 'lost-signal'.
   * Signal can recover if the warp corridor stabilizes.
   */
  updateSignal(orderId: string, destination: string): void {
    const state = this.tracking.get(orderId);
    if (!state || !state.dispatchedAt || !state.estimatedArrivalAt) return;

    const now = Date.now();
    const elapsed = now - state.dispatchedAt;
    const total = state.estimatedArrivalAt - state.dispatchedAt;
    const progress = Math.min(elapsed / total, 1);
    const decay = SIGNAL_DECAY_RATE[destination] ?? 1.0;

    state.signalStrength = Math.max(0, 100 - progress * decay * 100);
    state.lastSignalAt = now;

    if (state.signalStrength < 10 && state.phase === 'in-transit') {
      state.phase = 'lost-signal';
    } else if (state.signalStrength >= 10 && state.phase === 'lost-signal') {
      state.phase = 'in-transit'; // signal recovered
    }

    // Check if arrived
    if (progress >= 0.95 && state.phase !== 'delivered') {
      state.phase = 'arriving';
    }
    if (progress >= 1.0) {
      state.phase = 'delivered';
      state.signalStrength = 100; // full signal on arrival confirmation
    }
  }

  /** Get current tracking state for an order. */
  getState(orderId: string): TrackingState | undefined {
    return this.tracking.get(orderId);
  }

  /** Get all orders currently in transit. */
  getInTransit(): TrackingState[] {
    return Array.from(this.tracking.values())
      .filter(s => s.phase === 'in-transit' || s.phase === 'lost-signal');
  }
}
