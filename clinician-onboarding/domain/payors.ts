/**
 * Payor enrollment (§7).
 *
 * "This is where most timelines break." Three requirements shape this module:
 *
 *  - The required payor set is **derived** from the clinician's locations, TINs,
 *    specialty and the organization's active contracts — never from a specialist
 *    remembering the list (§7.1).
 *  - Contracting ≠ credentialing (§7.5). A clinician joining an existing
 *    contracted group needs only to be loaded; a new TIN or new market needs the
 *    contract first, and the timeline roughly doubles.
 *  - Medicare Advantage and Medicaid MCO participation are modeled separately
 *    from the parent program: enrolment in the parent is a prerequisite, not a
 *    substitute (§7.2).
 */

import { addDays, daysBetween, isBefore, type IsoDate } from "./dates";
import type {
  Id,
  OnboardingCase,
  Organization,
  Payor,
  PayorContract,
  PayorEnrollment,
  PayorProduct,
  PracticeLocation,
  Practitioner,
  PractitionerType,
} from "./types";

export type EnrollmentBlockerKind =
  | "NO_CONTRACT"
  | "PARENT_PROGRAM_REQUIRED"
  | "APP_TYPE_NOT_CREDENTIALED"
  | "MISSING_NPI"
  | "MISSING_LICENSE_IN_STATE";

export interface EnrollmentBlocker {
  kind: EnrollmentBlockerKind;
  detail: string;
  /** What the org must do about it — surfaced on the case, not buried. */
  remedy: string;
}

export interface RequiredEnrollment {
  key: string;
  payor: Payor;
  product: PayorProduct;
  organization: Organization;
  location: PracticeLocation;
  /** Delegated payors get rostered; the rest get an application per clinician. */
  delegated: boolean;
  submissionChannel: Payor["submissionChannel"];
  typicalTurnaroundDays: number;
  blockers: EnrollmentBlocker[];
  /** Why this enrollment is in the required set — shown in the UI (§7.1). */
  rationale: string;
}

export interface RequiredEnrollmentInput {
  practitioner: Practitioner;
  onboardingCase: OnboardingCase;
  organizations: readonly Organization[];
  locations: readonly PracticeLocation[];
  payors: readonly Payor[];
  products: readonly PayorProduct[];
  contracts: readonly PayorContract[];
  /** States where the clinician holds an active (or pending) license. */
  licensedStates: readonly string[];
  hasNpi: boolean;
}

export function enrollmentKey(
  productId: Id,
  organizationId: Id,
  locationId: Id,
): string {
  return `${productId}::${organizationId}::${locationId}`;
}

export function determineRequiredEnrollments(
  input: RequiredEnrollmentInput,
): RequiredEnrollment[] {
  const { onboardingCase: kase, practitioner } = input;
  const results: RequiredEnrollment[] = [];

  const locations = input.locations.filter((l) => kase.locationIds.includes(l.id));
  const productById = new Map(input.products.map((p) => [p.id, p]));
  const payorById = new Map(input.payors.map((p) => [p.id, p]));

  for (const location of locations) {
    const organization = input.organizations.find((o) => o.id === location.organizationId);
    if (!organization || !kase.organizationIds.includes(organization.id)) continue;

    for (const productId of kase.expectedPayorProductIds) {
      const product = productById.get(productId);
      if (!product) continue;
      // A product is only relevant where it is sold.
      if (!product.states.includes(location.state)) continue;
      const payor = payorById.get(product.payorId);
      if (!payor) continue;

      const contract = input.contracts.find(
        (c) =>
          c.organizationId === organization.id &&
          c.payorId === payor.id &&
          c.productIds.includes(product.id),
      );

      const blockers: EnrollmentBlocker[] = [];

      if (!contract) {
        blockers.push({
          kind: "NO_CONTRACT",
          detail: `${organization.name} (TIN ${organization.tin}) has no active contract with ${payor.name} covering ${product.name}.`,
          remedy:
            "Contracting must complete before this clinician can be credentialed under it — plan for roughly double the usual timeline.",
        });
      }

      const parent = parentProgramFor(payor);
      if (parent) {
        blockers.push({
          kind: "PARENT_PROGRAM_REQUIRED",
          detail: `${payor.name} is a ${labelProgram(payor.program)} plan; ${labelProgram(parent)} enrollment is a prerequisite.`,
          remedy: `Confirm ${labelProgram(parent)} enrollment is approved and effective before submitting.`,
        });
      }

      if (!payor.credentialsAppTypes.includes(practitioner.type)) {
        blockers.push({
          kind: "APP_TYPE_NOT_CREDENTIALED",
          detail: `${payor.name} does not credential ${practitioner.type} providers under ${product.name}.`,
          remedy:
            "Services must be billed under the supervising physician for this payor; confirm incident-to or split/shared documentation requirements.",
        });
      }

      if (!input.hasNpi) {
        blockers.push({
          kind: "MISSING_NPI",
          detail: "No Type 1 NPI on the golden record.",
          remedy: "Obtain an NPI through NPPES before any payor submission.",
        });
      }

      if (!input.licensedStates.includes(location.state)) {
        blockers.push({
          kind: "MISSING_LICENSE_IN_STATE",
          detail: `No ${location.state} license on file, but ${location.name} is in ${location.state}.`,
          remedy: `Obtain ${location.state} licensure; payors will not load a clinician unlicensed in the service state.`,
        });
      }

      results.push({
        key: enrollmentKey(product.id, organization.id, location.id),
        payor,
        product,
        organization,
        location,
        delegated: contract?.delegated ?? false,
        submissionChannel: payor.submissionChannel,
        typicalTurnaroundDays: payor.typicalTurnaroundDays,
        blockers,
        rationale: `${location.name} (${location.state}) bills under ${organization.name} / TIN ${organization.tin}, which ${contract ? "is contracted" : "is NOT contracted"} for ${payor.name} ${product.name}.`,
      });
    }
  }

  return results;
}

function parentProgramFor(payor: Payor): Payor["program"] | null {
  if (payor.program === "MEDICARE_ADVANTAGE") return payor.parentProgram ?? "MEDICARE";
  if (payor.program === "MEDICAID_MCO") return payor.parentProgram ?? "MEDICAID";
  return null;
}

export function labelProgram(program: Payor["program"]): string {
  switch (program) {
    case "COMMERCIAL":
      return "Commercial";
    case "MEDICARE":
      return "Medicare";
    case "MEDICAID":
      return "Medicaid";
    case "MEDICARE_ADVANTAGE":
      return "Medicare Advantage";
    case "MEDICAID_MCO":
      return "Medicaid MCO";
    case "TRICARE":
      return "Tricare";
    case "WORKERS_COMP":
      return "Workers' compensation";
  }
}

/**
 * §7.2 government forms. Which CMS forms a given enrollment needs is mechanical
 * once employment model and TIN relationship are known, and getting it wrong
 * costs a full submission cycle.
 */
export function medicareFormsFor(opts: {
  reassignsBenefits: boolean;
  newTin: boolean;
  wantsEft: boolean;
}): string[] {
  const forms = ["CMS-855I"];
  if (opts.reassignsBenefits) forms.push("CMS-855R");
  if (opts.newTin) forms.push("CMS-855B");
  if (opts.wantsEft) forms.push("CMS-588");
  return forms;
}

/**
 * §7.2: Medicare generally allows an effective date up to 30 days prior to the
 * filing date. That window is exactly why filing early matters — and why the
 * retro-billing calculation in domain/billing.ts starts here.
 */
export function medicareRetroactiveEffective(
  filedOn: IsoDate,
  retroDays = 30,
): IsoDate {
  return addDays(filedOn, -retroDays);
}

// ---------------------------------------------------------------------------
// Tracking & reporting
// ---------------------------------------------------------------------------

export function daysToEffective(enrollment: PayorEnrollment): number | null {
  if (!enrollment.submitted || !enrollment.effectiveDate) return null;
  return daysBetween(enrollment.submitted, enrollment.effectiveDate);
}

export function daysPending(enrollment: PayorEnrollment, today: IsoDate): number | null {
  if (!enrollment.submitted) return null;
  const end = enrollment.effectiveDate ?? today;
  return daysBetween(enrollment.submitted, end);
}

export interface PayorBenchmark {
  payorId: Id;
  payorName: string;
  completed: number;
  pending: number;
  medianDaysToEffective: number | null;
  worstDaysToEffective: number | null;
  /** Pending submissions already past the payor's own typical turnaround. */
  overdueCount: number;
}

/** §7.6 / §13: hold payors accountable and improve start-date planning. */
export function benchmarkPayors(
  enrollments: readonly PayorEnrollment[],
  payors: readonly Payor[],
  today: IsoDate,
): PayorBenchmark[] {
  return payors
    .map((payor) => {
      const mine = enrollments.filter((e) => e.payorId === payor.id);
      const durations = mine
        .map(daysToEffective)
        .filter((d): d is number => d !== null)
        .sort((a, b) => a - b);
      const pending = mine.filter((e) => !e.effectiveDate && e.submitted);
      const overdueCount = pending.filter((e) => {
        const elapsed = daysPending(e, today);
        return elapsed !== null && elapsed > payor.typicalTurnaroundDays;
      }).length;
      return {
        payorId: payor.id,
        payorName: payor.name,
        completed: durations.length,
        pending: pending.length,
        medianDaysToEffective: median(durations),
        worstDaysToEffective: durations.length > 0 ? (durations[durations.length - 1] as number) : null,
        overdueCount,
      };
    })
    .filter((b) => b.completed > 0 || b.pending > 0)
    .sort((a, b) => (b.medianDaysToEffective ?? 0) - (a.medianDaysToEffective ?? 0));
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

/** §7.1: follow-up cadence. Which pending submissions are due a chase today. */
export function enrollmentsNeedingFollowUp(
  enrollments: readonly PayorEnrollment[],
  payors: readonly Payor[],
  today: IsoDate,
  cadenceDays = 14,
): { enrollment: PayorEnrollment; daysSinceContact: number; overdueVsTurnaround: boolean }[] {
  const payorById = new Map(payors.map((p) => [p.id, p]));
  return enrollments
    .filter((e) => e.submitted && !e.effectiveDate && e.status !== "WITHDRAWN" && e.status !== "DENIED")
    .map((e) => {
      const lastContact =
        e.followUps.length > 0
          ? (e.followUps[e.followUps.length - 1] as { date: IsoDate }).date
          : (e.submitted as IsoDate);
      const payor = payorById.get(e.payorId);
      const elapsed = daysPending(e, today) ?? 0;
      return {
        enrollment: e,
        daysSinceContact: daysBetween(lastContact, today),
        overdueVsTurnaround: payor ? elapsed > payor.typicalTurnaroundDays : false,
      };
    })
    .filter((r) => r.daysSinceContact >= cadenceDays || r.overdueVsTurnaround)
    .sort((a, b) => b.daysSinceContact - a.daysSinceContact);
}

// ---------------------------------------------------------------------------
// Delegated credentialing rosters (§7.4)
// ---------------------------------------------------------------------------

export type RosterAction = "ADD" | "TERM" | "CHANGE";

export interface RosterRow {
  action: RosterAction;
  practitionerId: Id;
  lastName: string;
  firstName: string;
  npi: string;
  tin: string;
  locationId: Id;
  productId: Id;
  effectiveDate: IsoDate;
  specialty: string;
  practitionerType: PractitionerType;
}

export interface RosterValidationIssue {
  rowIndex: number;
  field: string;
  message: string;
}

export interface RosterFile {
  payorId: Id;
  generatedFor: IsoDate;
  rows: RosterRow[];
  issues: RosterValidationIssue[];
  /** A roster with issues is not submitted — validation precedes submission (§7.4). */
  submittable: boolean;
}

export function generateRosterFile(
  payorId: Id,
  generatedFor: IsoDate,
  rows: readonly RosterRow[],
): RosterFile {
  const issues: RosterValidationIssue[] = [];
  rows.forEach((row, index) => {
    if (!/^\d{10}$/.test(row.npi)) {
      issues.push({ rowIndex: index, field: "npi", message: "NPI must be 10 digits" });
    }
    if (!/^\d{9}$/.test(row.tin.replace(/-/g, ""))) {
      issues.push({ rowIndex: index, field: "tin", message: "TIN must be 9 digits" });
    }
    if (!row.lastName.trim() || !row.firstName.trim()) {
      issues.push({ rowIndex: index, field: "name", message: "Legal name is required" });
    }
    if (!row.specialty.trim()) {
      issues.push({ rowIndex: index, field: "specialty", message: "Specialty is required" });
    }
  });
  return { payorId, generatedFor, rows: [...rows], issues, submittable: issues.length === 0 };
}

export interface RosterReturnRow {
  npi: string;
  productId: Id;
  accepted: boolean;
  effectiveDate?: IsoDate;
  rejectionReason?: string;
}

export interface RosterReconciliation {
  matched: { row: RosterRow; effectiveDate: IsoDate }[];
  rejected: { row: RosterRow; reason: string }[];
  /** Sent but absent from the payor's acknowledgment — the silent failure mode. */
  missingFromReturn: RosterRow[];
  /** In the payor's return but never sent by us — a roster drift exception. */
  unexpectedInReturn: RosterReturnRow[];
}

/** §7.4: reconcile the payor's return file; §13 "roster reconciliation exceptions". */
export function reconcileRoster(
  sent: RosterFile,
  returned: readonly RosterReturnRow[],
): RosterReconciliation {
  const matched: RosterReconciliation["matched"] = [];
  const rejected: RosterReconciliation["rejected"] = [];
  const missingFromReturn: RosterRow[] = [];
  const seen = new Set<string>();

  for (const row of sent.rows) {
    const key = `${row.npi}::${row.productId}`;
    const ack = returned.find((r) => `${r.npi}::${r.productId}` === key);
    if (!ack) {
      missingFromReturn.push(row);
      continue;
    }
    seen.add(key);
    if (ack.accepted && ack.effectiveDate) {
      matched.push({ row, effectiveDate: ack.effectiveDate });
    } else {
      rejected.push({ row, reason: ack.rejectionReason ?? "Rejected without a stated reason" });
    }
  }

  const unexpectedInReturn = returned.filter((r) => !seen.has(`${r.npi}::${r.productId}`));
  return { matched, rejected, missingFromReturn, unexpectedInReturn };
}

/**
 * §11 terminations "must fan out to payors, facilities, EHR access, DEA address
 * updates, and directory removal". Failing to term with payors is a
 * directory-accuracy exposure, so the fan-out is generated, not remembered.
 */
export interface TerminationFanOut {
  payorTerminations: { enrollmentId: Id; payorId: Id; productId: Id; termDate: IsoDate; channel: Payor["submissionChannel"] }[];
  rosterTermRows: number;
  downstream: string[];
}

export function planTermination(
  enrollments: readonly PayorEnrollment[],
  payors: readonly Payor[],
  termDate: IsoDate,
): TerminationFanOut {
  const payorById = new Map(payors.map((p) => [p.id, p]));
  const active = enrollments.filter(
    (e) => e.status === "APPROVED" || e.status === "SUBMITTED" || e.status === "PAYOR_REVIEW",
  );
  return {
    payorTerminations: active.map((e) => ({
      enrollmentId: e.id,
      payorId: e.payorId,
      productId: e.payorProductId,
      termDate,
      channel: payorById.get(e.payorId)?.submissionChannel ?? "PORTAL",
    })),
    rosterTermRows: active.length,
    downstream: [
      "Withdraw any payor applications still pending (§15.14)",
      "Notify each facility medical staff office and close the appointment",
      "Deprovision EHR, SSO, badge, e-prescribing (IAM deprovisioning)",
      "Update DEA registered address / surrender where required",
      "Remove from provider directory and website listings",
      "Release or reassign open credentialing tasks",
    ],
  };
}

/** §15.10: a name change mid-process must propagate everywhere, not just locally. */
export function planNameChange(
  enrollments: readonly PayorEnrollment[],
  licensedStates: readonly string[],
): string[] {
  const targets = new Set<string>();
  for (const e of enrollments) targets.add(`Payor notification: enrollment ${e.id}`);
  for (const state of licensedStates) targets.add(`State board name change: ${state}`);
  targets.add("NPPES (NPI record)");
  targets.add("CAQH ProView profile + re-attestation");
  targets.add("DEA registration");
  targets.add("Facility medical staff files and directory");
  targets.add("EHR provider record and prescribing credentials");
  return [...targets];
}

/** True when the enrollment can be relied on for billing on `date`. */
export function isEffectiveOn(enrollment: PayorEnrollment, date: IsoDate): boolean {
  const effective = enrollment.retroactiveTo ?? enrollment.effectiveDate;
  if (!effective || enrollment.status !== "APPROVED") return false;
  return !isBefore(date, effective);
}
