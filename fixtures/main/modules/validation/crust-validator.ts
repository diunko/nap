/**
 * CrustValidator — rejects invalid orders before they waste a gate slot.
 *
 * Rules:
 *   1. Cosmic-fold crust can only go to Mars (fold collapses at Jupiter+ distances)
 *   2. Deep-dish to Titan is banned (takes too long to heat after 80min in warp)
 *   3. Maximum 12 toppings (more toppings = more mass = more fuel = gate rejects it)
 *   4. "pineapple" is always valid (we don't judge)
 *
 * Validation is synchronous and stateless. No database, no side effects.
 * This is intentional — validation must be fast enough to run inline in the
 * routing path, not as a separate async step.
 */

import type { PizzaOrder } from '../delivery/order-router';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const MAX_TOPPINGS = 12;

// Crusts that degrade during long warp transit
const DISTANCE_SENSITIVE_CRUSTS: Record<string, string[]> = {
  'cosmic-fold': ['europa', 'titan'],  // fold collapses beyond Mars distance
  'deep-dish': ['titan'],              // can't reheat after 80min transit
};

/**
 * Validate a pizza order.
 *
 * Returns { valid: true, errors: [] } if the order is OK.
 * Returns { valid: false, errors: [...] } with human-readable error messages.
 *
 * Design decision: collect ALL errors, don't fail fast.
 * A customer submitting a cosmic-fold with 15 toppings to Titan should see
 * all three problems at once, not fix them one at a time.
 */
export function validateOrder(order: PizzaOrder): ValidationResult {
  const errors: string[] = [];

  // Rule 1 & 2: crust + destination compatibility
  const restricted = DISTANCE_SENSITIVE_CRUSTS[order.crust];
  if (restricted && restricted.includes(order.destination)) {
    errors.push(
      `${order.crust} crust cannot be delivered to ${order.destination} — ` +
      `crust degrades during ${order.destination === 'titan' ? '80min' : '40min'} warp transit`
    );
  }

  // Rule 3: topping count
  if (order.toppings.length > MAX_TOPPINGS) {
    errors.push(
      `Too many toppings: ${order.toppings.length} (max ${MAX_TOPPINGS}). ` +
      `Each topping adds mass; gate fuel calculations reject orders over ${MAX_TOPPINGS}.`
    );
  }

  // Duplicate topping warning (not an error, but worth flagging)
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const t of order.toppings) {
    if (seen.has(t)) dupes.push(t);
    seen.add(t);
  }
  if (dupes.length > 0) {
    // Not invalid, just... are you sure you want double pepperoni through a warp gate?
    // We let it through but the customer is paying double fuel cost.
  }

  return { valid: errors.length === 0, errors };
}
