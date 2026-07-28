import { describe, expect, it } from "vitest";
import {
  allAttributes,
  getAttribute,
  publicAttributes,
} from "@/domain/attribute-registry";
import { allVehicles } from "@/data/catalog";

describe("attribute registry (AC-01 / §9 key consistency)", () => {
  it("keys are unique", () => {
    const keys = allAttributes().map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keys are snake_case", () => {
    for (const d of allAttributes()) {
      expect(d.key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("comparable attributes declare a direction (higher_is_better not null)", () => {
    for (const d of allAttributes()) {
      if (d.comparable) expect(d.higherIsBetter).not.toBeNull();
    }
  });

  it("every attribute key used in catalog data exists in the registry", () => {
    // This is the in-repo stand-in for the CI three-way key drift check (§9):
    // data keys must match attribute_registry.key exactly.
    for (const v of allVehicles()) {
      for (const key of Object.keys(v.attributes)) {
        expect(getAttribute(key), `unregistered attribute key: ${key}`).toBeDefined();
      }
    }
  });
});

describe("licensing kill switch (AC-02 / §14.1 / R-01)", () => {
  it("licensed C8 rating attributes are NOT public", () => {
    for (const key of ["jd_power_quality", "consumer_reports_road_test", "edmunds_rating"]) {
      expect(getAttribute(key)?.public).toBe(false);
    }
  });

  it("no non-public C8 attribute leaks into the public set", () => {
    expect(publicAttributes().some((d) => d.category === "C8")).toBe(false);
  });

  it("the substitute reliability_index IS public", () => {
    expect(getAttribute("reliability_index")?.public).toBe(true);
  });
});
