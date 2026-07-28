// Finder scoring configuration (FR-402/403). All weights and sub-score
// compositions live here — never inline in the scorer (§9).

export type PriorityDimension =
  | "performance"
  | "comfort"
  | "efficiency"
  | "safety"
  | "technology"
  | "cargo"
  | "cost_of_ownership";

export const PRIORITY_DIMENSIONS: PriorityDimension[] = [
  "performance",
  "comfort",
  "efficiency",
  "safety",
  "technology",
  "cargo",
  "cost_of_ownership",
];

/**
 * FR-402: rank position (1-based) -> weight, before renormalization.
 * Renormalized to sum 1.0 over however many dimensions the user ranks.
 */
export const RANK_WEIGHTS: readonly number[] = [
  0.28, 0.22, 0.17, 0.13, 0.1, 0.06, 0.04,
];

/**
 * FR-403: composition of each dimension's raw sub-score from attribute keys.
 * `invert: true` means smaller-is-better (e.g. 0-60 time, TCO) — the value is
 * inverted before min-max normalization so higher composite = better.
 */
export interface SubScoreTerm {
  key: string;
  weight: number;
  invert?: boolean;
}

export const SUBSCORES: Record<PriorityDimension, SubScoreTerm[]> = {
  // performance = 0.4·(1/0-60) + 0.3·hp/weight + 0.2·lateral_g + 0.1·braking
  performance: [
    { key: "zero_to_sixty_s", weight: 0.4, invert: true },
    { key: "hp_per_lb", weight: 0.3 }, // derived at scoring time
    { key: "lateral_g", weight: 0.2 },
    { key: "braking_60_0_ft", weight: 0.1, invert: true },
  ],
  comfort: [
    { key: "interior_noise_db_at_70mph", weight: 0.4, invert: true },
    { key: "wheelbase_in", weight: 0.3 },
    { key: "front_legroom_in", weight: 0.3 },
  ],
  efficiency: [
    { key: "efficiency_index", weight: 1.0 }, // MPG or MPGe normalized upstream
  ],
  // safety = 0.5·IIHS award tier + 0.3·NHTSA overall + 0.2·standard-ADAS coverage
  safety: [
    { key: "iihs_award_tier", weight: 0.5 },
    { key: "nhtsa_overall_stars", weight: 0.3 },
    { key: "standard_adas_coverage", weight: 0.2 },
  ],
  technology: [
    { key: "center_display_in", weight: 0.35 },
    { key: "tech_feature_coverage", weight: 0.65 },
  ],
  cargo: [
    { key: "max_cargo_cuft", weight: 0.6 },
    { key: "max_towing_lb", weight: 0.4 },
  ],
  // cost_of_ownership = 0.4·5yr TCO + 0.3·reliability + 0.3·warranty/maintenance
  cost_of_ownership: [
    { key: "total_cost_of_ownership_5yr", weight: 0.4, invert: true },
    { key: "reliability_index", weight: 0.3 },
    { key: "warranty_maintenance_coverage", weight: 0.3 },
  ],
};

// FR-405: budget soft-penalty band.
export const BUDGET_STRETCH_FRACTION = 0.1; // within 10% over = "stretch"
export const BUDGET_STRETCH_PENALTY = 0.85; // multiply final score by this

// FR-404: results with more than this fraction of imputed inputs are flagged.
export const PARTIAL_DATA_FLAG_THRESHOLD = 0.2;

// FR-406: number of ranked results returned.
export const FINDER_RESULT_COUNT = 5;

/** Bump when the scoring model changes (FR-410, golden-file gate §10). */
export const SCORER_VERSION = "1.0.0";
