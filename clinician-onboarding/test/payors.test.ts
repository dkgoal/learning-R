import { describe, expect, it } from "vitest";
import {
  benchmarkPayors,
  daysPending,
  daysToEffective,
  determineRequiredEnrollments,
  enrollmentKey,
  enrollmentsNeedingFollowUp,
  generateRosterFile,
  isEffectiveOn,
  labelProgram,
  medicareFormsFor,
  medicareRetroactiveEffective,
  planNameChange,
  planTermination,
  reconcileRoster,
  type RosterRow,
} from "@/domain/payors";
import type {
  OnboardingCase,
  Organization,
  Payor,
  PayorContract,
  PayorEnrollment,
  PayorProduct,
  PracticeLocation,
  Practitioner,
} from "@/domain/types";

const org: Organization = { id: "o1", name: "Group", tin: "471234567", npiType2: "1477882345" };
const location: PracticeLocation = {
  id: "l1",
  name: "Clinic",
  organizationId: "o1",
  address: "1 Main",
  state: "CA",
  acceptingNewPatients: true,
  adaAccessible: true,
};

const commercial: Payor = {
  id: "pay-c",
  name: "Commercial Co",
  program: "COMMERCIAL",
  submissionChannel: "AVAILITY",
  typicalTurnaroundDays: 90,
  credentialsAppTypes: ["MD", "DO"],
};
const advantage: Payor = {
  id: "pay-ma",
  name: "MA Plan",
  program: "MEDICARE_ADVANTAGE",
  submissionChannel: "PORTAL",
  typicalTurnaroundDays: 75,
  credentialsAppTypes: ["MD", "DO", "NP"],
};

const products: PayorProduct[] = [
  { id: "prod-c", payorId: "pay-c", name: "PPO", network: "PPO", states: ["CA"] },
  { id: "prod-ma", payorId: "pay-ma", name: "MA PPO", network: "MA", states: ["CA"] },
  { id: "prod-tx", payorId: "pay-c", name: "TX PPO", network: "PPO", states: ["TX"] },
];

const physician: Practitioner = {
  id: "p1",
  legalFirstName: "Ada",
  legalLastName: "Reyes",
  formerNames: [],
  type: "MD",
  primarySpecialty: "Cardiology",
  subspecialties: [],
  languages: [],
  email: "a@example.org",
  phone: "555",
};

const kase: OnboardingCase = {
  id: "c1",
  practitionerId: "p1",
  stage: "PARALLEL_TRACKS",
  initiated: "2026-01-01",
  startDate: "2026-09-01",
  employmentType: "EMPLOYED",
  organizationIds: ["o1"],
  facilityIds: [],
  locationIds: ["l1"],
  states: ["CA"],
  expectedPayorProductIds: ["prod-c", "prod-ma", "prod-tx"],
  workHistory: [],
  disclosures: [],
};

function derive(overrides: Partial<Parameters<typeof determineRequiredEnrollments>[0]> = {}) {
  return determineRequiredEnrollments({
    practitioner: physician,
    onboardingCase: kase,
    organizations: [org],
    locations: [location],
    payors: [commercial, advantage],
    products,
    contracts: [
      { id: "ct", organizationId: "o1", payorId: "pay-c", productIds: ["prod-c"], effective: "2020-01-01", delegated: false },
    ],
    licensedStates: ["CA"],
    hasNpi: true,
    ...overrides,
  });
}

describe("derived payor requirement", () => {
  it("skips products not sold in the location's state", () => {
    const rows = derive();
    // prod-tx is a Texas product; the clinician has only a California location.
    expect(rows.map((r) => r.product.id).sort()).toEqual(["prod-c", "prod-ma"]);
  });

  it("flags a missing contract as a contracting problem, not a credentialing one", () => {
    const ma = derive().find((r) => r.payor.id === "pay-ma");
    const blocker = ma?.blockers.find((b) => b.kind === "NO_CONTRACT");
    expect(blocker).toBeDefined();
    expect(blocker?.remedy).toMatch(/double the usual timeline/);
  });

  it("requires the parent program before a Medicare Advantage plan", () => {
    const ma = derive().find((r) => r.payor.id === "pay-ma");
    expect(ma?.blockers.some((b) => b.kind === "PARENT_PROGRAM_REQUIRED")).toBe(true);
  });

  it("flags a payor that will not credential this APP type", () => {
    const rows = derive({ practitioner: { ...physician, type: "PA" } });
    const commercialRow = rows.find((r) => r.payor.id === "pay-c");
    const blocker = commercialRow?.blockers.find((b) => b.kind === "APP_TYPE_NOT_CREDENTIALED");
    expect(blocker?.remedy).toMatch(/supervising physician/);
  });

  it("blocks on a missing NPI and on practising unlicensed in the service state", () => {
    const noNpi = derive({ hasNpi: false });
    expect(noNpi[0]?.blockers.some((b) => b.kind === "MISSING_NPI")).toBe(true);
    const unlicensed = derive({ licensedStates: ["OR"] });
    expect(unlicensed[0]?.blockers.some((b) => b.kind === "MISSING_LICENSE_IN_STATE")).toBe(true);
  });

  it("keys a requirement at the product × TIN × location grain", () => {
    expect(enrollmentKey("prod-c", "o1", "l1")).toBe("prod-c::o1::l1");
    expect(derive()[0]?.key).toBe("prod-c::o1::l1");
  });
});

describe("government programs", () => {
  it("derives the CMS form set from the TIN relationship", () => {
    expect(medicareFormsFor({ reassignsBenefits: true, newTin: false, wantsEft: true })).toEqual([
      "CMS-855I",
      "CMS-855R",
      "CMS-588",
    ]);
    expect(medicareFormsFor({ reassignsBenefits: false, newTin: true, wantsEft: false })).toEqual([
      "CMS-855I",
      "CMS-855B",
    ]);
  });

  it("computes the 30-day retroactive reach from the filing date", () => {
    expect(medicareRetroactiveEffective("2026-08-25")).toBe("2026-07-26");
  });

  it("labels every program", () => {
    const labels = (["COMMERCIAL", "MEDICARE", "MEDICAID", "MEDICARE_ADVANTAGE", "MEDICAID_MCO", "TRICARE", "WORKERS_COMP"] as const).map(labelProgram);
    expect(labels).toEqual([
      "Commercial",
      "Medicare",
      "Medicaid",
      "Medicare Advantage",
      "Medicaid MCO",
      "Tricare",
      "Workers' compensation",
    ]);
  });
});

// ---------------------------------------------------------------------------

function enrollment(overrides: Partial<PayorEnrollment> = {}): PayorEnrollment {
  return {
    id: "e1",
    caseId: "c1",
    practitionerId: "p1",
    payorId: "pay-c",
    payorProductId: "prod-c",
    organizationId: "o1",
    locationId: "l1",
    status: "SUBMITTED",
    submitted: "2026-01-01",
    par: true,
    followUps: [],
    ...overrides,
  };
}

describe("enrollment tracking", () => {
  it("measures days to effective and days pending", () => {
    expect(daysToEffective(enrollment({ effectiveDate: "2026-04-01" }))).toBe(90);
    expect(daysToEffective(enrollment())).toBeNull();
    expect(daysPending(enrollment(), "2026-03-01")).toBe(59);
    expect(daysPending(enrollment({ submitted: undefined }), "2026-03-01")).toBeNull();
  });

  it("treats an enrollment as billable only when approved and effective", () => {
    const approved = enrollment({ status: "APPROVED", effectiveDate: "2026-06-15" });
    expect(isEffectiveOn(approved, "2026-06-20")).toBe(true);
    expect(isEffectiveOn(approved, "2026-06-01")).toBe(false);
    // A portal status is not an effective date of record.
    expect(isEffectiveOn(enrollment({ status: "PAYOR_REVIEW", effectiveDate: "2026-06-15" }), "2026-07-01")).toBe(false);
    // A retroactive grant reaches back past the nominal effective date.
    expect(
      isEffectiveOn(enrollment({ status: "APPROVED", effectiveDate: "2026-06-15", retroactiveTo: "2026-05-16" }), "2026-05-20"),
    ).toBe(true);
  });

  it("raises a follow-up when contact lapses or the payor blows its own turnaround", () => {
    const stale = enrollment({ submitted: "2026-01-01" });
    const chased = enrollment({
      id: "e2",
      submitted: "2026-01-01",
      followUps: [{ date: "2026-02-25", channel: "PORTAL", by: "u", outcome: "in review" }],
    });
    const due = enrollmentsNeedingFollowUp([stale, chased], [commercial], "2026-03-01");
    expect(due.map((d) => d.enrollment.id)).toContain("e1");
    // Chased four days ago and still inside the 90-day turnaround.
    expect(due.map((d) => d.enrollment.id)).not.toContain("e2");

    const overdue = enrollmentsNeedingFollowUp([stale], [commercial], "2026-06-01");
    expect(overdue[0]?.overdueVsTurnaround).toBe(true);
  });

  it("benchmarks payors by median days to effective", () => {
    const rows = benchmarkPayors(
      [
        enrollment({ id: "a", effectiveDate: "2026-03-01" }),
        enrollment({ id: "b", effectiveDate: "2026-05-01" }),
        enrollment({ id: "c" }),
      ],
      [commercial],
      "2026-06-01",
    );
    expect(rows[0]?.completed).toBe(2);
    expect(rows[0]?.medianDaysToEffective).toBe(90);
    expect(rows[0]?.worstDaysToEffective).toBe(120);
    expect(rows[0]?.pending).toBe(1);
    expect(rows[0]?.overdueCount).toBe(1);
  });
});

describe("delegated rosters", () => {
  const rows: RosterRow[] = [
    { action: "ADD", practitionerId: "p1", lastName: "Reyes", firstName: "Ada", npi: "1234567893", tin: "471234567", locationId: "l1", productId: "prod-c", effectiveDate: "2026-09-01", specialty: "Cardiology", practitionerType: "MD" },
    { action: "ADD", practitionerId: "p2", lastName: "", firstName: "Bo", npi: "123", tin: "47", locationId: "l1", productId: "prod-c", effectiveDate: "2026-09-01", specialty: "", practitionerType: "MD" },
  ];

  it("refuses to mark a roster submittable while it has validation issues", () => {
    const file = generateRosterFile("pay-c", "2026-09-01", rows);
    expect(file.submittable).toBe(false);
    expect(file.issues.map((i) => i.field).sort()).toEqual(["name", "npi", "specialty", "tin"]);
    expect(file.issues.every((i) => i.rowIndex === 1)).toBe(true);
  });

  it("catches the row that never came back in the payor's acknowledgment", () => {
    const file = generateRosterFile("pay-c", "2026-09-01", [rows[0] as RosterRow]);
    const silent = reconcileRoster(file, []);
    expect(silent.missingFromReturn).toHaveLength(1);

    const mixed = reconcileRoster(file, [
      { npi: "1234567893", productId: "prod-c", accepted: false },
      { npi: "9999999999", productId: "prod-c", accepted: true, effectiveDate: "2026-09-01" },
    ]);
    expect(mixed.rejected[0]?.reason).toMatch(/without a stated reason/);
    expect(mixed.unexpectedInReturn).toHaveLength(1);

    const accepted = reconcileRoster(file, [
      { npi: "1234567893", productId: "prod-c", accepted: true, effectiveDate: "2026-09-01" },
    ]);
    expect(accepted.matched[0]?.effectiveDate).toBe("2026-09-01");
  });
});

describe("change management", () => {
  it("fans a termination out to every active payor and downstream system", () => {
    const plan = planTermination(
      [
        enrollment({ id: "a", status: "APPROVED" }),
        enrollment({ id: "b", status: "SUBMITTED" }),
        enrollment({ id: "c", status: "WITHDRAWN" }),
      ],
      [commercial],
      "2026-09-30",
    );
    expect(plan.payorTerminations.map((t) => t.enrollmentId).sort()).toEqual(["a", "b"]);
    expect(plan.rosterTermRows).toBe(2);
    expect(plan.downstream.join(" ")).toMatch(/directory/i);
  });

  it("propagates a name change to every board, payor and registry", () => {
    const targets = planNameChange([enrollment({ id: "a" })], ["CA", "OR"]);
    expect(targets).toContain("NPPES (NPI record)");
    expect(targets).toContain("State board name change: CA");
    expect(targets).toContain("State board name change: OR");
    expect(targets.some((t) => t.includes("CAQH"))).toBe(true);
  });
});
