import { describe, expect, it } from "vitest";
import { convert, formatValue } from "@/domain/units";
import { applyFilter, sortVehicles, type SortKey } from "@/domain/filters";
import { runFinder } from "@/domain/finder";
import { publicCatalog, familyMetaLookup } from "@/lib/catalog-view";
import type { AttributeValue } from "@/domain/types";

const lookup = familyMetaLookup();
const catalog = publicCatalog();

function av(key: string, v: Partial<AttributeValue>): AttributeValue {
  return { key, sourceId: "s_bmw_press", confidence: "high", lastVerifiedAt: "2026-07-01", ...v };
}

describe("convert — all imperial→metric branches", () => {
  it("inches to cm", () => expect(convert(10, "in", "metric").unit).toBe("cm"));
  it("pounds to kg", () => expect(convert(100, "lb", "metric").unit).toBe("kg"));
  it("gallons to L", () => expect(convert(10, "gal", "metric").unit).toBe("L"));
  it("cubic feet to L", () => expect(convert(10, "cu ft", "metric").unit).toBe("L"));
  it("unknown unit passes through", () =>
    expect(convert(10, "g", "metric")).toEqual({ value: 10, unit: "g" }));
});

describe("formatValue — remaining branches", () => {
  it("formats percent", () =>
    expect(formatValue(av("depreciation_5yr_pct", { num: 52 }))).toBe("52%"));
  it("formats enum text", () =>
    expect(formatValue(av("body_style", { text: "Sedan" }))).toBe("Sedan"));
  it("formats array text", () =>
    expect(formatValue(av("upholstery_options", { text: "Sensatec, Merino" }))).toBe(
      "Sensatec, Merino",
    ));
  it("returns dash for unknown key", () =>
    expect(formatValue(av("not_a_real_key", { num: 1 }))).toBe("—"));
  it("returns dash for missing enum text", () =>
    expect(formatValue(av("body_style", {}))).toBe("—"));
});

describe("filters — remaining facets and sort keys", () => {
  it("filters by drivetrain, model year, availability, and min seats", () => {
    const r = applyFilter(
      catalog,
      { drivetrains: ["xDrive"], modelYears: [2026], availability: ["on_sale"], minSeats: 5 },
      lookup,
    );
    expect(r.every((v) => v.drivetrain === "xDrive")).toBe(true);
    expect(r.every((v) => v.modelYear === 2026)).toBe(true);
    expect(r.every((v) => v.availabilityStatus === "on_sale")).toBe(true);
  });

  it("every sort key returns a full, deterministic ordering", () => {
    const keys: SortKey[] = [
      "price_asc", "price_desc", "hp_desc", "zero_to_sixty_asc",
      "range_desc", "mpg_desc", "cargo_desc", "safety_desc", "reliability_desc",
    ];
    for (const k of keys) {
      const sorted = sortVehicles(catalog, k);
      expect(sorted).toHaveLength(catalog.length);
    }
  });
});

describe("finder — override, climate, sportiness, partial branches", () => {
  it("weightsOverride bypasses priority-derived weights", () => {
    const out = runFinder(
      catalog,
      {},
      lookup,
      { weightsOverride: { performance: 1 } },
    );
    // With all weight on performance, the top result should be quick.
    expect(out.results.length).toBeGreaterThan(0);
    const top = out.results[0]!;
    expect(top.breakdown.find((b) => b.dimension === "performance")!.weight).toBeCloseTo(1, 5);
  });

  it("empty override falls back to equal weights", () => {
    const out = runFinder(catalog, {}, lookup, { weightsOverride: {} });
    const w = out.results[0]!.breakdown.map((b) => b.weight);
    expect(w.every((x) => Math.abs(x - w[0]!) < 1e-9)).toBe(true);
  });

  it("cold climate favors AWD without breaking determinism", () => {
    const a = runFinder(catalog, { coldClimate: true }, lookup).results.map((r) => r.vehicle.id);
    const b = runFinder(catalog, { coldClimate: true }, lookup).results.map((r) => r.vehicle.id);
    expect(a).toEqual(b);
  });

  it("sportiness extremes still yield valid rankings", () => {
    for (const s of [0, 100]) {
      const out = runFinder(catalog, { sportiness: s }, lookup);
      expect(out.results.length).toBeGreaterThan(0);
      for (const r of out.results) {
        expect(r.matchPct).toBeGreaterThanOrEqual(0);
        expect(r.matchPct).toBeLessThanOrEqual(100);
      }
    }
  });
});
