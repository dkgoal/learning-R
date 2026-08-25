/**
 * Integration tests over the seeded portfolio.
 *
 * These assert the §15 edge cases actually behave as the requirements describe
 * once every engine is wired together — the level at which a regression in one
 * module quietly changes what another module reports.
 */

import { describe, expect, it } from "vitest";
import { buildCaseView, caseSummaries, enrollmentTracker, portfolioRevenue } from "@/lib/case-view";
import { AUDIT_LOG } from "@/data/audit-log";
import { verifyIntegrity } from "@/domain/audit";

function view(id: string) {
  const v = buildCaseView(id);
  if (!v) throw new Error(`case ${id} missing`);
  return v;
}

describe("portfolio", () => {
  it("builds every seeded case", () => {
    expect(caseSummaries()).toHaveLength(5);
    expect(buildCaseView("case-does-not-exist")).toBeNull();
  });

  it("keeps a seeded audit log that verifies", () => {
    expect(verifyIntegrity(AUDIT_LOG).intact).toBe(true);
  });
});

describe("physician with an unachievable start date (§4.1, §8.2)", () => {
  const v = view("case-osei");

  it("reports the start date as unachievable with a named critical path", () => {
    expect(v.plan.startDateAchievable).toBe(false);
    expect(v.plan.riskLevel).toBe("RED");
    expect(v.plan.criticalPath).toContain("file_complete");
  });

  it("flags the privilege requests unsupported by verified evidence", () => {
    const cath = v.privilege?.evaluations.find((e) => e.privilege.id === "priv-cardio-cath");
    expect(cath?.supported).toBe(false);
    expect(cath?.volumeDiscrepancy).toBe(true);
    expect(cath?.recommendation).toBe("INSUFFICIENT_EVIDENCE");

    const core = v.privilege?.evaluations.find((e) => e.privilege.id === "priv-cardio-core");
    expect(core?.supported).toBe(true);
  });

  it("holds the committee packet on unadjudicated findings", () => {
    expect(v.privilege?.packetReady).toBe(false);
    const packetGate = v.gates.find((g) => g.rule.id === "rule-committee-packet");
    expect(packetGate?.satisfied).toBe(false);
    expect(packetGate?.unmet.map((u) => u.condition.fact)).toContain("unadjudicatedFindings");
  });

  it("keeps a work-history discrepancy as a finding rather than overwriting it", () => {
    const discrepancy = v.psv.items.find((i) => i.status === "DISCREPANCY");
    expect(discrepancy?.verification?.selfReported).toBe("2021-09-01 to 2026-04-30");
    expect(discrepancy?.verification?.verified).toBe("2021-11-15 to 2026-04-30");
  });

  it("blocks EPCS until identity proofing and two-factor are done", () => {
    const epcs = v.gates.find((g) => g.rule.id === "rule-epcs");
    expect(epcs?.satisfied).toBe(false);
    expect(epcs?.unmet.map((u) => u.condition.fact).sort()).toEqual([
      "epcsIdentityProofed",
      "epcsTwoFactorEnrolled",
    ]);
  });
});

describe("multi-state telehealth APP (§15.3, §9, §7.5)", () => {
  const v = view("case-whitfield");

  it("blocks commercial products under the uncontracted virtual-care TIN", () => {
    const noContract = v.requiredEnrollments.filter((r) =>
      r.blockers.some((b) => b.kind === "NO_CONTRACT"),
    );
    expect(noContract.length).toBeGreaterThan(0);
    expect(noContract.every((r) => r.organization.tin === "883344556")).toBe(true);
  });

  it("flags the payor that will not credential NPs", () => {
    const united = v.requiredEnrollments.find((r) => r.payor.id === "pay-united");
    expect(united?.blockers.some((b) => b.kind === "APP_TYPE_NOT_CREDENTIALED")).toBe(true);
    const model = v.app?.billingModels.find((b) => b.payorName === "UnitedHealthcare");
    expect(model?.assessment.model).toBe("UNDER_SUPERVISING_PHYSICIAN");
    expect(model?.assessment.forcedBySupervisorRequirement).toBe(true);
  });

  it("catches the supervising physician at the state capacity cap", () => {
    expect(v.app?.supervision?.overCapacity).toBe(true);
    expect(v.app?.supervision?.cap).toBe(4);
  });

  it("catches a DEA schedule Texas does not permit an NP to prescribe", () => {
    const texas = v.app?.scope.find((s) => s.state === "TX");
    expect(texas?.schedulesExceedingScope).toEqual(["2"]);
  });

  it("reports the unexecuted collaborative agreement", () => {
    expect(v.app?.agreementProblems.join(" ")).toMatch(/Not signed by the supervising physician/);
    expect(v.app?.agreementProblems.join(" ")).toMatch(/filed with the state/);
  });
});

describe("new graduate IMG with a pending license (§15.1, §15.2, §15.4)", () => {
  const v = view("case-chandran");

  it("requires ECFMG verification for an international graduate", () => {
    expect(v.psv.items.some((i) => i.required.element === "ECFMG")).toBe(true);
  });

  it("treats the licence as pending rather than active for privileging", () => {
    const licenseGate = v.gates.find((g) => g.rule.id === "rule-ehr-prescribing");
    expect(licenseGate?.satisfied).toBe(false);
  });

  it("warns on work authorization expiring inside the first 90 days", () => {
    const visa = v.gates.find((g) => g.rule.id === "rule-visa-window");
    expect(visa?.satisfied).toBe(false);
    expect(visa?.rule.severity).toBe("WARNING");
    expect(v.expirables.beyond90.some((e) => e.expirable.kind === "VISA")).toBe(true);
  });

  it("accepts the explained gap between residency and the start date", () => {
    expect(v.completeness.gaps.every((g) => g.explained)).toBe(true);
  });
});

describe("intra-system transfer, live and billing (§15.8, §15.16)", () => {
  const v = view("case-marchetti");

  it("reuses prior verifications instead of restarting the file", () => {
    expect(v.delta).not.toBeNull();
    expect(v.delta?.reusedCount).toBeGreaterThan(5);
    expect(v.delta?.savedManualTouches).toBeGreaterThan(0);
  });

  it("applies the retroactive Medicare date to claims before the effective date", () => {
    const medicare = v.claims.filter((c) => c.claim.payorId === "pay-medicare");
    expect(medicare.every((c) => c.disposition === "RELEASABLE")).toBe(true);
  });

  it("reports revenue already lost to a filing limit", () => {
    const expired = v.claims.filter((c) => c.disposition === "FILING_LIMIT_EXPIRED");
    expect(expired).toHaveLength(1);
    expect(v.revenue.unrecoverable).toBe(4310);
    expect(v.revenue.imminentLoss).toBeGreaterThan(0);
  });

  it("holds billing per payor rather than globally", () => {
    expect(v.billingHold.anyHold).toBe(true);
    expect(v.billingHold.releasedEnrollments.length).toBeGreaterThan(0);
    expect(v.fullyBillableOn).toBeNull();
  });

  it("keeps the lost payor submission's original history alongside the resubmission", () => {
    const united = v.enrollments.find((e) => e.payorId === "pay-united");
    expect(united?.resubmittedFrom).toBe("enr-marc-united-original");
    expect(united?.followUps.length).toBeGreaterThan(1);
  });

  it("has a completed approval chain", () => {
    expect(v.nextApproval).toBeNull();
  });
});

describe("locum tenens (§15.5)", () => {
  const v = view("case-baird");

  it("plans against the abbreviated locum track", () => {
    expect(v.plan.startDateAchievable).toBe(true);
    expect(v.plan.milestones.some((m) => m.id === "temp_privileges")).toBe(true);
  });

  it("counts down the temporary privileges and the billing bridge", () => {
    expect(v.temporary?.expired).toBe(false);
    expect(v.temporary?.reason).toMatch(/urgent/i);
    expect(v.bridge?.arrangement.modifier).toBe("Q6");
    expect(v.bridge?.expired).toBe(false);
  });

  it("reports the overdue FPPE proctoring", () => {
    const fppe = v.fppe.find((f) => f.fppe.privilegeId === "priv-hosp-core");
    expect(fppe?.overdue).toBe(true);
    expect(fppe?.blocksRoutineStatus).toBe(true);
  });
});

describe("cross-case reporting", () => {
  it("does not attribute one clinician's claims to another's enrollment", () => {
    // Two clinicians share a clinic, a TIN and a Blue Shield contract; the
    // portfolio total must equal the sum of the per-case totals.
    const portfolio = portfolioRevenue();
    const perCase = ["case-osei", "case-whitfield", "case-chandran", "case-marchetti", "case-baird"]
      .map((id) => view(id).revenue)
      .reduce(
        (acc, r) => ({
          totalHeld: acc.totalHeld + r.totalHeld,
          unrecoverable: acc.unrecoverable + r.unrecoverable,
          releasableNow: acc.releasableNow + r.releasableNow,
        }),
        { totalHeld: 0, unrecoverable: 0, releasableNow: 0 },
      );
    expect(portfolio.totalHeld).toBe(perCase.totalHeld);
    expect(portfolio.unrecoverable).toBe(perCase.unrecoverable);
    expect(portfolio.releasableNow).toBe(perCase.releasableNow);
  });

  it("joins every tracked enrollment back to its derived requirement", () => {
    const rows = enrollmentTracker();
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.clinician.length > 0 && r.payorName.length > 0)).toBe(true);
    // The delegated Health Net enrollment is marked as a roster submission.
    expect(rows.some((r) => r.delegated)).toBe(true);
  });
});
