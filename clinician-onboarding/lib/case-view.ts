/**
 * Composition layer: assembles one onboarding case from every engine in /domain.
 *
 * The pages stay thin on purpose. Everything that decides *whether a start date
 * holds*, *whether a file may go to committee* or *whether a claim may be
 * released* lives in /domain and is unit-tested there; this module only wires the
 * seed data into those functions and hands the result to React.
 */

import { DEFAULT_TENANT } from "@/domain/config";
import { addDays, daysBetween, maxDate, type IsoDate } from "@/domain/dates";
import { planTimeline, type TimelinePlan } from "@/domain/timeline";
import { LOCUM_MILESTONES } from "@/domain/milestones";
import {
  checkCompleteness,
  measureResponsiveness,
  type CompletenessResult,
  type ResponsivenessMetric,
} from "@/domain/intake";
import {
  evaluatePsv,
  monthlyScreeningStatus,
  planDeltaVerification,
  requiredVerifications,
  summarizePsv,
  type DeltaVerificationPlan,
  type MonthlyScreen,
  type PsvSummary,
} from "@/domain/psv";
import {
  benchmarkPayors,
  determineRequiredEnrollments,
  enrollmentKey,
  enrollmentsNeedingFollowUp,
  type PayorBenchmark,
  type RequiredEnrollment,
} from "@/domain/payors";
import {
  assessBridge,
  assessHeldClaims,
  billingHoldState,
  firstBillableRows,
  fullyBillableDate,
  revenueAtRisk,
  type BillingHoldState,
  type BridgeStatus,
  type ClaimAssessment,
  type FirstBillableRow,
  type RevenueAtRisk,
} from "@/domain/billing";
import {
  evaluatePrivilegeRequest,
  fppeStatus,
  nextApprovalStep,
  temporaryPrivilegeStatus,
  type FppeStatus,
  type PrivilegeRequestEvaluation,
  type TemporaryPrivilegeStatus,
} from "@/domain/privileges";
import { expirablesDashboard, type ExpirablesDashboard } from "@/domain/expirables";
import { DEFAULT_RULES, evaluateRules, type RuleResult } from "@/domain/rules";
import {
  agreementIsValid,
  assessScopeOfPractice,
  checkSupervisionCapacity,
  coSignatureConfig,
  determineBillingModel,
  type BillingModelAssessment,
  type CoSignatureConfig,
  type ScopeAssessment,
  type SupervisionCapacity,
} from "@/domain/advanced-practice";
import { attributeBottlenecks, stageDurations, type BottleneckAttribution, type StageDurations } from "@/domain/kpi";
import { isApp, type CommitteeReview, type Expirable, type OnboardingCase, type PayorEnrollment, type Practitioner, type PractitionerIdentifier, type PrivilegeRequest, type Task, type Verification } from "@/domain/types";

import {
  LOCATIONS,
  ORGANIZATIONS,
  PAYORS,
  PAYOR_CONTRACTS,
  PAYOR_PRODUCTS,
  PRIVILEGES,
  PRIVILEGE_SETS,
  REQUIRED_DOCUMENT_TYPES,
  FACILITIES,
} from "@/data/reference";
import {
  AGREEMENTS,
  BRIDGES,
  CASES,
  CASE_FACTS,
  COMMITTEE_REVIEWS,
  CREDENTIAL_EVIDENCE,
  DOCUMENTS,
  ENROLLMENTS,
  EXPIRABLES,
  FILING_LIMITS,
  FPPES,
  HELD_CLAIMS,
  HOSPITAL_AFFILIATIONS,
  IDENTIFIERS,
  MILESTONE_ACTUALS,
  PEER_REFERENCES,
  PRACTICE_HOURS,
  PRACTITIONERS,
  PRIVILEGE_REQUESTS,
  TASKS,
  TODAY,
  VERIFICATIONS,
} from "@/data/practitioners";

export const CONFIG = DEFAULT_TENANT;
export const today: IsoDate = TODAY;

export interface CaseView {
  onboardingCase: OnboardingCase;
  practitioner: Practitioner;
  identifiers: PractitionerIdentifier[];
  facilityNames: string[];
  locationNames: string[];
  plan: TimelinePlan;
  completeness: CompletenessResult;
  psv: PsvSummary;
  /** The date the PSV set is being judged current against (§4.3). */
  psvDecisionDate: IsoDate;
  delta: DeltaVerificationPlan | null;
  monthlyScreens: MonthlyScreen[];
  requiredEnrollments: RequiredEnrollment[];
  enrollments: PayorEnrollment[];
  billingRows: FirstBillableRow[];
  billingHold: BillingHoldState;
  fullyBillableOn: IsoDate | null;
  claims: ClaimAssessment[];
  revenue: RevenueAtRisk;
  bridge: BridgeStatus | null;
  privilege: PrivilegeRequestEvaluation | null;
  privilegeRequest: PrivilegeRequest | null;
  privilegeSetName: string | null;
  reviews: CommitteeReview[];
  nextApproval: CommitteeReview["body"] | null;
  temporary: TemporaryPrivilegeStatus | null;
  fppe: FppeStatus[];
  expirables: ExpirablesDashboard;
  tasks: Task[];
  responsiveness: ResponsivenessMetric;
  gates: RuleResult[];
  app: AppView | null;
  durations: StageDurations;
  bottlenecks: BottleneckAttribution[];
  verifications: Verification[];
}

export interface AppView {
  scope: ScopeAssessment[];
  supervision: SupervisionCapacity | null;
  agreementProblems: string[];
  coSignature: CoSignatureConfig;
  billingModels: { payorName: string; assessment: BillingModelAssessment }[];
}

function practitionerFor(id: string): Practitioner {
  const found = PRACTITIONERS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown practitioner ${id}`);
  return found;
}

function identifiersFor(practitionerId: string): PractitionerIdentifier[] {
  return IDENTIFIERS.filter((i) => i.practitionerId === practitionerId);
}

function verificationsFor(practitionerId: string): Verification[] {
  return VERIFICATIONS.filter((v) => v.practitionerId === practitionerId);
}

function expirablesFor(practitionerId: string): Expirable[] {
  return EXPIRABLES.filter((e) => e.practitionerId === practitionerId);
}

export function buildCaseView(caseId: string): CaseView | null {
  const kase = CASES.find((c) => c.id === caseId);
  if (!kase) return null;

  const practitioner = practitionerFor(kase.practitionerId);
  const identifiers = identifiersFor(practitioner.id);
  const verifications = verificationsFor(practitioner.id);
  const tasks = TASKS.filter((t) => t.caseId === kase.id);

  // Locums run a different, shorter graph (§15.5); planning them against the
  // full appointment track reports a start date that is months late for someone
  // already on service.
  const plan = planTimeline({
    initiated: kase.initiated,
    startDate: kase.startDate,
    actuals: MILESTONE_ACTUALS[kase.id] ?? {},
    ...(kase.employmentType === "LOCUM_TENENS" ? { milestones: LOCUM_MILESTONES } : {}),
  });

  const licensedStates = identifiers
    .filter((i) => i.kind === "STATE_LICENSE" && (i.status === "ACTIVE" || i.status === "PENDING"))
    .map((i) => i.state)
    .filter((s): s is string => Boolean(s));
  const activeLicenseStates = identifiers
    .filter((i) => i.kind === "STATE_LICENSE" && i.status === "ACTIVE")
    .map((i) => i.state)
    .filter((s): s is string => Boolean(s));
  const hasNpi = identifiers.some((i) => i.kind === "NPI_TYPE_1");

  const completeness = checkCompleteness({
    practitioner,
    onboardingCase: kase,
    hasNpi,
    hasActiveOrPendingLicense: licensedStates.length > 0,
    documentTypesOnFile: DOCUMENTS.filter((d) => d.practitionerId === practitioner.id).map((d) => d.type),
    requiredDocumentTypes: REQUIRED_DOCUMENT_TYPES,
    today,
  });

  const required = requiredVerifications(CONFIG, {
    practitioner,
    identifiers,
    hospitalAffiliations: HOSPITAL_AFFILIATIONS[practitioner.id] ?? [],
    priorEmployers: kase.workHistory.map((w) => w.employer),
    peerReferenceNames: PEER_REFERENCES[practitioner.id] ?? [],
    isImg: identifiers.some((i) => i.kind === "ECFMG"),
  });

  // Judge the file against the projected committee date, not against today —
  // that is what forces re-verification when a decision slips (§4.3).
  const committeeMilestone = plan.milestones.find((m) => m.id === "credentials_committee");
  const psvDecisionDate =
    maxDate(today, committeeMilestone?.earliestFinish ?? today) ?? today;
  const psvItems = evaluatePsv(CONFIG, required, verifications, psvDecisionDate);
  const psv = summarizePsv(CONFIG, psvItems);

  const delta = practitioner.priorFileId
    ? planDeltaVerification(CONFIG, required, verifications, psvDecisionDate)
    : null;

  const requiredEnrollments = determineRequiredEnrollments({
    practitioner,
    onboardingCase: kase,
    organizations: ORGANIZATIONS,
    locations: LOCATIONS,
    payors: PAYORS,
    products: PAYOR_PRODUCTS,
    contracts: PAYOR_CONTRACTS,
    licensedStates,
    hasNpi,
  });

  const enrollments = ENROLLMENTS.filter((e) => e.caseId === kase.id);
  const billingRows = firstBillableRows(
    enrollments,
    PAYORS,
    PAYOR_PRODUCTS,
    ORGANIZATIONS,
    LOCATIONS,
    kase.startDate,
    today,
  );
  const claims = assessHeldClaims(
    HELD_CLAIMS.filter((c) => c.practitionerId === practitioner.id),
    enrollments,
    FILING_LIMITS,
    today,
  );

  const privilegeRequest = PRIVILEGE_REQUESTS.find((p) => p.caseId === kase.id) ?? null;
  const evidence = privilegeRequest ? CREDENTIAL_EVIDENCE[privilegeRequest.id] : undefined;
  const privilege =
    privilegeRequest && evidence
      ? evaluatePrivilegeRequest(CONFIG, privilegeRequest, PRIVILEGES, evidence, today)
      : null;
  const reviews = privilegeRequest
    ? COMMITTEE_REVIEWS.filter((r) => r.privilegeRequestId === privilegeRequest.id)
    : [];

  const app = isApp(practitioner.type)
    ? buildAppView(practitioner, kase, identifiers, activeLicenseStates)
    : null;

  const facts = CASE_FACTS[kase.id] ?? {};

  return {
    onboardingCase: kase,
    practitioner,
    identifiers,
    facilityNames: kase.facilityIds.map((id) => FACILITIES.find((f) => f.id === id)?.name ?? id),
    locationNames: kase.locationIds.map((id) => LOCATIONS.find((l) => l.id === id)?.name ?? id),
    plan,
    completeness,
    psv,
    psvDecisionDate,
    delta,
    monthlyScreens: monthlyScreeningStatus(today, verifications),
    requiredEnrollments,
    enrollments,
    billingRows,
    billingHold: billingHoldState(practitioner.id, billingRows),
    fullyBillableOn: fullyBillableDate(billingRows),
    claims,
    revenue: revenueAtRisk(claims),
    bridge: BRIDGES[kase.id] ? assessBridge(BRIDGES[kase.id] as never, today) : null,
    privilege,
    privilegeRequest,
    privilegeSetName: privilegeRequest
      ? (PRIVILEGE_SETS.find((s) => s.id === privilegeRequest.privilegeSetId)?.name ?? null)
      : null,
    reviews,
    nextApproval: reviews.length > 0 ? nextApprovalStep(reviews) : null,
    temporary: privilegeRequest?.temporary ? temporaryPrivilegeStatus(privilegeRequest, today) : null,
    fppe: FPPES.filter((f) => f.practitionerId === practitioner.id).map((f) => fppeStatus(f, today)),
    expirables: expirablesDashboard(CONFIG, today, expirablesFor(practitioner.id)),
    tasks,
    responsiveness: measureResponsiveness(tasks, today, !plan.startDateAchievable),
    gates: evaluateRules(DEFAULT_RULES, facts),
    app,
    durations: stageDurations(kase, enrollments),
    bottlenecks: attributeBottlenecks(kase, tasks, enrollments, today),
    verifications,
  };
}

function buildAppView(
  practitioner: Practitioner,
  kase: OnboardingCase,
  identifiers: PractitionerIdentifier[],
  activeLicenseStates: string[],
): AppView {
  const agreement = AGREEMENTS.find((a) => a.practitionerId === practitioner.id);
  const states = [...new Set(kase.locationIds.map((id) => LOCATIONS.find((l) => l.id === id)?.state).filter((s): s is string => Boolean(s)))];

  const scope = states.map((state) => {
    const dea = identifiers.find((i) => i.kind === "DEA" && i.state === state);
    return assessScopeOfPractice(
      CONFIG,
      practitioner,
      state,
      agreement && agreement.state === state ? agreement : undefined,
      dea?.schedules ?? [],
      PRACTICE_HOURS[practitioner.id] ?? 0,
    );
  });

  const supervision =
    agreement && agreement.supervisingPhysicianIds.length > 0
      ? checkSupervisionCapacity(
          CONFIG,
          agreement.supervisingPhysicianIds[0] as string,
          agreement.state,
          AGREEMENTS,
          practitioner.id,
        )
      : null;

  const billingModels = PAYORS.filter((p) =>
    kase.expectedPayorProductIds.some(
      (pid) => PAYOR_PRODUCTS.find((prod) => prod.id === pid)?.payorId === p.id,
    ),
  ).map((payor) => ({
    payorName: payor.name,
    assessment: determineBillingModel(practitioner, payor, "OFFICE", true),
  }));

  return {
    scope,
    supervision,
    agreementProblems: agreementIsValid(agreement, agreement?.state, today).problems,
    coSignature: coSignatureConfig(
      scope[0] ??
        assessScopeOfPractice(CONFIG, practitioner, activeLicenseStates[0] ?? "CA", agreement),
      agreement,
    ),
    billingModels,
  };
}

// ---------------------------------------------------------------------------
// Portfolio-level views
// ---------------------------------------------------------------------------

export interface CaseSummary {
  id: string;
  name: string;
  credential: string;
  specialty: string;
  stage: OnboardingCase["stage"];
  startDate: IsoDate;
  daysToStart: number;
  riskLevel: TimelinePlan["riskLevel"];
  startSlippage: number;
  firstBillableSlippage: number;
  psvPercent: number;
  enrollmentsEffective: number;
  enrollmentsTotal: number;
  openTasks: number;
  overdueTasks: number;
  blockers: number;
  riskSummary: string;
}

export function caseSummaries(): CaseSummary[] {
  return CASES.map((kase) => {
    const view = buildCaseView(kase.id);
    if (!view) throw new Error(`Case ${kase.id} failed to build`);
    const openTasks = view.tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
    return {
      id: kase.id,
      name: `${view.practitioner.legalFirstName} ${view.practitioner.legalLastName}`,
      credential: view.practitioner.type,
      specialty: view.practitioner.primarySpecialty,
      stage: kase.stage,
      startDate: kase.startDate,
      daysToStart: daysBetween(today, kase.startDate),
      riskLevel: view.plan.riskLevel,
      startSlippage: view.plan.startDateSlippageDays,
      firstBillableSlippage: view.plan.firstBillableSlippageDays,
      psvPercent: view.psv.completenessPercent,
      enrollmentsEffective: view.enrollments.filter((e) => e.effectiveDate).length,
      enrollmentsTotal: view.enrollments.length,
      openTasks: openTasks.length,
      overdueTasks: openTasks.filter((t) => daysBetween(t.due, today) > 0).length,
      blockers:
        view.requiredEnrollments.reduce((n, r) => n + r.blockers.length, 0) +
        (view.privilege?.blockers.length ?? 0) +
        view.completeness.deficiencies.filter((d) => d.severity === "BLOCKING").length,
      riskSummary: view.plan.riskSummary,
    };
  }).sort((a, b) => a.daysToStart - b.daysToStart);
}

export function allViews(): CaseView[] {
  return CASES.map((c) => buildCaseView(c.id)).filter((v): v is CaseView => v !== null);
}

export function portfolioExpirables(): ExpirablesDashboard {
  return expirablesDashboard(CONFIG, today, EXPIRABLES);
}

export function portfolioBenchmarks(): PayorBenchmark[] {
  return benchmarkPayors(ENROLLMENTS, PAYORS, today);
}

export function portfolioFollowUps() {
  return enrollmentsNeedingFollowUp(ENROLLMENTS, PAYORS, today);
}

export function portfolioRevenue(): RevenueAtRisk {
  const assessments = assessHeldClaims(HELD_CLAIMS, ENROLLMENTS, FILING_LIMITS, today);
  return revenueAtRisk(assessments);
}

export function portfolioClaims(): ClaimAssessment[] {
  return assessHeldClaims(HELD_CLAIMS, ENROLLMENTS, FILING_LIMITS, today);
}

/** All required enrollments across cases, for the payor matrix screen. */
export function allRequiredEnrollments(): { caseId: string; name: string; required: RequiredEnrollment[] }[] {
  return allViews().map((v) => ({
    caseId: v.onboardingCase.id,
    name: `${v.practitioner.legalFirstName} ${v.practitioner.legalLastName}`,
    required: v.requiredEnrollments,
  }));
}

/** Enrollment rows joined to their derived requirement, for the tracker table. */
export function enrollmentTracker() {
  return allViews().flatMap((view) =>
    view.enrollments.map((e) => {
      const product = PAYOR_PRODUCTS.find((p) => p.id === e.payorProductId);
      const payor = PAYORS.find((p) => p.id === e.payorId);
      const requirement = view.requiredEnrollments.find(
        (r) => r.key === enrollmentKey(e.payorProductId, e.organizationId, e.locationId),
      );
      return {
        caseId: view.onboardingCase.id,
        clinician: `${view.practitioner.legalFirstName} ${view.practitioner.legalLastName}`,
        payorName: payor?.name ?? e.payorId,
        productName: product?.name ?? e.payorProductId,
        organizationName: ORGANIZATIONS.find((o) => o.id === e.organizationId)?.name ?? e.organizationId,
        locationName: LOCATIONS.find((l) => l.id === e.locationId)?.name ?? e.locationId,
        enrollment: e,
        daysPending: e.submitted ? daysBetween(e.submitted, e.effectiveDate ?? today) : null,
        typicalTurnaround: payor?.typicalTurnaroundDays ?? null,
        blockers: requirement?.blockers ?? [],
        delegated: requirement?.delegated ?? false,
      };
    }),
  );
}

export function upcomingScreeningDate(): IsoDate {
  return addDays(today, 30);
}
