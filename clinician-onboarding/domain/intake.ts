/**
 * Application intake (§4.2).
 *
 * One combined application satisfies medical staff, payor and HR data needs, so
 * the completeness check here is the single gate in front of all three tracks.
 * Two rules carry most of the weight:
 *
 *  - **Gaps.** Any break in work history longer than 30 days needs a written
 *    explanation — a payor and accreditor requirement, and the deficiency that
 *    most often bounces a file back weeks later.
 *  - **Affirmative disclosures.** An affirmative answer without an explanation is
 *    an incomplete application, not an application with a footnote.
 *
 * The return-to-applicant loop gets a *specific* deficiency list. "Your
 * application is incomplete" is how you lose the 90-minutes-of-clinician-time
 * target in §14.
 */

import { addDays, daysBetween, isAfter, type IsoDate } from "./dates";
import type {
  DisclosureAnswer,
  ESignature,
  OnboardingCase,
  Practitioner,
  WorkHistoryEntry,
} from "./types";

export interface WorkHistoryGap {
  afterEmployer: string;
  beforeEmployer: string;
  from: IsoDate;
  to: IsoDate;
  days: number;
  explained: boolean;
  explanation?: string;
}

/**
 * Detects gaps between consecutive positions. Overlapping roles (a common,
 * legitimate pattern — moonlighting during fellowship) are not gaps, so the scan
 * carries the furthest end date seen rather than comparing adjacent pairs.
 */
export function detectWorkHistoryGaps(
  history: readonly WorkHistoryEntry[],
  today: IsoDate,
  thresholdDays = 30,
  /** Explains the break between the most recent position and today, if any. */
  trailingExplanation?: string,
): WorkHistoryGap[] {
  const sorted = [...history].sort((a, b) => (a.from < b.from ? -1 : 1));
  const gaps: WorkHistoryGap[] = [];
  let coveredThrough: IsoDate | null = null;
  let coveredBy = "";

  for (const entry of sorted) {
    if (coveredThrough && daysBetween(coveredThrough, entry.from) > thresholdDays) {
      const days = daysBetween(coveredThrough, entry.from);
      gaps.push({
        afterEmployer: coveredBy,
        beforeEmployer: entry.employer,
        from: coveredThrough,
        to: entry.from,
        days,
        explained: Boolean(entry.gapExplanation?.trim()),
        ...(entry.gapExplanation ? { explanation: entry.gapExplanation } : {}),
      });
    }
    const end = entry.to ?? today;
    if (!coveredThrough || isAfter(end, coveredThrough)) {
      coveredThrough = end;
      coveredBy = entry.employer;
    }
  }

  // A gap between the last position and today counts too — §5 requires a
  // complete chronological history, and "currently between roles" is a fact the
  // committee is entitled to see explained.
  //
  // An entry's own `gapExplanation` covers the break *before* it, so it cannot
  // speak for a trailing gap — a new graduate between residency and a start date
  // has no later entry to carry the explanation. That case gets its own field on
  // the application rather than being permanently unexplainable.
  if (coveredThrough && daysBetween(coveredThrough, today) > thresholdDays) {
    const explanation = trailingExplanation?.trim();
    gaps.push({
      afterEmployer: coveredBy,
      beforeEmployer: "(present)",
      from: coveredThrough,
      to: today,
      days: daysBetween(coveredThrough, today),
      explained: Boolean(explanation),
      ...(explanation ? { explanation } : {}),
    });
  }

  return gaps;
}

/** §5 disclosure questions — each requires an explanation when affirmative. */
export const DISCLOSURE_QUESTIONS: readonly { id: string; text: string; adverseIfYes: boolean }[] = [
  { id: "license_action", text: "Has any professional license ever been denied, restricted, revoked, suspended, or surrendered?", adverseIfYes: true },
  { id: "dea_action", text: "Has your DEA registration ever been denied, restricted, revoked, suspended, or surrendered?", adverseIfYes: true },
  { id: "program_exclusion", text: "Have you ever been excluded or sanctioned by Medicare, Medicaid, or any federal program?", adverseIfYes: true },
  { id: "privilege_action", text: "Have hospital privileges ever been denied, restricted, suspended, or resigned while under investigation?", adverseIfYes: true },
  { id: "society_action", text: "Has any professional society taken action against you?", adverseIfYes: true },
  { id: "conviction", text: "Have you been convicted of a felony or misdemeanor?", adverseIfYes: true },
  { id: "malpractice_claims", text: "Have any malpractice claims been filed against you (pending, settled, dismissed, or judgment)?", adverseIfYes: true },
  { id: "health_condition", text: "Do you have any health condition that affects your ability to perform the privileges requested, with or without accommodation?", adverseIfYes: false },
  { id: "substance_use", text: "Do you currently use any substance in a manner that affects your practice?", adverseIfYes: true },
  { id: "unpaid_judgments", text: "Are there any unpaid judgments against you?", adverseIfYes: false },
  { id: "current_suits", text: "Are you a party to any current suits related to professional practice?", adverseIfYes: true },
];

export interface DisclosureIssue {
  questionId: string;
  question: string;
  kind: "MISSING_ANSWER" | "MISSING_EXPLANATION";
  /** Affirmative answers to adverse questions route to the enhanced review path. */
  requiresEnhancedReview: boolean;
}

export function validateDisclosures(answers: readonly DisclosureAnswer[]): DisclosureIssue[] {
  const issues: DisclosureIssue[] = [];
  for (const q of DISCLOSURE_QUESTIONS) {
    const answer = answers.find((a) => a.questionId === q.id);
    if (!answer) {
      issues.push({
        questionId: q.id,
        question: q.text,
        kind: "MISSING_ANSWER",
        requiresEnhancedReview: false,
      });
      continue;
    }
    if (answer.affirmative && !answer.explanation?.trim()) {
      issues.push({
        questionId: q.id,
        question: q.text,
        kind: "MISSING_EXPLANATION",
        requiresEnhancedReview: q.adverseIfYes,
      });
    }
  }
  return issues;
}

/** §15.7: an adverse history routes to an enhanced review path, not a rejection. */
export function requiresEnhancedReview(answers: readonly DisclosureAnswer[]): boolean {
  return DISCLOSURE_QUESTIONS.filter((q) => q.adverseIfYes).some((q) =>
    answers.some((a) => a.questionId === q.id && a.affirmative),
  );
}

export interface Deficiency {
  field: string;
  message: string;
  /** Who has to act — the clinician, or staff. Drives the nudge cadence (§10). */
  owner: "CLINICIAN" | "STAFF";
  severity: "BLOCKING" | "ADVISORY";
}

export interface CompletenessResult {
  complete: boolean;
  percentComplete: number;
  deficiencies: Deficiency[];
  gaps: WorkHistoryGap[];
  disclosureIssues: DisclosureIssue[];
  enhancedReviewRequired: boolean;
}

export interface CompletenessInput {
  practitioner: Practitioner;
  onboardingCase: OnboardingCase;
  hasNpi: boolean;
  hasActiveOrPendingLicense: boolean;
  documentTypesOnFile: readonly string[];
  requiredDocumentTypes: readonly string[];
  today: IsoDate;
}

/**
 * §4.2: "Application completeness check before it moves to verification;
 * return-to-applicant loop with specific deficiency list."
 */
export function checkCompleteness(input: CompletenessInput): CompletenessResult {
  const { onboardingCase: kase, practitioner } = input;
  const deficiencies: Deficiency[] = [];

  const gaps = detectWorkHistoryGaps(
    kase.workHistory,
    input.today,
    30,
    kase.currentGapExplanation,
  );
  for (const gap of gaps.filter((g) => !g.explained)) {
    deficiencies.push({
      field: "workHistory",
      message: `Unexplained ${gap.days}-day gap between ${gap.afterEmployer} and ${gap.beforeEmployer} (${gap.from} → ${gap.to}). A written explanation is required.`,
      owner: "CLINICIAN",
      severity: "BLOCKING",
    });
  }

  const disclosureIssues = validateDisclosures(kase.disclosures);
  for (const issue of disclosureIssues) {
    deficiencies.push({
      field: `disclosure.${issue.questionId}`,
      message:
        issue.kind === "MISSING_ANSWER"
          ? `Unanswered disclosure question: "${issue.question}"`
          : `Affirmative answer requires a written explanation: "${issue.question}"`,
      owner: "CLINICIAN",
      severity: "BLOCKING",
    });
  }

  if (!input.hasNpi) {
    deficiencies.push({
      field: "npi",
      message: "No Type 1 NPI. Flagged as 'needs NPI' — obtain through NPPES before payor submission.",
      owner: "STAFF",
      severity: "BLOCKING",
    });
  }

  if (!input.hasActiveOrPendingLicense) {
    deficiencies.push({
      field: "license",
      message: "No active or pending license in any practice state.",
      owner: "CLINICIAN",
      severity: "BLOCKING",
    });
  }

  const missingDocs = input.requiredDocumentTypes.filter(
    (t) => !input.documentTypesOnFile.includes(t),
  );
  for (const doc of missingDocs) {
    deficiencies.push({
      field: `document.${doc}`,
      message: `Missing document: ${doc}`,
      owner: "CLINICIAN",
      severity: "BLOCKING",
    });
  }

  for (const [field, label] of [
    ["attestation", "Attestation of accuracy"],
    ["releaseOfInformation", "Release of information / authorization to verify"],
    ["npdbConsent", "NPDB query consent"],
  ] as const) {
    if (!kase[field]) {
      deficiencies.push({
        field,
        message: `${label} not yet e-signed.`,
        owner: "CLINICIAN",
        severity: "BLOCKING",
      });
    }
  }

  if (
    practitioner.workAuthorization?.status === "VISA" &&
    !practitioner.workAuthorization.visaExpires
  ) {
    deficiencies.push({
      field: "workAuthorization",
      message: "Visa type recorded without an expiration date; the expiration is tracked as an expirable (§15.4).",
      owner: "STAFF",
      severity: "ADVISORY",
    });
  }

  const blocking = deficiencies.filter((d) => d.severity === "BLOCKING");
  // Percent is scored against the checks actually run, so the clinician-facing
  // progress bar moves for real work rather than for screens visited.
  const totalChecks =
    DISCLOSURE_QUESTIONS.length +
    input.requiredDocumentTypes.length +
    3 /* signatures */ +
    2 /* npi, license */ +
    Math.max(1, kase.workHistory.length);
  const failed = blocking.length;
  return {
    complete: blocking.length === 0,
    percentComplete: Math.max(0, Math.round(((totalChecks - failed) / totalChecks) * 100)),
    deficiencies,
    gaps,
    disclosureIssues,
    enhancedReviewRequired: requiresEnhancedReview(kase.disclosures),
  };
}

/**
 * §4.2 e-signature must meet ESIGN/UETA: signer identity, timestamp, IP. A
 * signature missing any of those is not evidence, so it is rejected at capture
 * rather than discovered missing at audit.
 */
export function validateSignature(sig: ESignature | undefined): string[] {
  if (!sig) return ["No signature captured."];
  const problems: string[] = [];
  if (!sig.signerId.trim() || !sig.signerName.trim()) problems.push("Signer identity is missing.");
  if (!sig.signedAt || Number.isNaN(Date.parse(sig.signedAt))) {
    problems.push("Signature timestamp is missing or unparseable.");
  }
  // IPv4 dotted quad, or IPv6 — which must contain a colon. Without that
  // requirement a bare "999" passes as hex and a malformed IP is recorded as
  // signature evidence.
  if (!/^\d{1,3}(\.\d{1,3}){3}$|^[0-9a-f]*:[0-9a-f:]*$/i.test(sig.ip)) {
    problems.push("Signer IP address is missing or malformed.");
  }
  if (!/^[0-9a-f]{64}$/i.test(sig.documentSha256)) {
    problems.push("Signed document hash is missing — the signature cannot be bound to a document version.");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Pre-population (§4.2)
// ---------------------------------------------------------------------------

export type PrefillSource = "CAQH" | "NPPES" | "HRIS" | "PRIOR_APPLICATION";

export interface PrefillField {
  field: string;
  value: string;
  source: PrefillSource;
  /** Pre-filled values are proposals the clinician confirms, never silent facts. */
  requiresConfirmation: boolean;
}

export interface PrefillResult {
  fields: PrefillField[];
  /** Share of the application the clinician does not have to type (§14 usability). */
  coveragePercent: number;
  sources: PrefillSource[];
}

export function summarizePrefill(
  fields: readonly PrefillField[],
  totalFields: number,
): PrefillResult {
  const sources = [...new Set(fields.map((f) => f.source))];
  return {
    fields: [...fields],
    coveragePercent: totalFields === 0 ? 0 : Math.round((fields.length / totalFields) * 100),
    sources,
  };
}

/** §10 nudge cadence: reminder → manager notification → start-date-at-risk. */
export type NudgeLevel = "REMINDER" | "SECOND_REMINDER" | "MANAGER_NOTIFICATION" | "START_DATE_AT_RISK";

export function nudgeLevelFor(daysOverdue: number, startDateAtRisk: boolean): NudgeLevel | null {
  if (startDateAtRisk && daysOverdue > 0) return "START_DATE_AT_RISK";
  if (daysOverdue >= 14) return "MANAGER_NOTIFICATION";
  if (daysOverdue >= 7) return "SECOND_REMINDER";
  if (daysOverdue >= 0) return "REMINDER";
  return null;
}

/**
 * §10: "Clinician non-responsiveness is the #1 cause of delay; the system should
 * quantify it, not just complain about it."
 */
export interface ResponsivenessMetric {
  clinicianOwnedTasks: number;
  overdueTasks: number;
  totalDaysWaiting: number;
  averageDaysToRespond: number | null;
  nextEscalation: NudgeLevel | null;
}

export function measureResponsiveness(
  tasks: readonly { ownerRole: string; due: IsoDate; completed?: IsoDate; created: IsoDate; status: string }[],
  today: IsoDate,
  startDateAtRisk: boolean,
): ResponsivenessMetric {
  const mine = tasks.filter((t) => t.ownerRole === "CLINICIAN");
  const open = mine.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
  const overdue = open.filter((t) => daysBetween(t.due, today) > 0);
  const completed = mine.filter((t) => t.completed);
  const responseTimes = completed.map((t) => daysBetween(t.created, t.completed as IsoDate));
  const worstOverdue = overdue.reduce((max, t) => Math.max(max, daysBetween(t.due, today)), 0);
  return {
    clinicianOwnedTasks: mine.length,
    overdueTasks: overdue.length,
    totalDaysWaiting: overdue.reduce((sum, t) => sum + daysBetween(t.due, today), 0),
    averageDaysToRespond:
      responseTimes.length === 0
        ? null
        : Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
    nextEscalation: overdue.length === 0 ? null : nudgeLevelFor(worstOverdue, startDateAtRisk),
  };
}

/** Personalized checklist due dates, backward-planned from the milestone plan (§4.1). */
export function checklistDueDate(milestoneRequiredBy: IsoDate, bufferDays = 7): IsoDate {
  return addDays(milestoneRequiredBy, -bufferDays);
}
