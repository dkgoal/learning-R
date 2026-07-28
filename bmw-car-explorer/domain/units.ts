import { getAttribute } from "./attribute-registry";
import type { AttributeValue, Vehicle } from "./types";

// DI-05: normalization happens at ingest; conversion happens at display.
// v1 is US English + Imperial (NFR-17) but the conversion layer is present so
// a future metric locale is a display-time switch, not a data migration.

export type UnitSystem = "imperial" | "metric";

const MI_TO_KM = 1.609344;
const IN_TO_CM = 2.54;
const LB_TO_KG = 0.45359237;
const GAL_TO_L = 3.785411784;
const CUFT_TO_L = 28.316846592;

interface Converted {
  value: number;
  unit: string;
}

/** Convert a stored (imperial/US) numeric value into the target system. */
export function convert(
  value: number,
  unit: string | null,
  system: UnitSystem,
): Converted {
  if (unit === null || system === "imperial") {
    return { value, unit: unit ?? "" };
  }
  switch (unit) {
    case "mi":
      return { value: value * MI_TO_KM, unit: "km" };
    case "in":
      return { value: value * IN_TO_CM, unit: "cm" };
    case "lb":
      return { value: value * LB_TO_KG, unit: "kg" };
    case "gal":
      return { value: value * GAL_TO_L, unit: "L" };
    case "cu ft":
      return { value: value * CUFT_TO_L, unit: "L" };
    case "mpg": {
      // mpg (US) -> L/100km
      return { value: 235.214583 / value, unit: "L/100km" };
    }
    default:
      return { value, unit };
  }
}

/** The raw comparable/scorable number for an attribute value, if any. */
export function numericValue(v: AttributeValue | undefined): number | undefined {
  if (!v) return undefined;
  if (typeof v.num === "number") return v.num;
  if (typeof v.bool === "boolean") return v.bool ? 1 : 0;
  return undefined;
}

function formatNumber(n: number, precision: number): string {
  const rounded = Number(n.toFixed(precision));
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

/**
 * Human-readable display for a value, unit-aware and precision-aware, reading
 * metadata from the registry (AC-01). Returns "—" for missing values.
 */
export function formatValue(
  value: AttributeValue | undefined,
  system: UnitSystem = "imperial",
): string {
  if (!value) return "—";
  const def = getAttribute(value.key);
  if (!def) return "—";

  if (def.dataType === "boolean" && typeof value.bool === "boolean") {
    return value.bool ? "Yes" : "No";
  }
  if (def.dataType === "text" || def.dataType === "enum") {
    return value.text ?? "—";
  }
  if (def.dataType === "array") {
    return value.text ?? "—";
  }
  if (typeof value.num === "number") {
    const { value: converted, unit } = convert(value.num, def.unit, system);
    const num = formatNumber(converted, def.displayPrecision);
    if (!unit) return num;
    if (unit === "USD") return `$${formatNumber(converted, 0)}`;
    if (unit === "%") return `${num}%`;
    return `${num} ${unit}`;
  }
  return "—";
}

/**
 * AR-03 / AC-02: strip non-public (licensing-restricted) attributes before a
 * vehicle crosses the serialization boundary to the client. This is the single
 * enforcement point — the UI never has to know about licensing.
 */
export function serializePublic(vehicle: Vehicle): Vehicle {
  const attributes: Record<string, AttributeValue> = {};
  for (const [key, val] of Object.entries(vehicle.attributes)) {
    const def = getAttribute(key);
    if (def && def.public) {
      attributes[key] = val;
    }
  }
  return { ...vehicle, attributes };
}
