/**
 * Backward timeline planning and start-date risk (§4.1).
 *
 * "Backward-plan the timeline from the start date. System calculates required-by
 * dates for each milestone and immediately flags whether the start date is
 * achievable. Payor credentialing routinely takes 90–180 days; a 60-day start
 * date should raise a red flag on day one, not month three."
 *
 * This is a two-pass critical path calculation over the milestone graph:
 *   forward pass  → the earliest each milestone can realistically finish
 *   backward pass → the latest each milestone may finish and still make its gate
 *   slack         → requiredBy − earliestFinish; negative slack is the red flag
 *
 * Milestones that already happened re-baseline the forward pass, so the plan
 * reflects the case as it actually stands rather than as it was drawn on day 1.
 */

import { addDays, daysBetween, isAfter, isBefore, type IsoDate } from "./dates";
import { DEFAULT_MILESTONES, type Gate, type MilestoneDef, type Track } from "./milestones";

export type MilestoneStatus = "DONE" | "ON_TRACK" | "TIGHT" | "AT_RISK";
export type RiskLevel = "GREEN" | "AMBER" | "RED";

export interface PlannedMilestone {
  id: string;
  label: string;
  track: Track;
  waitingOn: MilestoneDef["waitingOn"];
  dependsOn: string[];
  durationDays: number;
  gate: Gate;
  earliestStart: IsoDate;
  earliestFinish: IsoDate;
  /** Backward-planned deadline. Miss it and the gate slips by the difference. */
  requiredBy: IsoDate;
  slackDays: number;
  status: MilestoneStatus;
  actualFinish?: IsoDate;
}

export interface TimelinePlanInput {
  initiated: IsoDate;
  startDate: IsoDate;
  /** Defaults to the start date: the organization wants to bill from day one. */
  firstBillableTarget?: IsoDate;
  /** Completed milestones, id → actual finish date. */
  actuals?: Record<string, IsoDate>;
  milestones?: readonly MilestoneDef[];
  /** Slack at or below this many days is "tight" rather than comfortable. */
  tightSlackDays?: number;
}

export interface TimelinePlan {
  milestones: PlannedMilestone[];
  projectedStartReadiness: IsoDate;
  projectedFirstBillable: IsoDate;
  /** Positive = days later than the target. Zero or negative = achievable. */
  startDateSlippageDays: number;
  firstBillableSlippageDays: number;
  startDateAchievable: boolean;
  /** Risk to the start date — the §4.1 question. */
  riskLevel: RiskLevel;
  /** Risk to revenue: how far the first billable encounter trails the start date. */
  billingRiskLevel: RiskLevel;
  /** The chain driving the worst gate, in order. */
  criticalPath: string[];
  /** Plain-language reason, for the "at risk" banner and escalation (§4.1). */
  riskSummary: string;
}

interface Graph {
  order: string[];
  byId: Map<string, MilestoneDef>;
  successors: Map<string, string[]>;
}

/** Kahn topological sort; throws on a cycle or a dangling dependency. */
function buildGraph(milestones: readonly MilestoneDef[]): Graph {
  const byId = new Map<string, MilestoneDef>();
  for (const m of milestones) {
    if (byId.has(m.id)) throw new Error(`Duplicate milestone id: ${m.id}`);
    byId.set(m.id, m);
  }

  const successors = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const m of milestones) {
    successors.set(m.id, successors.get(m.id) ?? []);
    indegree.set(m.id, m.dependsOn.length);
    for (const dep of m.dependsOn) {
      if (!byId.has(dep)) {
        throw new Error(`Milestone ${m.id} depends on unknown milestone ${dep}`);
      }
      successors.set(dep, [...(successors.get(dep) ?? []), m.id]);
    }
  }

  const queue = milestones.filter((m) => m.dependsOn.length === 0).map((m) => m.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const next of successors.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  if (order.length !== milestones.length) {
    throw new Error("Milestone graph contains a cycle");
  }
  return { order, byId, successors };
}

/**
 * Terminal milestones declare their gate; interior ones inherit whichever gate
 * their successors feed. A milestone feeding both tracks (file_complete) is
 * attributed to the tighter one, FIRST_BILLABLE, since that is the later gate
 * with the longer tail behind it.
 */
function resolveGates(graph: Graph): Map<string, Gate> {
  const gates = new Map<string, Gate>();
  for (const id of [...graph.order].reverse()) {
    const def = graph.byId.get(id) as MilestoneDef;
    if (def.gate) {
      gates.set(id, def.gate);
      continue;
    }
    const downstream = (graph.successors.get(id) ?? [])
      .map((s) => gates.get(s))
      .filter((g): g is Gate => g !== undefined);
    gates.set(id, downstream.includes("FIRST_BILLABLE") ? "FIRST_BILLABLE" : "START_DATE");
  }
  return gates;
}

export function planTimeline(input: TimelinePlanInput): TimelinePlan {
  const milestones = input.milestones ?? DEFAULT_MILESTONES;
  const actuals = input.actuals ?? {};
  const tight = input.tightSlackDays ?? 14;
  const billableTarget = input.firstBillableTarget ?? input.startDate;
  const graph = buildGraph(milestones);
  const gates = resolveGates(graph);

  // Forward pass — earliest realistic finish, re-baselined on actuals.
  const earliestStart = new Map<string, IsoDate>();
  const earliestFinish = new Map<string, IsoDate>();
  for (const id of graph.order) {
    const def = graph.byId.get(id) as MilestoneDef;
    let start = input.initiated;
    for (const dep of def.dependsOn) {
      const depFinish = earliestFinish.get(dep) as IsoDate;
      if (isAfter(depFinish, start)) start = depFinish;
    }
    earliestStart.set(id, start);
    const actual = actuals[id];
    earliestFinish.set(id, actual ?? addDays(start, def.durationDays));
  }

  // Backward pass — latest finish that still makes the gate.
  const requiredBy = new Map<string, IsoDate>();
  for (const id of [...graph.order].reverse()) {
    const successorIds = graph.successors.get(id) ?? [];
    if (successorIds.length === 0) {
      const gate = gates.get(id) as Gate;
      requiredBy.set(id, gate === "FIRST_BILLABLE" ? billableTarget : input.startDate);
      continue;
    }
    let deadline: IsoDate | null = null;
    for (const sid of successorIds) {
      const sDef = graph.byId.get(sid) as MilestoneDef;
      const candidate = addDays(requiredBy.get(sid) as IsoDate, -sDef.durationDays);
      if (deadline === null || isBefore(candidate, deadline)) deadline = candidate;
    }
    requiredBy.set(id, deadline as IsoDate);
  }

  const planned: PlannedMilestone[] = graph.order.map((id) => {
    const def = graph.byId.get(id) as MilestoneDef;
    const finish = earliestFinish.get(id) as IsoDate;
    const deadline = requiredBy.get(id) as IsoDate;
    const slack = daysBetween(finish, deadline);
    const actual = actuals[id];
    let status: MilestoneStatus;
    if (actual) status = "DONE";
    else if (slack < 0) status = "AT_RISK";
    else if (slack <= tight) status = "TIGHT";
    else status = "ON_TRACK";
    return {
      id,
      label: def.label,
      track: def.track,
      waitingOn: def.waitingOn,
      dependsOn: def.dependsOn,
      durationDays: def.durationDays,
      gate: gates.get(id) as Gate,
      earliestStart: earliestStart.get(id) as IsoDate,
      earliestFinish: finish,
      requiredBy: deadline,
      slackDays: slack,
      status,
      ...(actual ? { actualFinish: actual } : {}),
    };
  });

  const projectedStartReadiness = latestFinishForGate(planned, "START_DATE", input.initiated);
  const projectedFirstBillable = latestFinishForGate(planned, "FIRST_BILLABLE", input.initiated);
  const startDateSlippageDays = daysBetween(input.startDate, projectedStartReadiness);
  const firstBillableSlippageDays = daysBetween(billableTarget, projectedFirstBillable);
  const startDateAchievable = startDateSlippageDays <= 0;

  // Only START_DATE-gated milestones can tighten start-date risk. A payor
  // milestone with negative slack says nothing about whether the clinician can
  // walk in the door, and letting it bleed across is the same conflation the
  // two separate risk levels exist to avoid. Upstream work shared by both tracks
  // still reaches this figure through the start-gated milestones that depend on it.
  const worstSlack = planned.reduce(
    (lo, m) =>
      m.status === "DONE" || m.gate !== "START_DATE" ? lo : Math.min(lo, m.slackDays),
    Number.POSITIVE_INFINITY,
  );
  // Start-date risk and revenue risk are reported separately on purpose. Payor
  // effective dates trail a start date on almost every case, so folding that into
  // one status would paint every case red and the signal would be worthless —
  // while a genuinely unachievable start date is a distinct, escalatable event.
  let riskLevel: RiskLevel;
  if (!startDateAchievable) riskLevel = "RED";
  else if (worstSlack <= tight) riskLevel = "AMBER";
  else riskLevel = "GREEN";

  let billingRiskLevel: RiskLevel;
  if (firstBillableSlippageDays > 30) billingRiskLevel = "RED";
  else if (firstBillableSlippageDays > 0) billingRiskLevel = "AMBER";
  else billingRiskLevel = "GREEN";

  return {
    milestones: planned,
    projectedStartReadiness,
    projectedFirstBillable,
    startDateSlippageDays,
    firstBillableSlippageDays,
    startDateAchievable,
    riskLevel,
    billingRiskLevel,
    criticalPath: criticalPath(planned),
    // Summarize against the worse of the two risks: a case that makes its start
    // date but cannot bill for 78 days is not "on plan".
    riskSummary: summarize(
      worstOf(riskLevel, billingRiskLevel),
      startDateSlippageDays,
      firstBillableSlippageDays,
      planned,
    ),
  };
}

function worstOf(a: RiskLevel, b: RiskLevel): RiskLevel {
  if (a === "RED" || b === "RED") return "RED";
  if (a === "AMBER" || b === "AMBER") return "AMBER";
  return "GREEN";
}

function latestFinishForGate(
  planned: PlannedMilestone[],
  gate: Gate,
  fallback: IsoDate,
): IsoDate {
  return planned
    .filter((m) => m.gate === gate)
    .reduce<IsoDate>((hi, m) => (isAfter(m.earliestFinish, hi) ? m.earliestFinish : hi), fallback);
}

/** Walk back from the tightest terminal milestone through its latest predecessor. */
function criticalPath(planned: PlannedMilestone[]): string[] {
  const byId = new Map(planned.map((m) => [m.id, m]));
  const hasSuccessor = new Set(planned.flatMap((m) => m.dependsOn));
  const terminals = planned.filter((m) => !hasSuccessor.has(m.id));
  if (terminals.length === 0) return [];
  let cursor = terminals.reduce((worst, m) => (m.slackDays < worst.slackDays ? m : worst));
  const path = [cursor.id];
  while (cursor.dependsOn.length > 0) {
    const preds = cursor.dependsOn
      .map((id) => byId.get(id))
      .filter((m): m is PlannedMilestone => m !== undefined);
    if (preds.length === 0) break;
    cursor = preds.reduce((late, m) => (isAfter(m.earliestFinish, late.earliestFinish) ? m : late));
    path.unshift(cursor.id);
  }
  return path;
}

function summarize(
  risk: RiskLevel,
  startSlip: number,
  billableSlip: number,
  planned: PlannedMilestone[],
): string {
  if (risk === "GREEN") {
    return "On plan for both the start date and first billable encounter.";
  }
  const parts: string[] = [];
  if (startSlip > 0) {
    parts.push(`Start date is not achievable — projected ${startSlip} day${startSlip === 1 ? "" : "s"} late.`);
  }
  if (billableSlip > 0) {
    parts.push(
      `First billable encounter projected ${billableSlip} day${billableSlip === 1 ? "" : "s"} after the start date; claims will be held until payor effective dates land.`,
    );
  }
  const worst = planned
    .filter((m) => m.status === "AT_RISK")
    .sort((a, b) => a.slackDays - b.slackDays)[0];
  if (worst) {
    parts.push(`Tightest milestone: ${worst.label} (${worst.slackDays} days slack, waiting on ${worst.waitingOn.toLowerCase().replace("_", " ")}).`);
  } else if (parts.length === 0) {
    parts.push("Little slack remaining; any slip will push a gate.");
  }
  return parts.join(" ");
}

/** Minimum lead time this milestone graph needs, start to finish, per gate. */
export function minimumLeadDays(
  gate: Gate,
  milestones: readonly MilestoneDef[] = DEFAULT_MILESTONES,
): number {
  const anchor = "2000-01-01";
  const plan = planTimeline({ initiated: anchor, startDate: anchor, milestones });
  const projected =
    gate === "START_DATE" ? plan.projectedStartReadiness : plan.projectedFirstBillable;
  return daysBetween(anchor, projected);
}
