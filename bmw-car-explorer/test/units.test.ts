import { describe, expect, it } from "vitest";
import { convert, formatValue, numericValue, serializePublic } from "@/domain/units";
import type { AttributeValue, Vehicle } from "@/domain/types";

function av(key: string, value: Partial<AttributeValue>): AttributeValue {
  return {
    key,
    sourceId: "s_bmw_press",
    confidence: "high",
    lastVerifiedAt: "2026-07-01",
    ...value,
  };
}

describe("convert", () => {
  it("returns imperial unchanged", () => {
    expect(convert(100, "mi", "imperial")).toEqual({ value: 100, unit: "mi" });
  });
  it("converts miles to km", () => {
    const c = convert(100, "mi", "metric");
    expect(c.unit).toBe("km");
    expect(c.value).toBeCloseTo(160.9344, 3);
  });
  it("converts mpg to L/100km", () => {
    const c = convert(30, "mpg", "metric");
    expect(c.unit).toBe("L/100km");
    expect(c.value).toBeCloseTo(7.84, 1);
  });
  it("passes through null unit", () => {
    expect(convert(5, null, "metric")).toEqual({ value: 5, unit: "" });
  });
});

describe("numericValue", () => {
  it("reads numbers", () => {
    expect(numericValue(av("horsepower_hp", { num: 255 }))).toBe(255);
  });
  it("coerces booleans to 1/0", () => {
    expect(numericValue(av("head_up_display", { bool: true }))).toBe(1);
    expect(numericValue(av("head_up_display", { bool: false }))).toBe(0);
  });
  it("returns undefined for missing", () => {
    expect(numericValue(undefined)).toBeUndefined();
    expect(numericValue(av("engine_code", { text: "B58" }))).toBeUndefined();
  });
});

describe("formatValue", () => {
  it("formats currency", () => {
    expect(formatValue(av("base_msrp", { num: 45950 }))).toBe("$45,950");
  });
  it("formats a numeric with unit and precision", () => {
    expect(formatValue(av("zero_to_sixty_s", { num: 5.6 }))).toBe("5.6 s");
  });
  it("formats booleans as Yes/No", () => {
    expect(formatValue(av("head_up_display", { bool: true }))).toBe("Yes");
  });
  it("renders missing values as em dash", () => {
    expect(formatValue(undefined)).toBe("—");
  });
});

describe("serializePublic (AR-03 / AC-02)", () => {
  it("strips non-public (licensing-restricted) attributes", () => {
    const vehicle: Vehicle = {
      id: 999,
      familySlug: "3-series",
      modelYear: 2026,
      trimName: "Test",
      slug: "test",
      powertrainType: "ICE",
      drivetrain: "RWD",
      baseMsrpUsd: 45000,
      destinationUsd: 1175,
      availabilityStatus: "on_sale",
      imageAlt: "test",
      features: [],
      attributes: {
        horsepower_hp: av("horsepower_hp", { num: 255 }),
        jd_power_quality: av("jd_power_quality", { num: 85 }),
        edmunds_rating: av("edmunds_rating", { num: 8.1 }),
      },
    };
    const out = serializePublic(vehicle);
    expect(out.attributes["horsepower_hp"]).toBeDefined();
    expect(out.attributes["jd_power_quality"]).toBeUndefined();
    expect(out.attributes["edmunds_rating"]).toBeUndefined();
  });
});
