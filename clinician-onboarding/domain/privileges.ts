/**
 * Medical staff privileging (§8).
 *
 * The central requirement is §8.2: "System validates the clinician's requested
 * privileges against their verified credentials and case volume data, and flags
 * requests unsupported by evidence — this is the most common survey finding."
 *
 * So every privilege carries machine-checkable criteria and every request is
 * evaluated against *verified* evidence, not against what the clinician wrote on
 * the form. An unsupported request is never silently granted; it surfaces as a
 * finding on the committee packet with the specific criterion that failed.
 */

import { addDays, addMonths, daysBetween, isBefore, type IsoDate } from "./dates";
import type { TenantConfig } from "./config";
import type {
  CommitteeReview,
  Fppe,
  Id,
  Privilege,
  PrivilegeCriterion,
  PrivilegeRequest,
  PrivilegeRequestItem,
} from "./types";

/** Verified evidence available to the criteria engine. */
export interface CredentialEvidence {
  boardCertified: boolean;
  /** Board-eligible clinicians have a window to certify (§8.1, §15.1). */
  residencyCompleted?: IsoDate;
  trainingCompleted: string[];
  activeLicenseStates: string[];
  deaActiveStates: string[];
  lifeSupportHeld: string[];
  /** Verified case volume from prior institutions' case logs (§8.2). */
  volumes: Record<Id, { cases: number; lastPerformed?: IsoDate }>;
  facilityState: string;
}

export interface CriterionResult {
  criterion: PrivilegeCriterion;
  met: boolean;
  evidence: string;
}

export type PrivilegeEvaluation = {
  privilege: Privilege;
  item: PrivilegeRequestItem;
  results: CriterionResult[];
  supported: boolean;
  /** Self-reported volume exceeds evidenced volume — adjudicate, never assume. */
  volumeDiscrepancy: boolean;
  recommendation: "GRANT" | "GRANT_WITH_PROCTORING" | "INSUFFICIENT_EVIDENCE";
  findings: string[];
};

export function evaluateCriterion(
  criterion: PrivilegeCriterion,
  privilege: Privilege,
  evidence: CredentialEvidence,
  today: IsoDate,
  config: TenantConfig,
): CriterionResult {
  switch (criterion.kind) {
    case "BOARD_CERTIFIED":
      return {
        criterion,
        met: evidence.boardCertified,
        evidence: evidence.boardCertified
          ? "Board certification verified with the certifying board."
          : "No verified board certification on file.",
      };

    case "BOARD_ELIGIBLE_WINDOW": {
      if (evidence.boardCertified) {
        return { criterion, met: true, evidence: "Already board certified." };
      }
      if (!evidence.residencyCompleted) {
        return { criterion, met: false, evidence: "No verified residency completion date to run the eligibility window from." };
      }
      const months = criterion.value ?? 60;
      const deadline = addMonths(evidence.residencyCompleted, months);
      const met = !isBefore(deadline, today);
      return {
        criterion,
        met,
        evidence: met
          ? `Board eligible; must certify by ${deadline} (${months}-month window from residency completion).`
          : `Board eligibility window closed ${deadline}.`,
      };
    }

    case "TRAINING_COMPLETED": {
      const needed = criterion.detail ?? "";
      const met = evidence.trainingCompleted.some(
        (t) => t.toLowerCase() === needed.toLowerCase(),
      );
      return {
        criterion,
        met,
        evidence: met
          ? `Verified training: ${needed}.`
          : `No verified training in ${needed || "the required program"}.`,
      };
    }

    case "MIN_VOLUME": {
      const required = criterion.value ?? 0;
      const actual = evidence.volumes[privilege.id]?.cases ?? 0;
      return {
        criterion,
        met: actual >= required,
        evidence: `${actual} evidenced case${actual === 1 ? "" : "s"} against a minimum of ${required}.`,
      };
    }

    case "CURRENT_ACTIVITY": {
      const months = criterion.value ?? 24;
      const last = evidence.volumes[privilege.id]?.lastPerformed;
      if (!last) {
        return { criterion, met: false, evidence: "No documented activity for this privilege." };
      }
      const cutoff = addMonths(today, -months);
      const met = !isBefore(last, cutoff);
      return {
        criterion,
        met,
        evidence: met
          ? `Last performed ${last}, within the ${months}-month currency window.`
          : `Last performed ${last}, outside the ${months}-month currency window.`,
      };
    }

    case "LICENSE_ACTIVE": {
      const met = evidence.activeLicenseStates.includes(evidence.facilityState);
      return {
        criterion,
        met,
        evidence: met
          ? `Active ${evidence.facilityState} license verified.`
          : `No active ${evidence.facilityState} license — the facility's state.`,
      };
    }

    case "DEA_ACTIVE": {
      const met = evidence.deaActiveStates.includes(evidence.facilityState);
      return {
        criterion,
        met,
        evidence: met
          ? `DEA registration verified for ${evidence.facilityState}.`
          : `No verified DEA registration for ${evidence.facilityState}.`,
      };
    }

    case "LIFE_SUPPORT": {
      const needed = criterion.detail ?? "";
      const met = evidence.lifeSupportHeld.includes(needed);
      return {
        criterion,
        met,
        evidence: met ? `${needed} current.` : `${needed} not on file or expired.`,
      };
    }

    default: {
      // Unknown criterion kinds fail closed: an unrecognized rule must never
      // read as satisfied, since the file would then claim evidence it lacks.
      const exhaustive: never = criterion.kind;
      return {
        criterion,
        met: false,
        evidence: `Unrecognized criterion (${String(exhaustive)}); manual review required. Accreditor: ${config.accreditor}.`,
      };
    }
  }
}

export function evaluatePrivilegeItem(
  config: TenantConfig,
  privilege: Privilege,
  item: PrivilegeRequestItem,
  evidence: CredentialEvidence,
  today: IsoDate,
): PrivilegeEvaluation {
  const results = privilege.criteria.map((c) =>
    evaluateCriterion(c, privilege, evidence, today, config),
  );
  const supported = results.every((r) => r.met);
  const claimed = item.claimedVolume ?? 0;
  const evidenced = item.evidencedVolume ?? evidence.volumes[privilege.id]?.cases ?? 0;
  const volumeDiscrepancy = claimed > evidenced;

  const findings: string[] = results.filter((r) => !r.met).map((r) => `${r.criterion.label}: ${r.evidence}`);
  if (volumeDiscrepancy) {
    findings.push(
      `Self-reported ${claimed} cases but only ${evidenced} are evidenced by verified case logs — adjudicate before the committee packet is assembled.`,
    );
  }

  let recommendation: PrivilegeEvaluation["recommendation"];
  if (!supported) recommendation = "INSUFFICIENT_EVIDENCE";
  else if (item.proctorRequired || privilege.kind === "SPECIAL") recommendation = "GRANT_WITH_PROCTORING";
  else recommendation = "GRANT";

  return { privilege, item, results, supported, volumeDiscrepancy, recommendation, findings };
}

export interface PrivilegeRequestEvaluation {
  request: PrivilegeRequest;
  evaluations: PrivilegeEvaluation[];
  supportedCount: number;
  unsupportedCount: number;
  /** Blocking issues that must clear before the request may go to committee. */
  blockers: string[];
  packetReady: boolean;
}

export function evaluatePrivilegeRequest(
  config: TenantConfig,
  request: PrivilegeRequest,
  privileges: readonly Privilege[],
  evidence: CredentialEvidence,
  today: IsoDate,
): PrivilegeRequestEvaluation {
  const byId = new Map(privileges.map((p) => [p.id, p]));
  const evaluations = request.items
    .map((item) => {
      const privilege = byId.get(item.privilegeId);
      if (!privilege) return null;
      return evaluatePrivilegeItem(config, privilege, item, evidence, today);
    })
    .filter((e): e is PrivilegeEvaluation => e !== null);

  const blockers: string[] = [];
  for (const e of evaluations.filter((e) => !e.supported)) {
    blockers.push(`${e.privilege.name}: ${e.findings[0] ?? "criteria not met"}`);
  }

  if (request.temporary) {
    const status = temporaryPrivilegeStatus(request, today);
    if (status.expired) {
      blockers.push(
        `Temporary privileges expired ${request.temporary.expires}; they may not be extended past the bylaws limit.`,
      );
    }
  }

  if (request.proxy) {
    blockers.push(...proxyDeficiencies(request));
  }

  return {
    request,
    evaluations,
    supportedCount: evaluations.filter((e) => e.supported).length,
    unsupportedCount: evaluations.filter((e) => !e.supported).length,
    blockers,
    packetReady: blockers.length === 0 && evaluations.length > 0,
  };
}

/** §8.3: telemedicine privileging by proxy has specific documentary conditions. */
export function proxyDeficiencies(request: PrivilegeRequest): string[] {
  if (!request.proxy) return [];
  const gaps: string[] = [];
  if (!request.proxy.agreementOnFile) {
    gaps.push("Privileging-by-proxy requires a written agreement with the distant site; none on file.");
  }
  if (!request.proxy.distantSiteAccredited) {
    gaps.push(`Distant site ${request.proxy.distantSiteFacility} is not confirmed accredited — proxy credentialing is unavailable.`);
  }
  if (!request.proxy.performanceDataReceived) {
    gaps.push("Performance information for this individual practitioner has not been received from the distant site.");
  }
  return gaps;
}

export interface TemporaryPrivilegeStatus {
  granted: IsoDate;
  expires: IsoDate;
  daysRemaining: number;
  expired: boolean;
  reason: string;
}

export function temporaryPrivilegeStatus(
  request: PrivilegeRequest,
  today: IsoDate,
): TemporaryPrivilegeStatus {
  if (!request.temporary) {
    throw new Error(`Privilege request ${request.id} has no temporary grant`);
  }
  const { granted, expires, reason } = request.temporary;
  const daysRemaining = daysBetween(today, expires);
  return {
    granted,
    expires,
    daysRemaining,
    expired: daysRemaining < 0,
    reason:
      reason === "PENDING_APPLICATION"
        ? "Pending application, important patient care need"
        : reason === "URGENT_NEED"
          ? "Fulfilling an urgent patient care need"
          : "Emergency / disaster privileges under the emergency management plan",
  };
}

// ---------------------------------------------------------------------------
// Committee review (§8.3)
// ---------------------------------------------------------------------------

export interface VoteValidation {
  valid: boolean;
  quorumMet: boolean;
  problems: string[];
}

/**
 * A vote recorded without quorum, or with a conflicted member voting, is not a
 * decision — and discovering that during a survey is far worse than blocking it
 * at entry.
 */
export function validateVote(review: CommitteeReview): VoteValidation {
  const problems: string[] = [];
  const present = review.membersPresent ?? 0;
  const quorum = review.quorumRequired ?? 0;
  const quorumMet = present >= quorum && quorum > 0;

  if (!quorumMet) {
    problems.push(`Quorum not met: ${present} present against a requirement of ${quorum}.`);
  }
  const votes = (review.votesFor ?? 0) + (review.votesAgainst ?? 0);
  const eligible = present - (review.recusals?.length ?? 0);
  if (votes > eligible) {
    problems.push(
      `${votes} votes cast but only ${eligible} members were eligible after ${review.recusals?.length ?? 0} recusal(s).`,
    );
  }
  if (review.outcome === undefined) {
    problems.push("No outcome recorded.");
  }
  if (review.outcome === "DEFERRED" && !review.deferralReason) {
    problems.push("Deferrals must record a reason (§13 deferral rate and reasons).");
  }
  if (review.decided === undefined) {
    problems.push("No decision date recorded.");
  }
  return { valid: problems.length === 0, quorumMet, problems };
}

/** The configured approval chain; steps run in order unless a facility parallelizes. */
export const DEFAULT_APPROVAL_CHAIN: CommitteeReview["body"][] = [
  "DEPARTMENT_CHAIR",
  "CREDENTIALS_COMMITTEE",
  "MEC",
  "BOARD",
];

export function nextApprovalStep(
  reviews: readonly CommitteeReview[],
  chain: readonly CommitteeReview["body"][] = DEFAULT_APPROVAL_CHAIN,
): CommitteeReview["body"] | null {
  for (const body of chain) {
    const review = reviews.find((r) => r.body === body);
    const approved =
      review?.outcome === "APPROVED" || review?.outcome === "APPROVED_WITH_CONDITIONS";
    if (!approved) return body;
  }
  return null;
}

// ---------------------------------------------------------------------------
// FPPE / OPPE (§8.4)
// ---------------------------------------------------------------------------

export interface FppeDefaults {
  method: Fppe["method"];
  volumeThreshold: number;
  durationDays: number;
}

/**
 * §8.4: FPPE is "automatically triggered for every newly granted privilege".
 * Generating these from the decision rather than from a specialist's memory is
 * the difference between an FPPE program and an FPPE policy.
 */
export function fppeForGrantedPrivileges(
  request: PrivilegeRequest,
  grantedOn: IsoDate,
  defaults: FppeDefaults,
  trigger: Fppe["trigger"] = "NEW_PRIVILEGE",
): Fppe[] {
  return request.items
    .filter((i) => i.decision === "GRANTED" || i.decision === "GRANTED_WITH_CONDITIONS")
    .map((item) => ({
      id: `${request.id}-fppe-${item.privilegeId}`,
      practitionerId: request.practitionerId,
      facilityId: request.facilityId,
      privilegeId: item.privilegeId,
      method: item.proctorRequired ? "PROCTORING" : defaults.method,
      trigger,
      volumeThreshold: defaults.volumeThreshold,
      completedVolume: 0,
      due: addDays(grantedOn, defaults.durationDays),
    }));
}

export interface FppeStatus {
  fppe: Fppe;
  complete: boolean;
  overdue: boolean;
  daysRemaining: number;
  progressPercent: number;
  /** §8.4: block the transition to routine status until FPPE is documented. */
  blocksRoutineStatus: boolean;
}

export function fppeStatus(fppe: Fppe, today: IsoDate): FppeStatus {
  const complete = Boolean(fppe.completed) && fppe.completedVolume >= fppe.volumeThreshold;
  const daysRemaining = daysBetween(today, fppe.due);
  return {
    fppe,
    complete,
    overdue: !complete && daysRemaining < 0,
    daysRemaining,
    progressPercent:
      fppe.volumeThreshold === 0
        ? 0
        : Math.min(100, Math.round((fppe.completedVolume / fppe.volumeThreshold) * 100)),
    blocksRoutineStatus: !complete || fppe.outcome === "UNSATISFACTORY",
  };
}

/** §8.4: OPPE runs more frequently than annually — commonly every 6 months. */
export function oppeDueDates(
  appointmentStart: IsoDate,
  termMonths: number,
  intervalMonths = 6,
): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let m = intervalMonths; m <= termMonths; m += intervalMonths) {
    dates.push(addMonths(appointmentStart, m));
  }
  return dates;
}
