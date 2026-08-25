import { describe, expect, it } from "vitest";
import {
  assessBridge,
  assessHeldClaims,
  billingHoldState,
  firstBillableRows,
  fullyBillableDate,
  revenueAtRisk,
  type HeldClaim,
} from "@/domain/billing";
import type { Organization, Payor, PayorEnrollment, PracticeLocation } from "@/domain/types";

const org: Organization = { id: "o1", name: "Group", tin: "471234567", npiType2: "1477882345" };
const otherOrg: Organization = { id: "o2", name: "Virtual", tin: "883344556", npiType2: "1902334455" };
const location: PracticeLocation = { id: "l1", name: "Clinic", organizationId: "o1", address: "1 Main", state: "CA", acceptingNewPatients: true, adaAccessible: true };
const payor: Payor = { id: "pay-c", name: "Commercial Co", program: "COMMERCIAL", submissionChannel: "PORTAL", typicalTurnaroundDays: 90, credentialsAppTypes: ["MD"] };
const products = [{ id: "prod-c", name: "PPO" }];

function enrollment(overrides: Partial<PayorEnrollment> = {}): PayorEnrollment {
  return {
    id: "e1",
    caseId: "c1",
    practitionerId: "p1",
    payorId: "pay-c",
    payorProductId: "prod-c",
    organizationId: "o1",
    locationId: "l1",
    status: "APPROVED",
    submitted: "2026-03-01",
    effectiveDate: "2026-07-01",
    par: true,
    followUps: [],
    ...overrides,
  };
}

function claim(overrides: Partial<HeldClaim> = {}): HeldClaim {
  return {
    id: "clm-1",
    practitionerId: "p1",
    payorId: "pay-c",
    payorProductId: "prod-c",
    organizationId: "o1",
    locationId: "l1",
    serviceDate: "2026-07-15",
    amount: 1000,
    ...overrides,
  };
}

const limits = { byPayorId: { "pay-c": 90 }, default: 180 };

describe("first billable date", () => {
  it("derives from the payor effective date, not the employment start date", () => {
    const rows = firstBillableRows(
      [enrollment()],
      [payor],
      products,
      [org],
      [location],
      "2026-06-01",
      "2026-08-25",
    );
    expect(rows[0]?.firstBillableDate).toBe("2026-07-01");
    expect(rows[0]?.unbillableDaysFromStart).toBe(30);
    expect(rows[0]?.billingHold).toBe(false);
    expect(rows[0]?.tin).toBe("471234567");
  });

  it("prefers a retroactive date when the payor grants one", () => {
    const rows = firstBillableRows(
      [enrollment({ retroactiveTo: "2026-06-01" })],
      [payor],
      products,
      [org],
      [location],
      "2026-06-01",
      "2026-08-25",
    );
    expect(rows[0]?.firstBillableDate).toBe("2026-06-01");
    expect(rows[0]?.unbillableDaysFromStart).toBe(0);
  });

  it("holds billing while a payor is still pending", () => {
    const rows = firstBillableRows(
      [enrollment({ status: "SUBMITTED", effectiveDate: undefined })],
      [payor],
      products,
      [org],
      [location],
      "2026-06-01",
      "2026-08-25",
    );
    expect(rows[0]?.billingHold).toBe(true);
    expect(rows[0]?.firstBillableDate).toBeNull();
    expect(fullyBillableDate(rows)).toBeNull();
  });

  it("releases per payor rather than as one global flag", () => {
    const rows = firstBillableRows(
      [enrollment(), enrollment({ id: "e2", status: "SUBMITTED", effectiveDate: undefined })],
      [payor],
      products,
      [org],
      [location],
      "2026-06-01",
      "2026-08-25",
    );
    const state = billingHoldState("p1", rows);
    expect(state.anyHold).toBe(true);
    expect(state.releasedEnrollments).toHaveLength(1);
    expect(state.releasedPercent).toBe(50);
    expect(billingHoldState("p1", []).releasedPercent).toBe(0);
  });

  it("reports the date every payor is live once they all are", () => {
    const rows = firstBillableRows(
      [enrollment(), enrollment({ id: "e2", effectiveDate: "2026-08-01" })],
      [payor],
      products,
      [org],
      [location],
      "2026-06-01",
      "2026-08-25",
    );
    expect(fullyBillableDate(rows)).toBe("2026-08-01");
  });
});

describe("held claims", () => {
  it("matches a claim to its own clinician's enrollment", () => {
    // Two clinicians at the same clinic under the same contract have separate
    // effective dates; matching on the grain alone would release one clinician's
    // claims against the other's approval.
    const mine = enrollment({ id: "mine", practitionerId: "p1", effectiveDate: "2026-07-01" });
    const theirs = enrollment({ id: "theirs", practitionerId: "p2", status: "SUBMITTED", effectiveDate: undefined });
    const assessed = assessHeldClaims([claim()], [theirs, mine], limits, "2026-08-25");
    expect(assessed[0]?.disposition).toBe("RELEASABLE");
  });

  it("marks a claim unrecoverable once the filing limit has passed", () => {
    const assessed = assessHeldClaims([claim({ serviceDate: "2026-04-01" })], [enrollment()], limits, "2026-08-25");
    expect(assessed[0]?.disposition).toBe("FILING_LIMIT_EXPIRED");
    expect(assessed[0]?.reason).toMatch(/unrecoverable/);
  });

  it("flags a releasable claim as urgent inside the last 30 days", () => {
    // 90-day limit from 2026-06-05 lands 2026-09-03: nine days out.
    const assessed = assessHeldClaims([claim({ serviceDate: "2026-06-05" })], [enrollment({ effectiveDate: "2026-06-01" })], limits, "2026-08-25");
    expect(assessed[0]?.disposition).toBe("RELEASABLE_URGENT");
    expect(assessed[0]?.daysToFilingDeadline).toBe(9);
  });

  it("distinguishes 'not yet effective' from 'service predates the effective date'", () => {
    const pending = assessHeldClaims(
      [claim({ serviceDate: "2026-08-01" })],
      [enrollment({ status: "SUBMITTED", effectiveDate: undefined })],
      limits,
      "2026-08-25",
    );
    expect(pending[0]?.disposition).toBe("HELD_NOT_YET_EFFECTIVE");

    const early = assessHeldClaims([claim({ serviceDate: "2026-06-15" })], [enrollment()], limits, "2026-08-25");
    expect(early[0]?.disposition).toBe("NOT_COVERED_BY_EFFECTIVE_DATE");
    expect(early[0]?.reason).toMatch(/retroactive/);
  });

  it("reports no enrollment at all as held, with the reason", () => {
    const orphan = assessHeldClaims([claim({ organizationId: "o2" })], [enrollment()], limits, "2026-08-25");
    expect(orphan[0]?.disposition).toBe("HELD_NOT_YET_EFFECTIVE");
    expect(orphan[0]?.reason).toMatch(/No enrollment exists/);
  });

  it("falls back to the default filing limit for an unlisted payor", () => {
    const assessed = assessHeldClaims(
      [claim({ payorId: "pay-x", serviceDate: "2026-04-01" })],
      [enrollment()],
      limits,
      "2026-08-25",
    );
    // 180-day default keeps an April service date alive where 90 days would not.
    expect(assessed[0]?.disposition).not.toBe("FILING_LIMIT_EXPIRED");
  });
});

describe("revenue at risk", () => {
  it("separates held, imminently lost, already lost and releasable", () => {
    const assessed = assessHeldClaims(
      [
        claim({ id: "a", serviceDate: "2026-07-15", amount: 1000 }),
        claim({ id: "b", serviceDate: "2026-04-01", amount: 2000 }),
        claim({ id: "c", serviceDate: "2026-06-01", amount: 3000 }),
        claim({ id: "d", serviceDate: "2026-08-20", amount: 4000, organizationId: "o2" }),
      ],
      [enrollment()],
      limits,
      "2026-08-25",
    );
    const risk = revenueAtRisk(assessed);
    expect(risk.claimCount).toBe(4);
    expect(risk.releasableNow).toBe(1000);
    expect(risk.unrecoverable).toBe(2000);
    expect(risk.notCovered).toBe(3000);
    expect(risk.totalHeld).toBe(4000);
    expect(risk.byPayor[0]?.payorId).toBe("pay-c");
  });

  it("counts a held claim within 30 days of its limit as an imminent loss", () => {
    const assessed = assessHeldClaims(
      [claim({ serviceDate: "2026-06-05", amount: 5000 })],
      [enrollment({ status: "SUBMITTED", effectiveDate: undefined })],
      limits,
      "2026-08-25",
    );
    expect(revenueAtRisk(assessed).imminentLoss).toBe(5000);
  });
});

describe("interim bridge arrangements", () => {
  const bridge = {
    kind: "RECIPROCAL_BILLING" as const,
    modifier: "Q6" as const,
    regularPhysicianNpi: "1558842203",
    substituteNpi: "1667723310",
    start: "2026-08-10",
    maxContinuousDays: 60,
  };

  it("counts down the continuous period", () => {
    const status = assessBridge(bridge, "2026-08-25");
    expect(status.daysUsed).toBe(15);
    expect(status.expiresOn).toBe("2026-10-09");
    expect(status.expired).toBe(false);
    expect(status.warning).toBeNull();
  });

  it("warns two weeks out and reports an exceeded limit as unsupportable", () => {
    expect(assessBridge(bridge, "2026-09-30").warning).toMatch(/ends 2026-10-09/);
    const over = assessBridge(bridge, "2026-10-20");
    expect(over.expired).toBe(true);
    expect(over.warning).toMatch(/not supportable/);
  });
});

describe("organization lookup fallbacks", () => {
  it("renders identifiers rather than crashing on an unknown org or location", () => {
    const rows = firstBillableRows(
      [enrollment({ organizationId: "missing", locationId: "missing" })],
      [payor],
      products,
      [otherOrg],
      [location],
      "2026-06-01",
      "2026-08-25",
    );
    expect(rows[0]?.organizationName).toBe("missing");
    expect(rows[0]?.tin).toBe("—");
    expect(rows[0]?.locationName).toBe("missing");
  });
});
