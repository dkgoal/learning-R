/**
 * Reporting and KPIs (§13).
 *
 * The headline metric is deliberately *time to first billable encounter*, not
 * "days to credentialing decision". A credentialing team can post an excellent
 * decision-time number while the organization still cannot bill for the
 * clinician, and optimizing the wrong half of that is how the silo persists.
 *
 * Bottleneck attribution matters just as much: "onboarding took 154 days" is not
 * actionable, "84 of those days were waiting on the clinician and 41 on one
 * payor" is.
 */

import { daysBetween, type IsoDate } from "./dates";
import type { CommitteeReview, Id, OnboardingCase, PayorEnrollment, Task } from "./types";
import { daysToEffective } from "./payors";

export type BottleneckOwner = "CLINICIAN" | "INTERNAL_STAFF" | "EXTERNAL_SOURCE" | "PAYOR" | "COMMITTEE";

export interface StageDurations {
  initiationToApplicationComplete: number | null;
  applicationCompleteToPsvComplete: number | null;
  psvCompleteToCommitteeDecision: number | null;
  committeeDecisionToFirstEffective: number | null;
  initiationToFirstBillable: number | null;
  /** Days the clinician was employed but could not bill a given payor. */
  startDateToFirstBillable: number | null;
}

export function stageDurations(
  kase: OnboardingCase,
  enrollments: readonly PayorEnrollment[],
): StageDurations {
  const effectiveDates = enrollments
    .map((e) => e.retroactiveTo ?? e.effectiveDate)
    .filter((d): d is IsoDate => Boolean(d))
    .sort();
  const firstEffective = effectiveDates[0] ?? null;

  const span = (from: IsoDate | undefined, to: IsoDate | null | undefined) =>
    from && to ? daysBetween(from, to) : null;

  return {
    initiationToApplicationComplete: span(kase.initiated, kase.applicationCompleteOn),
    applicationCompleteToPsvComplete: span(kase.applicationCompleteOn, kase.psvCompleteOn),
    psvCompleteToCommitteeDecision: span(kase.psvCompleteOn, kase.committeeDecisionOn),
    committeeDecisionToFirstEffective: span(kase.committeeDecisionOn, firstEffective),
    initiationToFirstBillable: span(kase.initiated, firstEffective),
    startDateToFirstBillable: span(kase.startDate, firstEffective),
  };
}

export interface BottleneckAttribution {
  owner: BottleneckOwner;
  days: number;
  percent: number;
  detail: string;
}

/**
 * Attribution is derived from task ownership and enrollment timelines rather
 * than from stage boundaries, because stages overlap: the payor clock and the
 * committee clock run at the same time, and charging both to "credentialing"
 * would double-count.
 */
export function attributeBottlenecks(
  kase: OnboardingCase,
  tasks: readonly Task[],
  enrollments: readonly PayorEnrollment[],
  today: IsoDate,
): BottleneckAttribution[] {
  const buckets = new Map<BottleneckOwner, number>([
    ["CLINICIAN", 0],
    ["INTERNAL_STAFF", 0],
    ["EXTERNAL_SOURCE", 0],
    ["PAYOR", 0],
    ["COMMITTEE", 0],
  ]);
  const details = new Map<BottleneckOwner, string[]>();

  for (const task of tasks) {
    const end = task.completed ?? today;
    const days = Math.max(0, daysBetween(task.created, end));
    const owner = ownerBucket(task.ownerRole);
    buckets.set(owner, (buckets.get(owner) ?? 0) + days);
    if (days >= 14) {
      details.set(owner, [...(details.get(owner) ?? []), `${task.title} (${days}d)`]);
    }
  }

  for (const enrollment of enrollments) {
    if (!enrollment.submitted) continue;
    const end = enrollment.effectiveDate ?? today;
    const days = Math.max(0, daysBetween(enrollment.submitted, end));
    buckets.set("PAYOR", (buckets.get("PAYOR") ?? 0) + days);
  }

  const total = [...buckets.values()].reduce((a, b) => a + b, 0);
  return [...buckets.entries()]
    .map(([owner, days]) => ({
      owner,
      days,
      percent: total === 0 ? 0 : Math.round((days / total) * 100),
      detail: (details.get(owner) ?? []).slice(0, 3).join("; ") || "—",
    }))
    .sort((a, b) => b.days - a.days);
}

function ownerBucket(role: Task["ownerRole"]): BottleneckOwner {
  switch (role) {
    case "CLINICIAN":
      return "CLINICIAN";
    case "EXTERNAL_SOURCE":
      return "EXTERNAL_SOURCE";
    case "PAYOR":
      return "PAYOR";
    case "COMMITTEE":
    case "DEPARTMENT_CHAIR":
      return "COMMITTEE";
    default:
      return "INTERNAL_STAFF";
  }
}

export interface QueueAging {
  ownerRole: Task["ownerRole"];
  open: number;
  overdue: number;
  oldestDays: number;
  averageAgeDays: number;
  slaBreaches: number;
}

/** §13 "Staff productivity and queue aging". */
export function queueAging(tasks: readonly Task[], today: IsoDate): QueueAging[] {
  const roles = [...new Set(tasks.map((t) => t.ownerRole))];
  return roles
    .map((role) => {
      const open = tasks.filter(
        (t) => t.ownerRole === role && t.status !== "DONE" && t.status !== "CANCELLED",
      );
      const ages = open.map((t) => daysBetween(t.created, today));
      return {
        ownerRole: role,
        open: open.length,
        overdue: open.filter((t) => daysBetween(t.due, today) > 0).length,
        oldestDays: ages.length > 0 ? Math.max(...ages) : 0,
        averageAgeDays:
          ages.length === 0 ? 0 : Math.round(ages.reduce((a, b) => a + b, 0) / ages.length),
        slaBreaches: open.filter((t) => daysBetween(t.created, today) > t.slaDays).length,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}

export interface CommitteeThroughput {
  body: CommitteeReview["body"];
  decided: number;
  deferred: number;
  denied: number;
  deferralRate: number;
  averageDaysToDecision: number | null;
  topDeferralReasons: { reason: string; count: number }[];
}

/** §13 "Committee throughput, deferral rate, and reasons". */
export function committeeThroughput(reviews: readonly CommitteeReview[]): CommitteeThroughput[] {
  const bodies = [...new Set(reviews.map((r) => r.body))];
  return bodies.map((body) => {
    const mine = reviews.filter((r) => r.body === body && r.decided);
    const deferred = mine.filter((r) => r.outcome === "DEFERRED");
    const waits = mine
      .filter((r) => r.scheduled && r.decided)
      .map((r) => daysBetween(r.scheduled as IsoDate, r.decided as IsoDate));
    const reasonCounts = new Map<string, number>();
    for (const r of deferred) {
      const reason = r.deferralReason ?? "Unspecified";
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    return {
      body,
      decided: mine.length,
      deferred: deferred.length,
      denied: mine.filter((r) => r.outcome === "DENIED").length,
      deferralRate: mine.length === 0 ? 0 : Math.round((deferred.length / mine.length) * 100),
      averageDaysToDecision:
        waits.length === 0 ? null : Math.round(waits.reduce((a, b) => a + b, 0) / waits.length),
      topDeferralReasons: [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    };
  });
}

export interface PortfolioKpis {
  activeCases: number;
  casesAtRisk: number;
  medianDaysToFirstBillable: number | null;
  medianDaysToDecision: number | null;
  enrollmentsPending: number;
  enrollmentsOverdue: number;
}

export function portfolioKpis(
  cases: readonly OnboardingCase[],
  enrollmentsByCase: Record<Id, PayorEnrollment[]>,
  atRiskCaseIds: readonly Id[],
  today: IsoDate,
  typicalTurnaroundDays = 90,
): PortfolioKpis {
  const active = cases.filter((c) => c.stage !== "CANCELLED");
  const billableDurations: number[] = [];
  const decisionDurations: number[] = [];
  let pending = 0;
  let overdue = 0;

  for (const kase of active) {
    const enrollments = enrollmentsByCase[kase.id] ?? [];
    const durations = stageDurations(kase, enrollments);
    if (durations.initiationToFirstBillable !== null) {
      billableDurations.push(durations.initiationToFirstBillable);
    }
    if (kase.committeeDecisionOn) {
      decisionDurations.push(daysBetween(kase.initiated, kase.committeeDecisionOn));
    }
    for (const e of enrollments) {
      if (e.submitted && !e.effectiveDate) {
        pending += 1;
        if (daysBetween(e.submitted, today) > typicalTurnaroundDays) overdue += 1;
      }
    }
  }

  return {
    activeCases: active.length,
    casesAtRisk: atRiskCaseIds.length,
    medianDaysToFirstBillable: medianOf(billableDurations),
    medianDaysToDecision: medianOf(decisionDurations),
    enrollmentsPending: pending,
    enrollmentsOverdue: overdue,
  };
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

/** §13 payor turnaround benchmarking, expressed per enrollment for drill-down. */
export function enrollmentCycleTimes(
  enrollments: readonly PayorEnrollment[],
): { enrollmentId: Id; payorId: Id; days: number }[] {
  return enrollments
    .map((e) => ({ enrollmentId: e.id, payorId: e.payorId, days: daysToEffective(e) }))
    .filter((r): r is { enrollmentId: Id; payorId: Id; days: number } => r.days !== null)
    .sort((a, b) => b.days - a.days);
}
