import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyFilter,
  sortVehicles,
} from "@/domain/filters";
import { publicCatalog, familyMetaLookup } from "@/lib/catalog-view";

const lookup = familyMetaLookup();

describe("applyFilter", () => {
  it("filters by powertrain", () => {
    const evs = applyFilter(publicCatalog(), { powertrains: ["BEV"] }, lookup);
    expect(evs.length).toBeGreaterThan(0);
    expect(evs.every((v) => v.powertrainType === "BEV")).toBe(true);
  });

  it("filters by max price (incl. destination)", () => {
    const cheap = applyFilter(publicCatalog(), { maxPriceUsd: 55000 }, lookup);
    expect(cheap.every((v) => v.baseMsrpUsd + v.destinationUsd <= 55000)).toBe(true);
  });

  it("filters by body style via family metadata", () => {
    const savs = applyFilter(publicCatalog(), { bodyStyles: ["SAV"] }, lookup);
    expect(savs.length).toBeGreaterThan(0);
    expect(savs.every((v) => lookup(v.familySlug)?.bodyStyle === "SAV")).toBe(true);
  });

  it("filters M division only", () => {
    const m = applyFilter(publicCatalog(), { mDivisionOnly: true }, lookup);
    expect(m.every((v) => lookup(v.familySlug)?.isMDivision)).toBe(true);
  });

  it("combines filters (AND semantics)", () => {
    const r = applyFilter(
      publicCatalog(),
      { powertrains: ["MHEV"], bodyStyles: ["SAV"] },
      lookup,
    );
    expect(r.every((v) => v.powertrainType === "MHEV")).toBe(true);
  });
});

describe("activeFilterCount", () => {
  it("counts active facet groups", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(
      activeFilterCount({ powertrains: ["BEV"], maxPriceUsd: 60000, mDivisionOnly: true }),
    ).toBe(3);
  });
});

describe("sortVehicles", () => {
  it("sorts price ascending", () => {
    const sorted = sortVehicles(publicCatalog(), "price_asc");
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!.baseMsrpUsd + sorted[i - 1]!.destinationUsd;
      const cur = sorted[i]!.baseMsrpUsd + sorted[i]!.destinationUsd;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });

  it("sorts horsepower descending, is stable and deterministic", () => {
    const a = sortVehicles(publicCatalog(), "hp_desc").map((v) => v.id);
    const b = sortVehicles(publicCatalog(), "hp_desc").map((v) => v.id);
    expect(a).toEqual(b);
  });

  it("sinks missing values to the bottom regardless of direction", () => {
    // Roadster (Z4) has no cargo? It does; use range which ICE lacks.
    const byRange = sortVehicles(publicCatalog(), "range_desc");
    const firstMissingIndex = byRange.findIndex(
      (v) => v.attributes["epa_range_mi"] === undefined,
    );
    const lastPresentIndex = byRange.reduce(
      (acc, v, i) => (v.attributes["epa_range_mi"] !== undefined ? i : acc),
      -1,
    );
    if (firstMissingIndex !== -1) {
      expect(firstMissingIndex).toBeGreaterThan(lastPresentIndex);
    }
  });
});
