import { describe, expect, it } from "vitest";
import { minimumLeadDays, planTimeline } from "@/domain/timeline";
import { DEFAULT_MILESTONES, LOCUM_MILESTONES, type MilestoneDef } from "@/domain/milestones";

describe("backward planning", () => {
  it("flags a 60-day start date on day one", () => {
    // The requirement this whole module exists for: payor credentialing runs
    // 90–180 days, so a 60-day start date must be red immediately.
    const plan = planTimeline({ initiated: "2026-01-01", startDate: "2026-03-02" });
    expect(plan.startDateAchievable).toBe(false);
    expect(plan.riskLevel).toBe("RED");
    expect(plan.startDateSlippageDays).toBeGreaterThan(60);
    expect(plan.riskSummary).toContain("not achievable");
  });

  it("accepts a start date with the full lead time available", () => {
    const lead = minimumLeadDays("START_DATE");
    const plan = planTimeline({
      initiated: "2026-01-01",
      startDate: `2026-01-01`,
      firstBillableTarget: "2026-01-01",
    });
    expect(lead).toBeGreaterThan(120);
    // Same anchor for both dates means everything is late; used here only to
    // pin the lead-time constant the planner derives from the graph.
    expect(plan.startDateSlippageDays).toBe(lead);

    const comfortable = planTimeline({
      initiated: "2026-01-01",
      startDate: "2026-12-01",
      firstBillableTarget: "2026-12-01",
    });
    expect(comfortable.startDateAchievable).toBe(true);
    expect(comfortable.riskLevel).toBe("GREEN");
  });

  it("separates start-date risk from revenue risk", () => {
    // Payor effective dates trail almost every start date. Folding that into a
    // single status would make every case red and the signal worthless.
    // 165 days of lead: enough for the appointment track, not enough for the
    // payor track behind it.
    const plan = planTimeline({ initiated: "2026-01-01", startDate: "2026-06-15" });
    expect(plan.riskLevel).toBe("GREEN");
    expect(plan.billingRiskLevel).toBe("RED");
    expect(plan.firstBillableSlippageDays).toBeGreaterThan(30);
  });

  it("re-baselines the forward pass on completed milestones", () => {
    const base = planTimeline({ initiated: "2026-01-01", startDate: "2026-09-01" });
    const withActuals = planTimeline({
      initiated: "2026-01-01",
      startDate: "2026-09-01",
      // Intake finished three weeks earlier than the planning duration assumed.
      actuals: { initiation: "2026-01-02", intake: "2026-01-10" },
    });
    const baseFile = base.milestones.find((m) => m.id === "file_complete");
    const fastFile = withActuals.milestones.find((m) => m.id === "file_complete");
    expect(fastFile?.earliestFinish.localeCompare(baseFile?.earliestFinish ?? "")).toBeLessThan(0);
    expect(withActuals.milestones.find((m) => m.id === "intake")?.status).toBe("DONE");
  });

  it("routes each milestone to the gate its successors feed", () => {
    const plan = planTimeline({ initiated: "2026-01-01", startDate: "2026-09-01" });
    const byId = new Map(plan.milestones.map((m) => [m.id, m]));
    expect(byId.get("payor_effective")?.gate).toBe("FIRST_BILLABLE");
    expect(byId.get("schedule_build")?.gate).toBe("START_DATE");
    expect(byId.get("board")?.gate).toBe("START_DATE");
    // file_complete feeds both tracks and is attributed to the tighter one.
    expect(byId.get("file_complete")?.gate).toBe("FIRST_BILLABLE");
  });

  it("reports a critical path ending at the tightest terminal milestone", () => {
    const plan = planTimeline({ initiated: "2026-01-01", startDate: "2026-03-01" });
    expect(plan.criticalPath[0]).toBe("initiation");
    expect(plan.criticalPath.length).toBeGreaterThan(2);
  });

  it("plans a locum on the abbreviated graph", () => {
    const full = planTimeline({ initiated: "2026-07-10", startDate: "2026-08-10" });
    const locum = planTimeline({
      initiated: "2026-07-10",
      startDate: "2026-08-10",
      milestones: LOCUM_MILESTONES,
    });
    // A locum already on service should not be reported as months late.
    expect(full.startDateAchievable).toBe(false);
    expect(locum.startDateAchievable).toBe(true);
    expect(minimumLeadDays("START_DATE", LOCUM_MILESTONES)).toBeLessThan(
      minimumLeadDays("START_DATE"),
    );
  });
});

describe("graph validation", () => {
  it("rejects a cycle", () => {
    const cyclic: MilestoneDef[] = [
      { id: "a", label: "A", track: "HR", durationDays: 1, dependsOn: ["b"], waitingOn: "INTERNAL" },
      { id: "b", label: "B", track: "HR", durationDays: 1, dependsOn: ["a"], gate: "START_DATE", waitingOn: "INTERNAL" },
    ];
    expect(() => planTimeline({ initiated: "2026-01-01", startDate: "2026-02-01", milestones: cyclic })).toThrow(
      /cycle/i,
    );
  });

  it("rejects a dangling dependency", () => {
    const dangling: MilestoneDef[] = [
      { id: "a", label: "A", track: "HR", durationDays: 1, dependsOn: ["nope"], gate: "START_DATE", waitingOn: "INTERNAL" },
    ];
    expect(() => planTimeline({ initiated: "2026-01-01", startDate: "2026-02-01", milestones: dangling })).toThrow(
      /unknown milestone/i,
    );
  });

  it("rejects duplicate milestone ids", () => {
    const dupes: MilestoneDef[] = [
      { id: "a", label: "A", track: "HR", durationDays: 1, dependsOn: [], gate: "START_DATE", waitingOn: "INTERNAL" },
      { id: "a", label: "A again", track: "HR", durationDays: 1, dependsOn: [], gate: "START_DATE", waitingOn: "INTERNAL" },
    ];
    expect(() => planTimeline({ initiated: "2026-01-01", startDate: "2026-02-01", milestones: dupes })).toThrow(
      /duplicate/i,
    );
  });

  it("keeps the shipped default graph acyclic and fully connected", () => {
    expect(() =>
      planTimeline({ initiated: "2026-01-01", startDate: "2026-09-01", milestones: DEFAULT_MILESTONES }),
    ).not.toThrow();
  });
});
