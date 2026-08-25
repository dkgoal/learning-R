import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT } from "@/domain/config";
import {
  caqhAttestationDue,
  evaluateExpirable,
  evaluateExpirables,
  expirablesDashboard,
  reappointmentInitiationDate,
  reconcileCycles,
  renewalTasks,
} from "@/domain/expirables";
import {
  attributeBottlenecks,
  committeeThroughput,
  enrollmentCycleTimes,
  portfolioKpis,
  queueAging,
  stageDurations,
} from "@/domain/kpi";
import type { CommitteeReview, Expirable, OnboardingCase, PayorEnrollment, Task } from "@/domain/types";

const config = DEFAULT_TENANT;
const today = "2026-08-25";

function expirable(overrides: Partial<Expirable> = {}): Expirable {
  return {
    id: "e1",
    practitionerId: "p1",
    kind: "DEA",
    label: "DEA registration",
    expires: "2026-12-31",
    onExpiration: "SUSPEND_PRESCRIBING",
    ...overrides,
  };
}

describe("expirable status", () => {
  it("buckets by the configured lead-time ladder", () => {
    expect(evaluateExpirable(config, today, expirable({ expires: "2027-06-01" })).status).toBe("CURRENT");
    expect(evaluateExpirable(config, today, expirable({ expires: "2026-11-01" })).status).toBe("UPCOMING");
    expect(evaluateExpirable(config, today, expirable({ expires: "2026-09-10" })).status).toBe("URGENT");
    expect(evaluateExpirable(config, today, expirable({ expires: today })).status).toBe("DUE_TODAY");
    expect(evaluateExpirable(config, today, expirable({ expires: "2026-08-01" })).status).toBe("LAPSED");
  });

  it("reports which notice threshold is active", () => {
    expect(evaluateExpirable(config, today, expirable({ expires: "2026-09-10" })).leadThreshold).toBe(30);
    expect(evaluateExpirable(config, today, expirable({ expires: "2026-08-30" })).leadThreshold).toBe(7);
    expect(evaluateExpirable(config, today, expirable({ expires: "2027-06-01" })).leadThreshold).toBeNull();
    expect(evaluateExpirable(config, today, expirable({ expires: "2026-01-01" })).leadThreshold).toBeNull();
  });

  it("fires the suspension action once lapsed, except for notify-only", () => {
    expect(evaluateExpirable(config, today, expirable({ expires: "2026-08-01" })).actionFired).toBe(true);
    expect(
      evaluateExpirable(config, today, expirable({ expires: "2026-08-01", onExpiration: "NOTIFY_ONLY" })).actionFired,
    ).toBe(false);
  });

  it("sorts by urgency", () => {
    const views = evaluateExpirables(config, today, [
      expirable({ id: "far", expires: "2027-01-01" }),
      expirable({ id: "lapsed", expires: "2026-01-01" }),
      expirable({ id: "soon", expires: "2026-09-01" }),
    ]);
    expect(views.map((v) => v.expirable.id)).toEqual(["lapsed", "soon", "far"]);
  });
});

describe("expirables dashboard", () => {
  it("splits the horizon into non-overlapping windows", () => {
    const dash = expirablesDashboard(config, today, [
      expirable({ id: "a", expires: "2026-08-01" }),
      expirable({ id: "b", expires: "2026-09-10" }),
      expirable({ id: "c", expires: "2026-10-10" }),
      expirable({ id: "d", expires: "2026-11-10" }),
      expirable({ id: "e", expires: "2027-06-01" }),
    ]);
    expect(dash.lapsed.map((v) => v.expirable.id)).toEqual(["a"]);
    expect(dash.within30.map((v) => v.expirable.id)).toEqual(["b"]);
    expect(dash.within60.map((v) => v.expirable.id)).toEqual(["c"]);
    expect(dash.within90.map((v) => v.expirable.id)).toEqual(["d"]);
    expect(dash.beyond90.map((v) => v.expirable.id)).toEqual(["e"]);
    expect(dash.activeSuspensions).toHaveLength(1);
  });
});

describe("renewal ladder", () => {
  it("generates one task per configured lead time, longest first", () => {
    const tasks = renewalTasks(config, expirable({ expires: "2026-12-31" }), "case-1");
    expect(tasks).toHaveLength(config.expirableLeadDays.length);
    expect(tasks[0]?.due).toBe("2026-09-02");
    expect(tasks[0]?.title).toMatch(/120-day notice/);
    const final = tasks[tasks.length - 1];
    expect(final?.due).toBe("2026-12-31");
    expect(final?.title).toMatch(/prescribing rights will be suspended/);
    expect(final?.slaDays).toBe(0);
  });

  it("describes each expiration action", () => {
    const describe = (onExpiration: Expirable["onExpiration"]) =>
      renewalTasks(config, expirable({ onExpiration }), "c").slice(-1)[0]?.title ?? "";
    expect(describe("SUSPEND_PRIVILEGES")).toMatch(/privileges will be suspended/);
    expect(describe("SUSPEND_BILLING")).toMatch(/billing will be held/);
    expect(describe("NOTIFY_ONLY")).toMatch(/notification only/);
  });
});

describe("cycle reconciliation", () => {
  it("shares one verification pass when the two cycles land close together", () => {
    const result = reconcileCycles(config, "p1", "2026-05-14", "2026-05-14");
    expect(result.recredentialingDue).toBe("2029-05-14");
    expect(result.reappointmentDue).toBe("2028-05-14");
    // 36-month and 24-month cycles from the same date are a year apart.
    expect(result.canShareVerification).toBe(false);
    expect(result.sharedVerificationBy).toBe("2028-05-14");

    const aligned = reconcileCycles(config, "p1", "2025-06-01", "2026-06-01");
    expect(aligned.canShareVerification).toBe(true);
    expect(aligned.gapDays).toBe(0);
  });

  it("opens reappointment 150 days before the term ends", () => {
    expect(reappointmentInitiationDate("2028-05-14")).toBe("2027-12-16");
    expect(reappointmentInitiationDate("2028-05-14", 180)).toBe("2027-11-16");
  });

  it("puts CAQH attestation on a 120-day clock", () => {
    expect(caqhAttestationDue(config, "2026-05-11")).toBe("2026-09-08");
  });
});

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

const kase: OnboardingCase = {
  id: "c1",
  practitionerId: "p1",
  stage: "GO_LIVE",
  initiated: "2026-02-10",
  startDate: "2026-06-01",
  employmentType: "EMPLOYED",
  organizationIds: [],
  facilityIds: [],
  locationIds: [],
  states: [],
  expectedPayorProductIds: [],
  workHistory: [],
  disclosures: [],
  applicationCompleteOn: "2026-03-04",
  psvCompleteOn: "2026-04-08",
  committeeDecisionOn: "2026-05-14",
};

function enrollment(overrides: Partial<PayorEnrollment> = {}): PayorEnrollment {
  return {
    id: "e1",
    caseId: "c1",
    practitionerId: "p1",
    payorId: "pay-a",
    payorProductId: "prod-a",
    organizationId: "o1",
    locationId: "l1",
    status: "APPROVED",
    submitted: "2026-04-20",
    effectiveDate: "2026-06-15",
    par: true,
    followUps: [],
    ...overrides,
  };
}

describe("stage durations", () => {
  it("decomposes the path to the first billable encounter", () => {
    const d = stageDurations(kase, [enrollment({ retroactiveTo: "2026-05-21" })]);
    expect(d.initiationToApplicationComplete).toBe(22);
    expect(d.applicationCompleteToPsvComplete).toBe(35);
    expect(d.psvCompleteToCommitteeDecision).toBe(36);
    // The retroactive date is the one that matters for billing.
    expect(d.committeeDecisionToFirstEffective).toBe(7);
    expect(d.startDateToFirstBillable).toBe(-11);
  });

  it("leaves unreached stages null rather than zero", () => {
    const early: OnboardingCase = { ...kase, psvCompleteOn: undefined, committeeDecisionOn: undefined };
    const d = stageDurations(early, []);
    expect(d.applicationCompleteToPsvComplete).toBeNull();
    expect(d.initiationToFirstBillable).toBeNull();
  });
});

describe("bottleneck attribution", () => {
  const tasks: Task[] = [
    { id: "t1", caseId: "c1", title: "Clinician task", ownerRole: "CLINICIAN", status: "OPEN", created: "2026-07-01", due: "2026-07-15", slaDays: 14, remindersSent: 0 },
    { id: "t2", caseId: "c1", title: "Employer verification", ownerRole: "EXTERNAL_SOURCE", status: "DONE", created: "2026-06-01", due: "2026-06-20", completed: "2026-06-21", slaDays: 14, remindersSent: 0 },
    { id: "t3", caseId: "c1", title: "Chair review", ownerRole: "DEPARTMENT_CHAIR", status: "OPEN", created: "2026-08-01", due: "2026-08-15", slaDays: 14, remindersSent: 0 },
    { id: "t4", caseId: "c1", title: "Internal", ownerRole: "CREDENTIALING", status: "OPEN", created: "2026-08-20", due: "2026-08-30", slaDays: 10, remindersSent: 0 },
  ];

  it("charges days to the party actually holding the work", () => {
    const rows = attributeBottlenecks(kase, tasks, [enrollment()], today);
    const by = Object.fromEntries(rows.map((r) => [r.owner, r.days]));
    expect(by.CLINICIAN).toBe(55);
    expect(by.EXTERNAL_SOURCE).toBe(20);
    // A chair is a committee, not internal staff.
    expect(by.COMMITTEE).toBe(24);
    expect(by.INTERNAL_STAFF).toBe(5);
    // Payor days come from the enrollment clock, not from a task.
    expect(by.PAYOR).toBe(56);
    expect(rows.every((r) => r.percent >= 0)).toBe(true);
  });

  it("names the long-running items in the detail", () => {
    const rows = attributeBottlenecks(kase, tasks, [], today);
    expect(rows.find((r) => r.owner === "CLINICIAN")?.detail).toMatch(/Clinician task \(55d\)/);
    expect(rows.find((r) => r.owner === "INTERNAL_STAFF")?.detail).toBe("—");
  });

  it("returns zero percentages rather than dividing by zero", () => {
    const rows = attributeBottlenecks(kase, [], [], today);
    expect(rows.every((r) => r.percent === 0)).toBe(true);
  });
});

describe("queue aging", () => {
  it("ranks owners by overdue work", () => {
    const rows = queueAging(
      [
        { id: "t1", caseId: "c1", title: "a", ownerRole: "CLINICIAN", status: "OPEN", created: "2026-07-01", due: "2026-07-15", slaDays: 14, remindersSent: 0 },
        { id: "t2", caseId: "c1", title: "b", ownerRole: "CREDENTIALING", status: "OPEN", created: "2026-08-20", due: "2026-09-30", slaDays: 30, remindersSent: 0 },
        { id: "t3", caseId: "c1", title: "c", ownerRole: "CREDENTIALING", status: "DONE", created: "2026-01-01", due: "2026-02-01", completed: "2026-02-01", slaDays: 30, remindersSent: 0 },
      ],
      today,
    );
    expect(rows[0]?.ownerRole).toBe("CLINICIAN");
    expect(rows[0]?.overdue).toBe(1);
    expect(rows[0]?.slaBreaches).toBe(1);
    // Completed work is not queue aging.
    expect(rows.find((r) => r.ownerRole === "CREDENTIALING")?.open).toBe(1);
  });
});

describe("committee throughput", () => {
  const reviews: CommitteeReview[] = [
    { id: "r1", privilegeRequestId: "q1", body: "CREDENTIALS_COMMITTEE", scheduled: "2026-04-28", decided: "2026-04-30", outcome: "APPROVED" },
    { id: "r2", privilegeRequestId: "q2", body: "CREDENTIALS_COMMITTEE", scheduled: "2026-05-28", decided: "2026-06-04", outcome: "DEFERRED", deferralReason: "Case logs missing" },
    { id: "r3", privilegeRequestId: "q3", body: "CREDENTIALS_COMMITTEE", scheduled: "2026-06-28", decided: "2026-06-30", outcome: "DENIED" },
    { id: "r4", privilegeRequestId: "q4", body: "MEC", scheduled: "2026-07-01" },
  ];

  it("reports deferral rate and the reasons behind it", () => {
    const rows = committeeThroughput(reviews);
    const cc = rows.find((r) => r.body === "CREDENTIALS_COMMITTEE");
    expect(cc?.decided).toBe(3);
    expect(cc?.deferralRate).toBe(33);
    expect(cc?.denied).toBe(1);
    expect(cc?.averageDaysToDecision).toBe(4);
    expect(cc?.topDeferralReasons[0]).toEqual({ reason: "Case logs missing", count: 1 });
    // An undecided review contributes nothing but does not break the rollup.
    expect(rows.find((r) => r.body === "MEC")?.decided).toBe(0);
  });
});

describe("portfolio KPIs", () => {
  it("summarizes medians and pending counts across cases", () => {
    const kpis = portfolioKpis(
      [kase, { ...kase, id: "c2", stage: "CANCELLED" }],
      { c1: [enrollment(), enrollment({ id: "e2", status: "SUBMITTED", effectiveDate: undefined, submitted: "2026-01-01" })] },
      ["c1"],
      today,
    );
    expect(kpis.activeCases).toBe(1);
    expect(kpis.casesAtRisk).toBe(1);
    expect(kpis.medianDaysToFirstBillable).toBe(125);
    expect(kpis.medianDaysToDecision).toBe(93);
    expect(kpis.enrollmentsPending).toBe(1);
    expect(kpis.enrollmentsOverdue).toBe(1);
  });

  it("returns null medians rather than zero when nothing has completed", () => {
    const kpis = portfolioKpis(
      [{ ...kase, committeeDecisionOn: undefined }],
      { c1: [] },
      [],
      today,
    );
    expect(kpis.medianDaysToFirstBillable).toBeNull();
    expect(kpis.medianDaysToDecision).toBeNull();
  });

  it("lists enrollment cycle times longest first", () => {
    const rows = enrollmentCycleTimes([
      enrollment({ id: "fast", effectiveDate: "2026-05-01" }),
      enrollment({ id: "slow", effectiveDate: "2026-08-01" }),
      enrollment({ id: "pending", effectiveDate: undefined }),
    ]);
    expect(rows.map((r) => r.enrollmentId)).toEqual(["slow", "fast"]);
  });
});
