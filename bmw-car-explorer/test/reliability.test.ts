import { describe, expect, it } from "vitest";
import { computeReliabilityIndex } from "@/domain/reliability";

describe("computeReliabilityIndex (R-01)", () => {
  it("returns 100 for a clean record", () => {
    expect(computeReliabilityIndex({ openRecallCount: 0, complaintCount: 0 })).toBe(100);
  });
  it("penalizes recalls more than complaints", () => {
    const oneRecall = computeReliabilityIndex({ openRecallCount: 1, complaintCount: 0 });
    const oneComplaint = computeReliabilityIndex({ openRecallCount: 0, complaintCount: 1 });
    expect(oneRecall).toBeLessThan(oneComplaint);
  });
  it("never drops below the floor", () => {
    expect(
      computeReliabilityIndex({ openRecallCount: 100, complaintCount: 1000 }),
    ).toBe(5);
  });
  it("is monotonic — more problems never raise the score", () => {
    let prev = 101;
    for (let c = 0; c <= 50; c += 5) {
      const idx = computeReliabilityIndex({ openRecallCount: 1, complaintCount: c });
      expect(idx).toBeLessThanOrEqual(prev);
      prev = idx;
    }
  });
});
