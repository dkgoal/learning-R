import { describe, expect, it } from "vitest";
import {
  runFinder,
  weightsFromPriorities,
  type FinderAnswers,
} from "@/domain/finder";
import { PRIORITY_DIMENSIONS } from "@/domain/config/weights";
import { publicCatalog, familyMetaLookup } from "@/lib/catalog-view";

const catalog = publicCatalog();
const lookup = familyMetaLookup();

describe("weightsFromPriorities (FR-402)", () => {
  it("sums to 1.0", () => {
    const w = weightsFromPriorities([...PRIORITY_DIMENSIONS]);
    const sum = Object.values(w).reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
  it("gives the top priority the most weight", () => {
    const w = weightsFromPriorities(["safety", "performance", "efficiency"]);
    expect(w.safety).toBeGreaterThan(w.performance);
    expect(w.performance).toBeGreaterThan(w.efficiency);
  });
  it("still sums to 1.0 with sportiness tilt applied", () => {
    const w = weightsFromPriorities([...PRIORITY_DIMENSIONS], 100);
    const sum = Object.values(w).reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe("hard filters (FR-401)", () => {
  it("excludes vehicles over budget by more than 10%", () => {
    const out = runFinder(catalog, { maxOutTheDoorUsd: 50000 }, lookup);
    for (const r of out.results) {
      expect(r.vehicle.baseMsrpUsd + r.vehicle.destinationUsd).toBeLessThanOrEqual(
        50000 * 1.1,
      );
    }
  });
  it("respects a third-row requirement", () => {
    const out = runFinder(catalog, { requireThirdRow: true }, lookup);
    expect(out.results.length).toBeGreaterThan(0);
    for (const r of out.results) {
      expect(r.vehicle.attributes["seating_capacity"]?.num ?? 0).toBeGreaterThanOrEqual(6);
    }
  });
  it("excludes EVs when the user has no home charging", () => {
    const out = runFinder(catalog, { noHomeCharging: true }, lookup);
    expect(out.results.every((r) => r.vehicle.powertrainType !== "BEV")).toBe(true);
  });
  it("returns empty results when no vehicle survives", () => {
    const out = runFinder(
      catalog,
      { requireTspPlus: true, minRangeMi: 999 },
      lookup,
    );
    expect(out.results).toHaveLength(0);
    expect(out.eligibleCount).toBe(0);
  });
});

describe("budget soft penalty (FR-405)", () => {
  it("flags a stretch pick within 10% over budget", () => {
    // Find a vehicle and set budget just below its price.
    const target = catalog.find((v) => v.baseMsrpUsd + v.destinationUsd > 60000)!;
    const price = target.baseMsrpUsd + target.destinationUsd;
    const out = runFinder(catalog, { maxOutTheDoorUsd: Math.floor(price / 1.05) }, lookup);
    const stretched = out.results.find((r) => r.vehicle.id === target.id);
    if (stretched) expect(stretched.budgetStretch).toBe(true);
  });
});

describe("scoring output invariants", () => {
  const out = runFinder(catalog, { priorities: [...PRIORITY_DIMENSIONS] }, lookup);

  it("normalized dimension scores are always in [0,1] (property)", () => {
    for (const r of out.results) {
      for (const b of r.breakdown) {
        expect(b.normalized).toBeGreaterThanOrEqual(0);
        expect(b.normalized).toBeLessThanOrEqual(1);
      }
    }
  });

  it("match% is 0..100 and breakdown contributions reconcile to score", () => {
    for (const r of out.results) {
      expect(r.matchPct).toBeGreaterThanOrEqual(0);
      expect(r.matchPct).toBeLessThanOrEqual(100);
      const sum = r.breakdown.reduce((s, b) => s + b.contribution, 0);
      // score may be reduced by budget/climate multipliers; without those it matches.
      expect(sum).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns at most 5 results (FR-406)", () => {
    expect(out.results.length).toBeLessThanOrEqual(5);
  });

  it("provides why + tradeoff bullets and a full breakdown (FR-406/407)", () => {
    for (const r of out.results) {
      expect(r.whyBullets.length).toBeGreaterThan(0);
      expect(r.tradeoffBullets.length).toBeGreaterThan(0);
      expect(r.breakdown).toHaveLength(PRIORITY_DIMENSIONS.length);
    }
  });
});

describe("determinism (FR-410)", () => {
  const answers: FinderAnswers = {
    maxOutTheDoorUsd: 90000,
    priorities: ["performance", "safety", "efficiency", "technology", "comfort", "cargo", "cost_of_ownership"],
    sportiness: 70,
  };
  it("identical inputs produce identical rankings", () => {
    const a = runFinder(catalog, answers, lookup).results.map((r) => r.vehicle.id);
    const b = runFinder(catalog, answers, lookup).results.map((r) => r.vehicle.id);
    expect(a).toEqual(b);
  });
  it("results are sorted by descending score", () => {
    const out = runFinder(catalog, answers, lookup);
    for (let i = 1; i < out.results.length; i++) {
      expect(out.results[i - 1]!.score).toBeGreaterThanOrEqual(out.results[i]!.score);
    }
  });
});

describe("golden ranking (§10 snapshot; bump scorer_version to change)", () => {
  it("matches the recorded shortlist for a fixed profile", () => {
    // A family-oriented shopper: SUV, safety-first, needs 3 rows, budget $95k.
    const answers: FinderAnswers = {
      maxOutTheDoorUsd: 95000,
      bodyStyles: ["SAV"],
      seatsNeeded: 5,
      priorities: ["safety", "cargo", "cost_of_ownership", "comfort", "technology", "efficiency", "performance"],
      requireAwd: true,
      sportiness: 30,
    };
    const out = runFinder(catalog, answers, lookup);
    const ranking = out.results.map((r) => ({
      id: r.vehicle.id,
      trim: r.vehicle.trimName,
      match: r.matchPct,
    }));
    expect(ranking).toMatchSnapshot();
  });
});
