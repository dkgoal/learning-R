// §9 "No magic numbers": sanity bounds, epsilons, and normalization guards
// live here, never inline. DI-03 publish-gate bounds also read from this file.

/** Numeric sanity bounds used by the publish gate (DI-03) and validators. */
export const SANITY_BOUNDS: Record<string, { min: number; max: number }> = {
  horsepower_hp: { min: 100, max: 1000 },
  zero_to_sixty_s: { min: 1.5, max: 12 },
  base_msrp: { min: 20_000, max: 400_000 },
  epa_range_mi: { min: 0, max: 600 },
  curb_weight_lb: { min: 2500, max: 7500 },
  seating_capacity: { min: 2, max: 8 },
};

/**
 * Per-attribute epsilon for the comparison "differences only" toggle (FR-305)
 * and best-in-row tie detection (FR-303). Values closer than epsilon are equal.
 */
export const COMPARE_EPSILON: Record<string, number> = {
  base_msrp: 100,
  destination_charge: 25,
  horsepower_hp: 1,
  torque_lbft: 1,
  zero_to_sixty_s: 0.05,
  top_speed_mph: 1,
  epa_combined_mpg: 0.5,
  mpge_combined: 0.5,
  epa_range_mi: 1,
  cargo_behind_2nd_row_cuft: 0.1,
  max_cargo_cuft: 0.1,
  curb_weight_lb: 5,
};

export const DEFAULT_EPSILON = 0.0001;

export function epsilonFor(key: string): number {
  return COMPARE_EPSILON[key] ?? DEFAULT_EPSILON;
}
