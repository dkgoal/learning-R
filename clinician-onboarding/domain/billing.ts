/**
 * Go-live and billing release (§4.7).
 *
 * The requirement this module exists for: "Track a distinct first billable date
 * per payor per TIN per location, derived from each payor's effective date — not
 * from the employment start date."
 *
 * And the one it protects against: "Track retroactive billing windows so claims
 * held during credentialing can be released and submitted within the payor's
 * filing limit. Losing this window is the single largest financial leak in
 * clinician onboarding." A held claim that ages past the filing limit is money
 * that was earned and then thrown away, so the engine reports not just what is
 * releasable but what is about to become unrecoverable.
 */

import { addDays, daysBetween, isBefore, maxDate, type IsoDate } from "./dates";
import type { Id, Payor, PayorEnrollment, PracticeLocation, Organization } from "./types";
import { isEffectiveOn } from "./payors";

export interface HeldClaim {
  id: Id;
  practitionerId: Id;
  payorId: Id;
  payorProductId: Id;
  organizationId: Id;
  locationId: Id;
  serviceDate: IsoDate;
  amount: number;
}

/** One row per payor × TIN × location — the grain §4.7 requires. */
export interface FirstBillableRow {
  enrollmentId: Id;
  payorId: Id;
  payorName: string;
  productName: string;
  organizationName: string;
  tin: string;
  locationName: string;
  /** Earliest date a service may be billed: retro date if granted, else effective. */
  firstBillableDate: IsoDate | null;
  effectiveDate: IsoDate | null;
  retroactiveTo: IsoDate | null;
  billingHold: boolean;
  /** Days between the employment start date and the first billable date. */
  unbillableDaysFromStart: number | null;
  status: PayorEnrollment["status"];
}

export function firstBillableRows(
  enrollments: readonly PayorEnrollment[],
  payors: readonly Payor[],
  products: readonly { id: Id; name: string }[],
  organizations: readonly Organization[],
  locations: readonly PracticeLocation[],
  startDate: IsoDate,
  today: IsoDate,
): FirstBillableRow[] {
  const payorById = new Map(payors.map((p) => [p.id, p]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const orgById = new Map(organizations.map((o) => [o.id, o]));
  const locById = new Map(locations.map((l) => [l.id, l]));

  return enrollments.map((e) => {
    const effective = e.effectiveDate ?? null;
    const retro = e.retroactiveTo ?? null;
    const first = effective || retro ? (minOf(retro, effective) as IsoDate) : null;
    const org = orgById.get(e.organizationId);
    return {
      enrollmentId: e.id,
      payorId: e.payorId,
      payorName: payorById.get(e.payorId)?.name ?? e.payorId,
      productName: productById.get(e.payorProductId)?.name ?? e.payorProductId,
      organizationName: org?.name ?? e.organizationId,
      tin: org?.tin ?? "—",
      locationName: locById.get(e.locationId)?.name ?? e.locationId,
      firstBillableDate: first,
      effectiveDate: effective,
      retroactiveTo: retro,
      billingHold: !isEffectiveOn(e, today),
      unbillableDaysFromStart: first ? Math.max(0, daysBetween(startDate, first)) : null,
      status: e.status,
    };
  });
}

function minOf(a: IsoDate | null, b: IsoDate | null): IsoDate | null {
  if (a && b) return isBefore(a, b) ? a : b;
  return a ?? b ?? null;
}

/**
 * The flag the practice management / RCM system consumes (§4.7). It releases per
 * payor as effective dates are confirmed — a single global "can this doctor bill"
 * boolean is exactly the model that produces either lost revenue or bad claims.
 */
export interface BillingHoldState {
  practitionerId: Id;
  heldEnrollments: FirstBillableRow[];
  releasedEnrollments: FirstBillableRow[];
  /** True while any payor is still pending; RCM holds those claims only. */
  anyHold: boolean;
  releasedPercent: number;
}

export function billingHoldState(
  practitionerId: Id,
  rows: readonly FirstBillableRow[],
): BillingHoldState {
  const held = rows.filter((r) => r.billingHold);
  const released = rows.filter((r) => !r.billingHold);
  return {
    practitionerId,
    heldEnrollments: held,
    releasedEnrollments: released,
    anyHold: held.length > 0,
    releasedPercent: rows.length === 0 ? 0 : Math.round((released.length / rows.length) * 100),
  };
}

export type ClaimDisposition =
  | "RELEASABLE"
  | "RELEASABLE_URGENT"
  | "HELD_NOT_YET_EFFECTIVE"
  | "NOT_COVERED_BY_EFFECTIVE_DATE"
  | "FILING_LIMIT_EXPIRED";

export interface ClaimAssessment {
  claim: HeldClaim;
  disposition: ClaimDisposition;
  /** Payor filing deadline for this service date. */
  filingDeadline: IsoDate;
  daysToFilingDeadline: number;
  reason: string;
}

export interface FilingLimits {
  /** Days from date of service; per payor, falling back to `default`. */
  byPayorId: Record<Id, number>;
  default: number;
}

/**
 * §15.16 — when a retroactive effective date is granted, held claims must be
 * reopened and released *within the filing limit*. `urgentWindowDays` is the
 * point at which a releasable claim becomes a same-week priority.
 */
export function assessHeldClaims(
  claims: readonly HeldClaim[],
  enrollments: readonly PayorEnrollment[],
  limits: FilingLimits,
  today: IsoDate,
  urgentWindowDays = 30,
): ClaimAssessment[] {
  return claims.map((claim) => {
    const limitDays = limits.byPayorId[claim.payorId] ?? limits.default;
    const filingDeadline = addDays(claim.serviceDate, limitDays);
    const daysToFilingDeadline = daysBetween(today, filingDeadline);

    // Match on the practitioner as well as the product/TIN/location grain: two
    // clinicians at the same clinic under the same contract have separate
    // enrollments with separate effective dates, and matching on the grain alone
    // would release one clinician's claims against the other's approval.
    const enrollment = enrollments.find(
      (e) =>
        e.practitionerId === claim.practitionerId &&
        e.payorProductId === claim.payorProductId &&
        e.organizationId === claim.organizationId &&
        e.locationId === claim.locationId,
    );

    if (daysToFilingDeadline < 0) {
      return {
        claim,
        disposition: "FILING_LIMIT_EXPIRED",
        filingDeadline,
        daysToFilingDeadline,
        reason: `Filing limit of ${limitDays} days from service date passed on ${filingDeadline}. This revenue is unrecoverable.`,
      };
    }

    if (!enrollment || !enrollment.effectiveDate || enrollment.status !== "APPROVED") {
      return {
        claim,
        disposition: "HELD_NOT_YET_EFFECTIVE",
        filingDeadline,
        daysToFilingDeadline,
        reason: enrollment
          ? `${enrollment.status} with the payor; no effective date of record yet.`
          : "No enrollment exists for this payor product / TIN / location combination.",
      };
    }

    if (!isEffectiveOn(enrollment, claim.serviceDate)) {
      const effective = enrollment.retroactiveTo ?? enrollment.effectiveDate;
      return {
        claim,
        disposition: "NOT_COVERED_BY_EFFECTIVE_DATE",
        filingDeadline,
        daysToFilingDeadline,
        reason: `Service date precedes the payor effective date of ${effective}. Pursue a retroactive effective date or write off.`,
      };
    }

    return {
      claim,
      disposition: daysToFilingDeadline <= urgentWindowDays ? "RELEASABLE_URGENT" : "RELEASABLE",
      filingDeadline,
      daysToFilingDeadline,
      reason:
        daysToFilingDeadline <= urgentWindowDays
          ? `Release now — only ${daysToFilingDeadline} day${daysToFilingDeadline === 1 ? "" : "s"} left to file.`
          : "Effective date covers this service date; release to the clearinghouse.",
    };
  });
}

export interface RevenueAtRisk {
  totalHeld: number;
  releasableNow: number;
  urgentAmount: number;
  /** Held claims within 30 days of their filing limit — about to become §4.7 losses. */
  imminentLoss: number;
  unrecoverable: number;
  notCovered: number;
  byPayor: { payorId: Id; held: number; releasable: number; unrecoverable: number }[];
  claimCount: number;
}

/** §7.6 / §13: "Revenue at risk from pending enrollments — held claims, by payor". */
export function revenueAtRisk(assessments: readonly ClaimAssessment[]): RevenueAtRisk {
  const sum = (rows: readonly ClaimAssessment[]) =>
    rows.reduce((total, a) => total + a.claim.amount, 0);

  const byPayorId = new Map<Id, ClaimAssessment[]>();
  for (const a of assessments) {
    byPayorId.set(a.claim.payorId, [...(byPayorId.get(a.claim.payorId) ?? []), a]);
  }

  return {
    totalHeld: sum(assessments.filter((a) => a.disposition === "HELD_NOT_YET_EFFECTIVE")),
    releasableNow: sum(
      assessments.filter(
        (a) => a.disposition === "RELEASABLE" || a.disposition === "RELEASABLE_URGENT",
      ),
    ),
    urgentAmount: sum(assessments.filter((a) => a.disposition === "RELEASABLE_URGENT")),
    imminentLoss: sum(
      assessments.filter(
        (a) => a.disposition === "HELD_NOT_YET_EFFECTIVE" && a.daysToFilingDeadline <= 30,
      ),
    ),
    unrecoverable: sum(assessments.filter((a) => a.disposition === "FILING_LIMIT_EXPIRED")),
    notCovered: sum(assessments.filter((a) => a.disposition === "NOT_COVERED_BY_EFFECTIVE_DATE")),
    claimCount: assessments.length,
    byPayor: [...byPayorId.entries()]
      .map(([payorId, rows]) => ({
        payorId,
        held: sum(rows.filter((a) => a.disposition === "HELD_NOT_YET_EFFECTIVE")),
        releasable: sum(
          rows.filter(
            (a) => a.disposition === "RELEASABLE" || a.disposition === "RELEASABLE_URGENT",
          ),
        ),
        unrecoverable: sum(rows.filter((a) => a.disposition === "FILING_LIMIT_EXPIRED")),
      }))
      .sort((a, b) => b.held - a.held),
  };
}

/**
 * §4.7: locum tenens / reciprocal billing as an interim bridge. These
 * arrangements have duration limits and modifier rules, and the duration limit
 * is the part that gets missed.
 */
export interface BridgeArrangement {
  kind: "LOCUM_TENENS" | "RECIPROCAL_BILLING";
  modifier: "Q6" | "Q5";
  regularPhysicianNpi: string;
  substituteNpi: string;
  start: IsoDate;
  /** Continuous-period limit in days; commonly 60 for a continuous period. */
  maxContinuousDays: number;
}

export interface BridgeStatus {
  arrangement: BridgeArrangement;
  daysUsed: number;
  daysRemaining: number;
  expiresOn: IsoDate;
  expired: boolean;
  warning: string | null;
}

export function assessBridge(bridge: BridgeArrangement, today: IsoDate): BridgeStatus {
  const expiresOn = addDays(bridge.start, bridge.maxContinuousDays);
  const daysUsed = daysBetween(bridge.start, today);
  const daysRemaining = daysBetween(today, expiresOn);
  return {
    arrangement: bridge,
    daysUsed,
    daysRemaining,
    expiresOn,
    expired: daysRemaining < 0,
    warning:
      daysRemaining < 0
        ? `Continuous period limit exceeded on ${expiresOn}. Claims billed with modifier ${bridge.modifier} after that date are not supportable.`
        : daysRemaining <= 14
          ? `Bridge arrangement ends ${expiresOn} (${daysRemaining} days). The substitute must be enrolled by then.`
          : null,
  };
}

/** Projected date the clinician can bill every required payor at every location. */
export function fullyBillableDate(rows: readonly FirstBillableRow[]): IsoDate | null {
  const dates = rows.map((r) => r.firstBillableDate).filter((d): d is IsoDate => d !== null);
  if (dates.length !== rows.length || rows.length === 0) return null;
  return maxDate(...dates);
}
