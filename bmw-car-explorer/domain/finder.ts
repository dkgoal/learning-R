import {
  BUDGET_STRETCH_FRACTION,
  BUDGET_STRETCH_PENALTY,
  FINDER_RESULT_COUNT,
  PARTIAL_DATA_FLAG_THRESHOLD,
  PRIORITY_DIMENSIONS,
  RANK_WEIGHTS,
  SCORER_VERSION,
  SUBSCORES,
  type PriorityDimension,
  type SubScoreTerm,
} from "./config/weights";
import type { PowertrainType, Vehicle } from "./types";
import { numericValue } from "./units";

export { SCORER_VERSION };

// FinderScorer (FR-400). Two-stage, deterministic, explainable, side-effect
// free — runs identically on the server (SEO results) and in the browser
// (instant re-rank, FR-408).

export interface FinderAnswers {
  maxOutTheDoorUsd?: number; // Q1
  bodyStyles?: string[]; // Q2 (empty/undefined = no preference)
  powertrains?: PowertrainType[]; // Q3
  seatsNeeded?: number; // Q4 minimum seats
  priorities?: PriorityDimension[]; // Q6 ranked, best first
  requireAwd?: boolean; // Q7
  requireTspPlus?: boolean; // Q7
  requireThirdRow?: boolean; // Q7
  minRangeMi?: number; // Q7 (e.g. 300)
  requireHandsFree?: boolean; // Q7
  noHomeCharging?: boolean; // Q7 -> excludes BEV
  sportiness?: number; // Q10, 0 (comfort) .. 100 (sport)
  coldClimate?: boolean; // Q9 -> small xDrive weighting
}

export interface DimensionBreakdown {
  dimension: PriorityDimension;
  weight: number; // FR-407
  normalized: number; // 0..1
  contribution: number; // weight * normalized
  partial: boolean; // FR-404 imputed input(s)
}

export interface FinderResult {
  vehicle: Vehicle;
  matchPct: number; // 0..100
  score: number; // 0..1 (post budget penalty)
  breakdown: DimensionBreakdown[]; // FR-407
  whyBullets: string[]; // FR-406
  tradeoffBullets: string[]; // FR-406
  budgetStretch: boolean; // FR-405
  partialFlag: boolean; // FR-404 (>20% imputed)
}

export interface FinderOutput {
  results: FinderResult[];
  eligibleCount: number;
  excludedCount: number;
  scorerVersion: string;
}

// ---- derived metric resolution (composite sub-score inputs) ----

const KEY_ADAS = [
  "forward_collision_warning",
  "aeb",
  "blind_spot_detection",
  "lane_departure_warning",
  "adaptive_cruise_stop_go",
];
const KEY_TECH = [
  "wireless_carplay_feature",
  "head_up_display_feature",
  "wireless_charging",
  "wifi_hotspot",
  "digital_key_plus",
];

function featureStandardFraction(v: Vehicle, keys: string[]): number {
  if (keys.length === 0) return 0;
  const std = keys.filter((k) =>
    v.features.some(
      (f) => f.key === k && (f.availability === "standard" || f.availability === "optional"),
    ),
  ).length;
  return std / keys.length;
}

function iihsTier(v: Vehicle): number | undefined {
  const award = v.attributes["iihs_award"]?.text;
  if (award === undefined) return undefined;
  if (award === "TSP+") return 2;
  if (award === "TSP") return 1;
  return 0;
}

/** Resolve the raw value for a sub-score term, computing derived metrics. */
function termRaw(v: Vehicle, key: string): number | undefined {
  switch (key) {
    case "hp_per_lb": {
      const hp = numericValue(v.attributes["horsepower_hp"]);
      const wt = numericValue(v.attributes["curb_weight_lb"]);
      return hp !== undefined && wt !== undefined && wt > 0 ? hp / wt : undefined;
    }
    case "efficiency_index":
      return (
        numericValue(v.attributes["epa_combined_mpg"]) ??
        numericValue(v.attributes["mpge_combined"])
      );
    case "iihs_award_tier":
      return iihsTier(v);
    case "standard_adas_coverage":
      return featureStandardFraction(v, KEY_ADAS);
    case "tech_feature_coverage": {
      // blend registered tech booleans with feature-list coverage
      const hud = numericValue(v.attributes["head_up_display"]) ?? 0;
      const cp = numericValue(v.attributes["wireless_carplay"]) ?? 0;
      const ota = numericValue(v.attributes["ota_update_capability"]) ?? 0;
      const fromFeatures = featureStandardFraction(v, KEY_TECH);
      return (hud + cp + ota) / 3 * 0.5 + fromFeatures * 0.5;
    }
    case "warranty_maintenance_coverage": {
      const basic = numericValue(v.attributes["basic_warranty_yr"]);
      return basic;
    }
    default:
      return numericValue(v.attributes[key]);
  }
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** Min-max normalize into [0,1], direction applied. All-equal -> 1. */
function minMaxNorm(values: number[], invert: boolean): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return values.map((v) => {
    const n = span === 0 ? 1 : (v - min) / span;
    return invert ? 1 - n : n;
  });
}

// ---- stage (a): hard filters (FR-401) ----

function passesHardFilters(v: Vehicle, a: FinderAnswers, family: { bodyStyle: string } | undefined): boolean {
  // FR-405: beyond the stretch band (10% over) the vehicle is eliminated;
  // within the band it survives and is soft-penalized during scoring.
  if (a.maxOutTheDoorUsd !== undefined) {
    const price = v.baseMsrpUsd + v.destinationUsd;
    if (price > a.maxOutTheDoorUsd * (1 + BUDGET_STRETCH_FRACTION)) return false;
  }
  if (a.bodyStyles && a.bodyStyles.length > 0) {
    if (!family || !a.bodyStyles.includes(family.bodyStyle)) return false;
  }
  if (a.powertrains && a.powertrains.length > 0) {
    if (!a.powertrains.includes(v.powertrainType)) return false;
  }
  if (a.seatsNeeded !== undefined) {
    const seats = numericValue(v.attributes["seating_capacity"]) ?? 0;
    if (seats < a.seatsNeeded) return false;
  }
  if (a.requireAwd && v.drivetrain === "RWD") return false;
  if (a.requireTspPlus && v.attributes["iihs_award"]?.text !== "TSP+") return false;
  if (a.requireThirdRow) {
    const seats = numericValue(v.attributes["seating_capacity"]) ?? 0;
    if (seats < 6) return false;
  }
  if (a.minRangeMi !== undefined) {
    const range = numericValue(v.attributes["epa_range_mi"]) ?? 0;
    if (range < a.minRangeMi) return false;
  }
  if (a.requireHandsFree) {
    const hf = v.attributes["highway_assistant_hands_free"]?.bool;
    if (hf !== true) return false;
  }
  if (a.noHomeCharging && v.powertrainType === "BEV") return false;
  return true;
}

// ---- weights from priority ranking (FR-402) ----

export function weightsFromPriorities(
  priorities: PriorityDimension[] | undefined,
  sportiness?: number,
): Record<PriorityDimension, number> {
  const ranked =
    priorities && priorities.length > 0 ? priorities : PRIORITY_DIMENSIONS;
  const raw: Record<string, number> = {};
  ranked.forEach((dim, i) => {
    raw[dim] = RANK_WEIGHTS[i] ?? RANK_WEIGHTS[RANK_WEIGHTS.length - 1]!;
  });
  // Any dimensions the user didn't rank get the lowest weight tier.
  for (const dim of PRIORITY_DIMENSIONS) {
    if (raw[dim] === undefined) raw[dim] = RANK_WEIGHTS[RANK_WEIGHTS.length - 1]!;
  }

  // FR: Q10 sportiness tilts performance<->comfort (bounded, then renormalized).
  if (typeof sportiness === "number") {
    const tilt = ((sportiness - 50) / 50) * 0.05; // +/- 0.05
    raw["performance"] = Math.max(0, (raw["performance"] ?? 0) + tilt);
    raw["comfort"] = Math.max(0, (raw["comfort"] ?? 0) - tilt);
  }

  const sum = PRIORITY_DIMENSIONS.reduce((s, d) => s + (raw[d] ?? 0), 0);
  const out = {} as Record<PriorityDimension, number>;
  for (const dim of PRIORITY_DIMENSIONS) {
    out[dim] = sum > 0 ? (raw[dim] ?? 0) / sum : 0;
  }
  return out;
}

function normalizeWeights(
  raw: Partial<Record<PriorityDimension, number>>,
): Record<PriorityDimension, number> {
  const sum = PRIORITY_DIMENSIONS.reduce((s, d) => s + Math.max(0, raw[d] ?? 0), 0);
  const out = {} as Record<PriorityDimension, number>;
  for (const dim of PRIORITY_DIMENSIONS) {
    out[dim] = sum > 0 ? Math.max(0, raw[dim] ?? 0) / sum : 1 / PRIORITY_DIMENSIONS.length;
  }
  return out;
}

// ---- main entry ----

export interface FamilyLookup {
  (familySlug: string): { bodyStyle: string } | undefined;
}

export interface RunOptions {
  /**
   * FR-408: the results screen ships direct weight sliders. When provided these
   * bypass the priority-derived weights so the client can re-rank live. Values
   * are renormalized to sum 1.0.
   */
  weightsOverride?: Partial<Record<PriorityDimension, number>>;
}

export function runFinder(
  catalog: Vehicle[],
  answers: FinderAnswers,
  familyLookup: FamilyLookup,
  options: RunOptions = {},
): FinderOutput {
  // Stage (a): eliminate.
  const eligible = catalog.filter((v) =>
    passesHardFilters(v, answers, familyLookup(v.familySlug)),
  );
  const excludedCount = catalog.length - eligible.length;

  if (eligible.length === 0) {
    return { results: [], eligibleCount: 0, excludedCount, scorerVersion: SCORER_VERSION };
  }

  const weights = options.weightsOverride
    ? normalizeWeights(options.weightsOverride)
    : weightsFromPriorities(answers.priorities, answers.sportiness);

  // Precompute, per dimension, each term's normalized value across the eligible
  // set, imputing candidate-set median for missing (FR-404).
  const dimTermNorms: Record<PriorityDimension, number[][]> = {} as Record<
    PriorityDimension,
    number[][]
  >;
  const dimTermImputed: Record<PriorityDimension, boolean[][]> = {} as Record<
    PriorityDimension,
    boolean[][]
  >;

  for (const dim of PRIORITY_DIMENSIONS) {
    const terms = SUBSCORES[dim];
    const perTermNorm: number[][] = [];
    const perTermImputed: boolean[][] = [];
    for (const term of terms) {
      const rawVals = eligible.map((v) => termRaw(v, term.key));
      const present = rawVals.filter((x): x is number => typeof x === "number");
      const med = median(present);
      const imputed = rawVals.map((x) => typeof x !== "number");
      const filled = rawVals.map((x) => (typeof x === "number" ? x : med));
      perTermNorm.push(minMaxNorm(filled, term.invert ?? false));
      perTermImputed.push(imputed);
    }
    dimTermNorms[dim] = perTermNorm;
    dimTermImputed[dim] = perTermImputed;
  }

  // Composite sub-score per dimension per vehicle, then min-max the composite
  // across candidates (FR-403).
  const dimComposite: Record<PriorityDimension, number[]> = {} as Record<
    PriorityDimension,
    number[]
  >;
  const dimPartial: Record<PriorityDimension, boolean[]> = {} as Record<
    PriorityDimension,
    boolean[]
  >;

  for (const dim of PRIORITY_DIMENSIONS) {
    const terms = SUBSCORES[dim];
    const composites = eligible.map((_v, vi) => {
      let acc = 0;
      let wsum = 0;
      terms.forEach((term: SubScoreTerm, ti) => {
        acc += term.weight * (dimTermNorms[dim][ti]![vi] ?? 0);
        wsum += term.weight;
      });
      return wsum > 0 ? acc / wsum : 0;
    });
    dimComposite[dim] = minMaxNorm(composites, false);
    dimPartial[dim] = eligible.map((_v, vi) =>
      terms.some((_t, ti) => dimTermImputed[dim][ti]![vi]),
    );
  }

  // Assemble results.
  const results: FinderResult[] = eligible.map((v, vi) => {
    const breakdown: DimensionBreakdown[] = PRIORITY_DIMENSIONS.map((dim) => {
      const normalized = dimComposite[dim]![vi] ?? 0;
      const weight = weights[dim];
      return {
        dimension: dim,
        weight,
        normalized,
        contribution: weight * normalized,
        partial: dimPartial[dim]![vi] ?? false,
      };
    });

    let score = breakdown.reduce((s, b) => s + b.contribution, 0);

    // FR-405: budget soft penalty.
    let budgetStretch = false;
    if (answers.maxOutTheDoorUsd !== undefined) {
      const price = v.baseMsrpUsd + v.destinationUsd;
      if (price > answers.maxOutTheDoorUsd) {
        budgetStretch = true;
        score *= BUDGET_STRETCH_PENALTY;
      }
    }

    // Q9 cold-climate: modest bonus for AWD/xDrive traction.
    if (answers.coldClimate && v.drivetrain !== "RWD") {
      score = Math.min(1, score * 1.02);
    }

    // FR-404: fraction of imputed inputs across weighted dimensions.
    const partialCount = breakdown.filter((b) => b.partial && b.weight > 0).length;
    const partialFrac =
      breakdown.filter((b) => b.weight > 0).length > 0
        ? partialCount / breakdown.filter((b) => b.weight > 0).length
        : 0;
    const partialFlag = partialFrac > PARTIAL_DATA_FLAG_THRESHOLD;

    const { whyBullets, tradeoffBullets } = explain(v, breakdown, budgetStretch);

    return {
      vehicle: v,
      matchPct: Math.round(score * 100),
      score,
      breakdown,
      whyBullets,
      tradeoffBullets,
      budgetStretch,
      partialFlag,
    };
  });

  // FR-410: deterministic ordering with explicit tie-breaks.
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pa = a.vehicle.baseMsrpUsd + a.vehicle.destinationUsd;
    const pb = b.vehicle.baseMsrpUsd + b.vehicle.destinationUsd;
    if (pa !== pb) return pa - pb;
    return a.vehicle.id - b.vehicle.id;
  });

  return {
    results: results.slice(0, FINDER_RESULT_COUNT),
    eligibleCount: eligible.length,
    excludedCount,
    scorerVersion: SCORER_VERSION,
  };
}

const DIM_LABELS: Record<PriorityDimension, string> = {
  performance: "performance",
  comfort: "comfort",
  efficiency: "efficiency",
  safety: "safety",
  technology: "technology",
  cargo: "cargo & utility",
  cost_of_ownership: "cost of ownership",
};

// FR-406: "why this fits" cites the user's stated priorities and spec values.
function explain(
  v: Vehicle,
  breakdown: DimensionBreakdown[],
  budgetStretch: boolean,
): { whyBullets: string[]; tradeoffBullets: string[] } {
  const ranked = [...breakdown].sort((a, b) => b.contribution - a.contribution);
  const whyBullets: string[] = [];

  for (const b of ranked.slice(0, 3)) {
    if (b.contribution <= 0) continue;
    whyBullets.push(
      `Strong on your ${DIM_LABELS[b.dimension]} priority (${Math.round(
        b.normalized * 100,
      )}% within this shortlist)${specCitation(v, b.dimension)}.`,
    );
  }
  if (whyBullets.length === 0) {
    whyBullets.push("A balanced match against your stated priorities.");
  }

  const tradeoffBullets: string[] = [];
  const weak = [...breakdown]
    .filter((b) => b.weight > 0)
    .sort((a, b) => a.normalized - b.normalized)[0];
  if (weak && weak.normalized < 0.4) {
    tradeoffBullets.push(
      `Weaker on ${DIM_LABELS[weak.dimension]} relative to the alternatives.`,
    );
  }
  if (budgetStretch) {
    tradeoffBullets.push("Above your budget — shown as a stretch pick.");
  }
  if (tradeoffBullets.length === 0) {
    tradeoffBullets.push("No major tradeoffs versus the alternatives shown.");
  }
  return { whyBullets, tradeoffBullets };
}

function specCitation(v: Vehicle, dim: PriorityDimension): string {
  switch (dim) {
    case "performance": {
      const z = numericValue(v.attributes["zero_to_sixty_s"]);
      return z !== undefined ? ` — ${z}s 0–60` : "";
    }
    case "efficiency": {
      const mpg = numericValue(v.attributes["epa_combined_mpg"]);
      const mpge = numericValue(v.attributes["mpge_combined"]);
      if (mpg !== undefined) return ` — ${mpg} mpg combined`;
      if (mpge !== undefined) return ` — ${mpge} MPGe`;
      return "";
    }
    case "cargo": {
      const c = numericValue(v.attributes["max_cargo_cuft"]);
      return c !== undefined ? ` — ${c} cu ft max cargo` : "";
    }
    case "safety": {
      const award = v.attributes["iihs_award"]?.text;
      return award ? ` — IIHS ${award}` : "";
    }
    case "cost_of_ownership": {
      const r = numericValue(v.attributes["reliability_index"]);
      return r !== undefined ? ` — reliability index ${r}/100` : "";
    }
    default:
      return "";
  }
}
