import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT } from "@/domain/config";
import {
  DEFAULT_APPROVAL_CHAIN,
  evaluatePrivilegeItem,
  evaluatePrivilegeRequest,
  fppeForGrantedPrivileges,
  fppeStatus,
  nextApprovalStep,
  oppeDueDates,
  proxyDeficiencies,
  temporaryPrivilegeStatus,
  validateVote,
  type CredentialEvidence,
} from "@/domain/privileges";
import type { CommitteeReview, Fppe, Privilege, PrivilegeRequest } from "@/domain/types";

const config = DEFAULT_TENANT;
const today = "2026-08-25";

const core: Privilege = {
  id: "priv-core",
  privilegeSetId: "ps",
  name: "Core cardiology",
  kind: "CORE",
  criteria: [
    { kind: "LICENSE_ACTIVE", label: "Active license in the facility's state" },
    { kind: "TRAINING_COMPLETED", label: "Cardiology fellowship", detail: "Cardiology Fellowship" },
    { kind: "BOARD_ELIGIBLE_WINDOW", label: "Certified or eligible within 60 months", value: 60 },
  ],
};

const cath: Privilege = {
  id: "priv-cath",
  privilegeSetId: "ps",
  name: "Diagnostic catheterization",
  kind: "SPECIAL",
  criteria: [
    { kind: "MIN_VOLUME", label: "Minimum 100 cases", value: 100 },
    { kind: "CURRENT_ACTIVITY", label: "Activity within 12 months", value: 12 },
    { kind: "BOARD_CERTIFIED", label: "Board certified" },
    { kind: "DEA_ACTIVE", label: "DEA active in the facility's state" },
    { kind: "LIFE_SUPPORT", label: "Current ACLS", detail: "ACLS" },
  ],
};

const evidence: CredentialEvidence = {
  boardCertified: true,
  residencyCompleted: "2018-06-30",
  trainingCompleted: ["Cardiology Fellowship"],
  activeLicenseStates: ["CA"],
  deaActiveStates: ["CA"],
  lifeSupportHeld: ["ACLS"],
  volumes: {
    "priv-cath": { cases: 61, lastPerformed: "2026-03-02" },
  },
  facilityState: "CA",
};

describe("criteria evaluation", () => {
  it("grants a core privilege backed by verified evidence", () => {
    const result = evaluatePrivilegeItem(config, core, { privilegeId: core.id, decision: "REQUESTED" }, evidence, today);
    expect(result.supported).toBe(true);
    expect(result.recommendation).toBe("GRANT");
    expect(result.findings).toHaveLength(0);
  });

  it("refuses a privilege whose volume is not evidenced", () => {
    const result = evaluatePrivilegeItem(
      config,
      cath,
      { privilegeId: cath.id, decision: "REQUESTED", claimedVolume: 140, evidencedVolume: 61 },
      evidence,
      today,
    );
    expect(result.supported).toBe(false);
    expect(result.recommendation).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.volumeDiscrepancy).toBe(true);
    expect(result.findings.join(" ")).toMatch(/61 evidenced case/);
    expect(result.findings.join(" ")).toMatch(/adjudicate/i);
  });

  it("recommends proctoring for a special privilege that does clear its criteria", () => {
    const generous: CredentialEvidence = {
      ...evidence,
      volumes: { "priv-cath": { cases: 200, lastPerformed: "2026-06-01" } },
    };
    const result = evaluatePrivilegeItem(config, cath, { privilegeId: cath.id, decision: "REQUESTED" }, generous, today);
    expect(result.supported).toBe(true);
    expect(result.recommendation).toBe("GRANT_WITH_PROCTORING");
  });

  it("fails currency when the last case is outside the window", () => {
    const stale: CredentialEvidence = {
      ...evidence,
      volumes: { "priv-cath": { cases: 500, lastPerformed: "2024-01-01" } },
    };
    const result = evaluatePrivilegeItem(config, cath, { privilegeId: cath.id, decision: "REQUESTED" }, stale, today);
    expect(result.results.find((r) => r.criterion.kind === "CURRENT_ACTIVITY")?.met).toBe(false);
  });

  it("reports no documented activity distinctly from stale activity", () => {
    const none: CredentialEvidence = { ...evidence, volumes: {} };
    const result = evaluatePrivilegeItem(config, cath, { privilegeId: cath.id, decision: "REQUESTED" }, none, today);
    expect(result.results.find((r) => r.criterion.kind === "CURRENT_ACTIVITY")?.evidence).toMatch(
      /No documented activity/,
    );
  });

  it("handles board eligibility windows", () => {
    const eligible: CredentialEvidence = { ...evidence, boardCertified: false };
    const inWindow = evaluatePrivilegeItem(config, core, { privilegeId: core.id, decision: "REQUESTED" }, eligible, today);
    // Residency completed 2018-06-30; the 60-month window closes 2023-06-30.
    expect(inWindow.results.find((r) => r.criterion.kind === "BOARD_ELIGIBLE_WINDOW")?.met).toBe(false);

    const recentGrad = evaluatePrivilegeItem(
      config,
      core,
      { privilegeId: core.id, decision: "REQUESTED" },
      { ...eligible, residencyCompleted: "2026-06-30" },
      today,
    );
    expect(recentGrad.results.find((r) => r.criterion.kind === "BOARD_ELIGIBLE_WINDOW")?.met).toBe(true);

    const unknown = evaluatePrivilegeItem(
      config,
      core,
      { privilegeId: core.id, decision: "REQUESTED" },
      { ...eligible, residencyCompleted: undefined },
      today,
    );
    expect(unknown.results.find((r) => r.criterion.kind === "BOARD_ELIGIBLE_WINDOW")?.evidence).toMatch(
      /No verified residency completion/,
    );
  });

  it("checks licence and DEA against the facility's state, not any state", () => {
    const elsewhere: CredentialEvidence = { ...evidence, facilityState: "OR" };
    const result = evaluatePrivilegeItem(config, cath, { privilegeId: cath.id, decision: "REQUESTED" }, elsewhere, today);
    expect(result.results.find((r) => r.criterion.kind === "DEA_ACTIVE")?.met).toBe(false);
  });

  it("fails an unrecognized criterion closed rather than open", () => {
    const odd: Privilege = {
      ...core,
      criteria: [{ kind: "SOMETHING_NEW" as never, label: "Unknown rule" }],
    };
    const result = evaluatePrivilegeItem(config, odd, { privilegeId: odd.id, decision: "REQUESTED" }, evidence, today);
    expect(result.supported).toBe(false);
    expect(result.results[0]?.evidence).toMatch(/manual review/i);
  });
});

describe("request-level evaluation", () => {
  const request: PrivilegeRequest = {
    id: "req1",
    caseId: "c1",
    practitionerId: "p1",
    facilityId: "f1",
    privilegeSetId: "ps",
    staffCategory: "ACTIVE",
    items: [
      { privilegeId: "priv-core", decision: "REQUESTED" },
      { privilegeId: "priv-cath", decision: "REQUESTED", claimedVolume: 140, evidencedVolume: 61 },
      { privilegeId: "priv-unknown", decision: "REQUESTED" },
    ],
  };

  it("blocks the packet and names the failing criterion", () => {
    const result = evaluatePrivilegeRequest(config, request, [core, cath], evidence, today);
    expect(result.supportedCount).toBe(1);
    expect(result.unsupportedCount).toBe(1);
    // The unknown privilege id is skipped rather than crashing the packet.
    expect(result.evaluations).toHaveLength(2);
    expect(result.packetReady).toBe(false);
    expect(result.blockers[0]).toMatch(/Diagnostic catheterization/);
  });

  it("blocks an expired temporary grant", () => {
    const expired = { ...request, temporary: { granted: "2026-01-01", expires: "2026-04-01", reason: "URGENT_NEED" as const } };
    const result = evaluatePrivilegeRequest(config, expired, [core], evidence, today);
    expect(result.blockers.join(" ")).toMatch(/expired 2026-04-01/);
  });

  it("counts every proxy documentation gap", () => {
    const proxied: PrivilegeRequest = {
      ...request,
      proxy: {
        distantSiteFacility: "Remote Health",
        agreementOnFile: false,
        distantSiteAccredited: false,
        performanceDataReceived: false,
      },
    };
    expect(proxyDeficiencies(proxied)).toHaveLength(3);
    expect(proxyDeficiencies(request)).toHaveLength(0);
    const complete = {
      ...proxied,
      proxy: { distantSiteFacility: "Remote Health", agreementOnFile: true, distantSiteAccredited: true, performanceDataReceived: true },
    };
    expect(proxyDeficiencies(complete)).toHaveLength(0);
  });

  it("reports temporary privilege countdowns and refuses to invent one", () => {
    const temp: PrivilegeRequest = {
      ...request,
      temporary: { granted: "2026-08-05", expires: "2026-10-30", reason: "PENDING_APPLICATION" },
    };
    const status = temporaryPrivilegeStatus(temp, today);
    expect(status.daysRemaining).toBe(66);
    expect(status.expired).toBe(false);
    expect(status.reason).toMatch(/important patient care need/);
    expect(() => temporaryPrivilegeStatus(request, today)).toThrow();
    expect(
      temporaryPrivilegeStatus({ ...temp, temporary: { ...temp.temporary!, reason: "DISASTER" } }, today).reason,
    ).toMatch(/emergency management plan/i);
  });
});

describe("committee decisions", () => {
  function review(overrides: Partial<CommitteeReview> = {}): CommitteeReview {
    return {
      id: "r1",
      privilegeRequestId: "req1",
      body: "CREDENTIALS_COMMITTEE",
      scheduled: "2026-04-28",
      decided: "2026-04-30",
      outcome: "APPROVED",
      membersPresent: 7,
      quorumRequired: 5,
      votesFor: 7,
      votesAgainst: 0,
      recusals: [],
      ...overrides,
    };
  }

  it("accepts a properly constituted vote", () => {
    expect(validateVote(review()).valid).toBe(true);
  });

  it("rejects a vote taken without quorum", () => {
    const result = validateVote(review({ membersPresent: 3 }));
    expect(result.quorumMet).toBe(false);
    expect(result.problems[0]).toMatch(/Quorum not met/);
  });

  it("rejects more votes than eligible members after recusals", () => {
    const result = validateVote(review({ recusals: ["dr-a", "dr-b"], votesFor: 7 }));
    expect(result.problems.join(" ")).toMatch(/recusal/);
  });

  it("requires an outcome, a date, and a reason for a deferral", () => {
    expect(validateVote(review({ outcome: undefined })).problems.join(" ")).toMatch(/No outcome/);
    expect(validateVote(review({ decided: undefined })).problems.join(" ")).toMatch(/No decision date/);
    expect(validateVote(review({ outcome: "DEFERRED" })).problems.join(" ")).toMatch(/must record a reason/);
  });

  it("walks the approval chain in order", () => {
    expect(nextApprovalStep([])).toBe("DEPARTMENT_CHAIR");
    expect(nextApprovalStep([review({ body: "DEPARTMENT_CHAIR" })])).toBe("CREDENTIALS_COMMITTEE");
    const all = DEFAULT_APPROVAL_CHAIN.map((body) => review({ body, id: body }));
    expect(nextApprovalStep(all)).toBeNull();
    // A deferral does not advance the chain.
    expect(nextApprovalStep([review({ body: "DEPARTMENT_CHAIR", outcome: "DEFERRED", deferralReason: "case logs" })])).toBe(
      "DEPARTMENT_CHAIR",
    );
  });
});

describe("FPPE and OPPE", () => {
  const request: PrivilegeRequest = {
    id: "req1",
    caseId: "c1",
    practitionerId: "p1",
    facilityId: "f1",
    privilegeSetId: "ps",
    staffCategory: "ACTIVE",
    items: [
      { privilegeId: "priv-core", decision: "GRANTED" },
      { privilegeId: "priv-cath", decision: "GRANTED_WITH_CONDITIONS", proctorRequired: true },
      { privilegeId: "priv-tavr", decision: "DENIED" },
    ],
  };

  it("triggers FPPE for every granted privilege and only those", () => {
    const fppes = fppeForGrantedPrivileges(request, "2026-06-01", {
      method: "CHART_REVIEW",
      volumeThreshold: 10,
      durationDays: 90,
    });
    expect(fppes).toHaveLength(2);
    expect(fppes.map((f) => f.privilegeId)).not.toContain("priv-tavr");
    expect(fppes[1]?.method).toBe("PROCTORING");
    expect(fppes[0]?.due).toBe("2026-08-30");
  });

  it("blocks routine status until FPPE completes satisfactorily", () => {
    const base: Fppe = {
      id: "f1",
      practitionerId: "p1",
      facilityId: "f1",
      privilegeId: "priv-core",
      method: "CHART_REVIEW",
      trigger: "NEW_PRIVILEGE",
      volumeThreshold: 10,
      completedVolume: 6,
      due: "2026-09-12",
    };
    const inProgress = fppeStatus(base, today);
    expect(inProgress.complete).toBe(false);
    expect(inProgress.progressPercent).toBe(60);
    expect(inProgress.blocksRoutineStatus).toBe(true);

    const done = fppeStatus({ ...base, completedVolume: 10, completed: "2026-08-01", outcome: "SATISFACTORY" }, today);
    expect(done.complete).toBe(true);
    expect(done.blocksRoutineStatus).toBe(false);

    const unsatisfactory = fppeStatus(
      { ...base, completedVolume: 10, completed: "2026-08-01", outcome: "UNSATISFACTORY" },
      today,
    );
    expect(unsatisfactory.blocksRoutineStatus).toBe(true);

    const overdue = fppeStatus({ ...base, due: "2026-07-01" }, today);
    expect(overdue.overdue).toBe(true);

    expect(fppeStatus({ ...base, volumeThreshold: 0 }, today).progressPercent).toBe(0);
  });

  it("schedules OPPE more frequently than annually", () => {
    expect(oppeDueDates("2026-06-01", 24)).toEqual([
      "2026-12-01",
      "2027-06-01",
      "2027-12-01",
      "2028-06-01",
    ]);
  });
});
