import { describe, expect, it } from "vitest";
import {
  buildComparison,
  buildRadar,
  canonicalCompareSlug,
  vehicleSlugToken,
} from "@/domain/comparison";
import type { AttributeValue, Vehicle } from "@/domain/types";

function av(key: string, v: Partial<AttributeValue>): AttributeValue {
  return { key, sourceId: "s_bmw_press", confidence: "high", lastVerifiedAt: "2026-07-01", ...v };
}

function mk(id: number, over: Partial<Vehicle>): Vehicle {
  return {
    id,
    familySlug: "x5",
    modelYear: 2026,
    trimName: `T${id}`,
    slug: `t${id}`,
    powertrainType: "ICE",
    drivetrain: "xDrive",
    baseMsrpUsd: 60000,
    destinationUsd: 1175,
    availabilityStatus: "on_sale",
    imageAlt: "x",
    features: [],
    attributes: {},
    ...over,
  };
}

describe("buildComparison (FR-303 best-in-row)", () => {
  const a = mk(1, {
    attributes: {
      horsepower_hp: av("horsepower_hp", { num: 300 }),
      zero_to_sixty_s: av("zero_to_sixty_s", { num: 5.0 }),
    },
  });
  const b = mk(2, {
    attributes: {
      horsepower_hp: av("horsepower_hp", { num: 400 }),
      zero_to_sixty_s: av("zero_to_sixty_s", { num: 4.0 }),
    },
  });

  it("marks higher hp as best (higher_is_better)", () => {
    const groups = buildComparison([a, b]);
    const hpRow = groups.flatMap((g) => g.rows).find((r) => r.key === "horsepower_hp")!;
    expect(hpRow.cells.find((c) => c.vehicleId === 2)!.isBest).toBe(true);
    expect(hpRow.cells.find((c) => c.vehicleId === 1)!.isBest).toBe(false);
  });

  it("marks lower 0-60 as best (lower_is_better)", () => {
    const groups = buildComparison([a, b]);
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "zero_to_sixty_s")!;
    expect(row.cells.find((c) => c.vehicleId === 2)!.isBest).toBe(true);
  });

  it("highlights ties equally", () => {
    const c1 = mk(1, { attributes: { horsepower_hp: av("horsepower_hp", { num: 300 }) } });
    const c2 = mk(2, { attributes: { horsepower_hp: av("horsepower_hp", { num: 300 }) } });
    const groups = buildComparison([c1, c2]);
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "horsepower_hp")!;
    expect(row.cells.every((c) => c.isBest)).toBe(true);
  });

  it("never marks a missing cell as best (FR-310)", () => {
    const c1 = mk(1, { attributes: { epa_range_mi: av("epa_range_mi", { num: 300 }) } });
    const c2 = mk(2, { attributes: {} });
    const groups = buildComparison([c1, c2]);
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "epa_range_mi")!;
    expect(row.cells.find((c) => c.vehicleId === 2)!.present).toBe(false);
    expect(row.cells.find((c) => c.vehicleId === 2)!.isBest).toBe(false);
  });
});

describe("differencesOnly (FR-305) & deltas (FR-304)", () => {
  it("hides rows where all values are equal", () => {
    const a = mk(1, { attributes: { horsepower_hp: av("horsepower_hp", { num: 300 }) } });
    const b = mk(2, { attributes: { horsepower_hp: av("horsepower_hp", { num: 300 }) } });
    const groups = buildComparison([a, b], { differencesOnly: true });
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "horsepower_hp");
    expect(row).toBeUndefined();
  });

  it("computes absolute and percent delta vs baseline", () => {
    const a = mk(1, { attributes: { horsepower_hp: av("horsepower_hp", { num: 300 }) } });
    const b = mk(2, { attributes: { horsepower_hp: av("horsepower_hp", { num: 450 }) } });
    const groups = buildComparison([a, b], { baselineVehicleId: 1 });
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "horsepower_hp")!;
    const cell = row.cells.find((c) => c.vehicleId === 2)!;
    expect(cell.deltaAbs).toBe(150);
    expect(cell.deltaPct).toBeCloseTo(50, 5);
  });
});

describe("buildRadar (FR-308 relative normalization)", () => {
  it("produces axes in [0,1]", () => {
    const a = mk(1, { attributes: { horsepower_hp: av("horsepower_hp", { num: 300 }), base_msrp: av("base_msrp", { num: 60000 }) } });
    const b = mk(2, { attributes: { horsepower_hp: av("horsepower_hp", { num: 600 }), base_msrp: av("base_msrp", { num: 90000 }) } });
    const radar = buildRadar([a, b]);
    for (const r of radar) {
      for (const val of Object.values(r.axes)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
    // Cheaper car wins the value axis.
    const va = radar.find((r) => r.vehicleId === 1)!.axes.value;
    const vb = radar.find((r) => r.vehicleId === 2)!.axes.value;
    expect(va).toBeGreaterThan(vb);
  });
});

describe("canonical compare slug (SEO-01)", () => {
  it("is order-independent (alphabetical)", () => {
    const a = mk(1, { familySlug: "x5", slug: "xdrive40i" });
    const b = mk(2, { familySlug: "x3", slug: "xdrive30" });
    expect(canonicalCompareSlug([a, b])).toBe(canonicalCompareSlug([b, a]));
  });

  it("builds the expected token", () => {
    const a = mk(1, { familySlug: "x5", slug: "xdrive40i", modelYear: 2026 });
    expect(vehicleSlugToken(a)).toBe("bmw-x5-xdrive40i-2026");
  });
});
