import { epsilonFor } from "./config/bounds";
import {
  attributesInCategory,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
} from "./attribute-registry";
import type { AttributeCategory, Vehicle } from "./types";
import { numericValue } from "./units";

// ComparisonEngine (FR-300). Pure and deterministic — same inputs always
// produce the same grid, so it renders identically on server and client (AR-02).

export interface CompareCell {
  vehicleId: number;
  raw: number | undefined; // numeric basis for winner marking, if comparable
  present: boolean;
  isBest: boolean; // FR-303
  deltaAbs?: number; // FR-304 vs baseline
  deltaPct?: number;
}

export interface CompareRow {
  key: string;
  label: string;
  unit: string | null;
  comparable: boolean; // FR-307: non-comparable rows get no winner marking
  cells: CompareCell[];
  allEqual: boolean; // FR-305 differences-only basis
}

export interface CompareGroup {
  category: AttributeCategory;
  label: string;
  rows: CompareRow[];
}

export interface CompareOptions {
  differencesOnly?: boolean; // FR-305
  baselineVehicleId?: number; // FR-304
}

/** FR-303: best value per row given higher_is_better; ties highlighted equally. */
function markBest(
  values: (number | undefined)[],
  higherIsBetter: boolean | null,
  epsilon: number,
): boolean[] {
  const present = values.filter((v): v is number => typeof v === "number");
  if (higherIsBetter === null || present.length === 0) {
    return values.map(() => false);
  }
  const target = higherIsBetter ? Math.max(...present) : Math.min(...present);
  return values.map((v) =>
    typeof v === "number" ? Math.abs(v - target) <= epsilon : false,
  );
}

function allValuesEqual(values: (number | undefined)[], epsilon: number): boolean {
  const present = values.filter((v): v is number => typeof v === "number");
  // Rows where some vehicles have data and some don't are "different".
  if (present.length !== values.length) return present.length <= 1 ? true : false;
  if (present.length <= 1) return true;
  const first = present[0]!;
  return present.every((v) => Math.abs(v - first) <= epsilon);
}

/**
 * FR-302/303/304/305/307: build the row-per-attribute grid grouped by the 15
 * categories. BEV-vs-ICE inapplicable rows render as absent cells (FR-310) —
 * we never coerce equivalence.
 */
export function buildComparison(
  vehicles: Vehicle[],
  options: CompareOptions = {},
): CompareGroup[] {
  const groups: CompareGroup[] = [];

  for (const category of CATEGORY_ORDER) {
    const rows: CompareRow[] = [];

    for (const def of attributesInCategory(category)) {
      if (!def.public) continue; // AR-03 safety net

      const raws = vehicles.map((v) => numericValue(v.attributes[def.key]));
      const anyPresent = vehicles.some(
        (v) => v.attributes[def.key] !== undefined,
      );
      if (!anyPresent) continue;

      const epsilon = epsilonFor(def.key);
      const comparable = def.comparable && def.higherIsBetter !== null;
      const best = comparable
        ? markBest(raws, def.higherIsBetter, epsilon)
        : vehicles.map(() => false);

      const baseline =
        options.baselineVehicleId !== undefined
          ? numericValue(
              vehicles.find((v) => v.id === options.baselineVehicleId)
                ?.attributes[def.key],
            )
          : undefined;

      const cells: CompareCell[] = vehicles.map((v, i) => {
        const raw = raws[i];
        const cell: CompareCell = {
          vehicleId: v.id,
          raw,
          present: v.attributes[def.key] !== undefined,
          isBest: best[i] ?? false,
        };
        if (
          typeof raw === "number" &&
          typeof baseline === "number" &&
          def.dataType !== "boolean"
        ) {
          cell.deltaAbs = raw - baseline;
          cell.deltaPct = baseline !== 0 ? ((raw - baseline) / baseline) * 100 : 0;
        }
        return cell;
      });

      const allEqual = allValuesEqual(raws, epsilon);
      if (options.differencesOnly && allEqual) continue;

      rows.push({
        key: def.key,
        label: def.label,
        unit: def.unit,
        comparable,
        cells,
        allEqual,
      });
    }

    if (rows.length > 0) {
      groups.push({ category, label: CATEGORY_LABELS[category], rows });
    }
  }

  return groups;
}

// ---- FR-308: spec radar across 6 normalized axes (relative to the set) ----

export type RadarAxis =
  | "performance"
  | "efficiency"
  | "safety"
  | "tech"
  | "utility"
  | "value";

const RADAR_KEYS: Record<RadarAxis, { key: string; higherIsBetter: boolean }[]> =
  {
    performance: [{ key: "horsepower_hp", higherIsBetter: true }],
    efficiency: [{ key: "efficiency_index", higherIsBetter: true }],
    safety: [{ key: "nhtsa_overall_stars", higherIsBetter: true }],
    tech: [{ key: "center_display_in", higherIsBetter: true }],
    utility: [{ key: "max_cargo_cuft", higherIsBetter: true }],
    value: [{ key: "base_msrp", higherIsBetter: false }],
  };

export interface RadarResult {
  vehicleId: number;
  axes: Record<RadarAxis, number>; // 0..1, relative to compared set
}

/** Efficiency proxy usable across ICE/BEV: combined MPG, or MPGe for BEV. */
function efficiencyProxy(v: Vehicle): number | undefined {
  return (
    numericValue(v.attributes["epa_combined_mpg"]) ??
    numericValue(v.attributes["mpge_combined"])
  );
}

function minMax(
  values: (number | undefined)[],
  higherIsBetter: boolean,
): (number | undefined)[] {
  const present = values.filter((v): v is number => typeof v === "number");
  if (present.length === 0) return values.map(() => undefined);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min;
  return values.map((v) => {
    if (typeof v !== "number") return undefined;
    if (span === 0) return 1; // all equal -> full marks, explicitly relative
    const n = (v - min) / span;
    return higherIsBetter ? n : 1 - n;
  });
}

/**
 * FR-308: min-max normalized WITHIN the compared set. Explicitly relative — the
 * UI must label it as such, not as an absolute score.
 */
export function buildRadar(vehicles: Vehicle[]): RadarResult[] {
  const results: RadarResult[] = vehicles.map((v) => ({
    vehicleId: v.id,
    axes: {
      performance: 0,
      efficiency: 0,
      safety: 0,
      tech: 0,
      utility: 0,
      value: 0,
    },
  }));

  (Object.keys(RADAR_KEYS) as RadarAxis[]).forEach((axis) => {
    const raws = vehicles.map((v) => {
      if (axis === "efficiency") return efficiencyProxy(v);
      const spec = RADAR_KEYS[axis][0]!;
      return numericValue(v.attributes[spec.key]);
    });
    const higherIsBetter =
      axis === "efficiency" ? true : RADAR_KEYS[axis][0]!.higherIsBetter;
    const normalized = minMax(raws, higherIsBetter);
    normalized.forEach((n, i) => {
      results[i]!.axes[axis] = n ?? 0;
    });
  });

  return results;
}

// ---- FR-301: canonical comparison slug (SEO-01) ----

/** Build the per-vehicle slug token, e.g. "bmw-x5-xdrive40i-2026". */
export function vehicleSlugToken(v: Vehicle): string {
  return `bmw-${v.familySlug}-${v.slug}-${v.modelYear}`;
}

/**
 * SEO-01: canonical, alphabetically-ordered compare slug so that a-vs-b and
 * b-vs-a resolve to one URL. The route layer 301s any non-canonical order.
 */
export function canonicalCompareSlug(vehicles: Vehicle[]): string {
  return vehicles
    .map(vehicleSlugToken)
    .sort((a, b) => a.localeCompare(b))
    .join("-vs-");
}
