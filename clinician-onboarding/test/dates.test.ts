import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysBetween,
  formatDate,
  isAfter,
  isBefore,
  isIsoDate,
  maxDate,
  minDate,
  relativeDays,
} from "@/domain/dates";

describe("ISO date validation", () => {
  it("accepts real calendar dates and rejects rolled-over ones", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-1")).toBe(false);
    expect(isIsoDate(20260101)).toBe(false);
  });

  it("throws rather than silently coercing a bad input", () => {
    expect(() => addDays("not-a-date", 1)).toThrow(RangeError);
  });
});

describe("date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("clamps month arithmetic to the last valid day", () => {
    // A 1-month reappointment shift from Jan 31 must land in February, not
    // roll forward into March.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-05-14", 24)).toBe("2028-05-14");
    expect(addMonths("2026-05-14", -2)).toBe("2026-03-14");
  });

  it("counts days without drifting across a DST boundary", () => {
    // US DST transitions fall inside this range; UTC anchoring keeps it exact.
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
    expect(daysBetween("2026-11-30", "2026-11-01")).toBe(-29);
  });

  it("compares and reduces", () => {
    expect(isBefore("2026-01-01", "2026-01-02")).toBe(true);
    expect(isAfter("2026-01-01", "2026-01-02")).toBe(false);
    expect(minDate("2026-05-01", "2026-01-09", "2026-03-03")).toBe("2026-01-09");
    expect(maxDate("2026-05-01", "2026-01-09")).toBe("2026-05-01");
    expect(minDate()).toBeNull();
    expect(maxDate()).toBeNull();
  });
});

describe("formatting", () => {
  it("renders a placeholder rather than an invalid date", () => {
    expect(formatDate("2026-08-25")).toBe("08/25/2026");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("garbage")).toBe("—");
  });

  it("phrases relative days in both directions", () => {
    expect(relativeDays("2026-08-25", "2026-08-25")).toBe("today");
    expect(relativeDays("2026-08-25", "2026-08-26")).toBe("in 1 day");
    expect(relativeDays("2026-08-25", "2026-09-04")).toBe("in 10 days");
    expect(relativeDays("2026-08-25", "2026-08-24")).toBe("1 day ago");
  });
});
