/**
 * Primary source verification (§4.3, §6).
 *
 * Two rules do most of the work here:
 *
 *  - **Timeliness.** Most standards require the verification to be no older than
 *    `psvValidityDays` at the moment of the credentialing *decision*. A file that
 *    was complete in March is not complete for a September committee. The engine
 *    therefore always evaluates staleness against a decision date, not today.
 *  - **Never silently overwrite.** When the verified value differs from what the
 *    clinician reported, that is a DISCREPANCY for a human to adjudicate — not a
 *    field update. Silent overwrite destroys the very evidence a survey asks for.
 */

import { addDays, daysBetween, isBefore, type IsoDate } from "./dates";
import type { TenantConfig } from "./config";
import type {
  Id,
  Practitioner,
  PractitionerIdentifier,
  Verification,
  VerificationElement,
} from "./types";
import { isApp } from "./types";

export type Automation = "API" | "SEMI_AUTO" | "MANUAL" | "INTEGRATION";

export interface PsvMatrixEntry {
  element: VerificationElement;
  label: string;
  primarySource: string;
  automation: Automation;
  /** §11: exclusion and sanction sources are re-screened every month, forever. */
  monthlyRecheck: boolean;
  /** Manual sources that routinely need 2–4 follow-ups (§4.3). */
  highFollowUp: boolean;
}

/** §6 verification matrix. Editable configuration, shown to admins as a table. */
export const PSV_MATRIX: readonly PsvMatrixEntry[] = [
  { element: "STATE_LICENSE", label: "State license", primarySource: "State licensing board", automation: "API", monthlyRecheck: false, highFollowUp: false },
  { element: "DEA", label: "DEA registration", primarySource: "DEA / CSOS", automation: "API", monthlyRecheck: false, highFollowUp: false },
  { element: "STATE_CDS", label: "State CDS registration", primarySource: "State agency", automation: "MANUAL", monthlyRecheck: false, highFollowUp: false },
  { element: "EDUCATION", label: "Professional school", primarySource: "Registrar / AMA or AOA Profile", automation: "SEMI_AUTO", monthlyRecheck: false, highFollowUp: true },
  { element: "TRAINING", label: "Postgraduate training", primarySource: "Program / AMA Profile / ECFMG", automation: "SEMI_AUTO", monthlyRecheck: false, highFollowUp: true },
  { element: "BOARD_CERT", label: "Board certification", primarySource: "ABMS / AOA / specialty board", automation: "API", monthlyRecheck: false, highFollowUp: false },
  { element: "ECFMG", label: "ECFMG certification", primarySource: "ECFMG", automation: "SEMI_AUTO", monthlyRecheck: false, highFollowUp: false },
  { element: "WORK_HISTORY", label: "Work history", primarySource: "Prior employers", automation: "MANUAL", monthlyRecheck: false, highFollowUp: true },
  { element: "HOSPITAL_AFFILIATION", label: "Hospital affiliation", primarySource: "Facility medical staff office", automation: "MANUAL", monthlyRecheck: false, highFollowUp: true },
  { element: "MALPRACTICE_CLAIMS", label: "Malpractice claims history", primarySource: "Carrier + NPDB", automation: "SEMI_AUTO", monthlyRecheck: false, highFollowUp: false },
  { element: "MALPRACTICE_COVERAGE", label: "Current malpractice coverage", primarySource: "Carrier / certificate of insurance", automation: "MANUAL", monthlyRecheck: false, highFollowUp: false },
  { element: "NPDB", label: "NPDB query", primarySource: "NPDB", automation: "API", monthlyRecheck: false, highFollowUp: false },
  { element: "OIG_LEIE", label: "OIG exclusions", primarySource: "OIG LEIE", automation: "API", monthlyRecheck: true, highFollowUp: false },
  { element: "SAM_GOV", label: "SAM.gov exclusions", primarySource: "SAM.gov", automation: "API", monthlyRecheck: true, highFollowUp: false },
  { element: "STATE_MEDICAID_EXCLUSION", label: "State Medicaid exclusion list", primarySource: "State exclusion list", automation: "SEMI_AUTO", monthlyRecheck: true, highFollowUp: false },
  { element: "CMS_PRECLUSION", label: "Medicare opt-out / preclusion list", primarySource: "CMS", automation: "API", monthlyRecheck: true, highFollowUp: false },
  { element: "PEER_REFERENCE", label: "Peer reference", primarySource: "Named peer", automation: "MANUAL", monthlyRecheck: false, highFollowUp: true },
  { element: "NPI", label: "NPI validity", primarySource: "NPPES", automation: "API", monthlyRecheck: false, highFollowUp: false },
  { element: "SANCTIONS", label: "Sanctions / licensure actions", primarySource: "FSMB / state boards", automation: "SEMI_AUTO", monthlyRecheck: false, highFollowUp: false },
  { element: "IMMUNIZATION", label: "Immunizations / TB / fit test", primarySource: "Occupational health", automation: "INTEGRATION", monthlyRecheck: false, highFollowUp: false },
  { element: "BACKGROUND_CHECK", label: "Background check & drug screen", primarySource: "Vendor", automation: "INTEGRATION", monthlyRecheck: false, highFollowUp: false },
  { element: "IDENTITY", label: "Identity verification", primarySource: "Government ID", automation: "MANUAL", monthlyRecheck: false, highFollowUp: false },
  { element: "LIFE_SUPPORT", label: "Life support certification", primarySource: "Issuing body", automation: "MANUAL", monthlyRecheck: false, highFollowUp: false },
];

export function matrixEntry(element: VerificationElement): PsvMatrixEntry {
  const entry = PSV_MATRIX.find((e) => e.element === element);
  if (!entry) throw new Error(`No PSV matrix entry for ${element}`);
  return entry;
}

/** A verification the file requires, resolved down to the specific subject. */
export interface RequiredVerification {
  element: VerificationElement;
  /** Which license / affiliation / peer this instance covers. */
  subject?: string;
  state?: string;
  entry: PsvMatrixEntry;
}

export interface RequiredVerificationInput {
  practitioner: Practitioner;
  identifiers: readonly PractitionerIdentifier[];
  hospitalAffiliations: readonly string[];
  priorEmployers: readonly string[];
  peerReferenceNames: readonly string[];
  isImg?: boolean;
}

/**
 * The required set is derived, not remembered. A clinician licensed in 12 states
 * needs 12 license verifications and a DEA verification per state they prescribe
 * in (§15.3) — the most common way a file is quietly incomplete is a specialist
 * verifying only the "main" license.
 */
export function requiredVerifications(
  config: TenantConfig,
  input: RequiredVerificationInput,
): RequiredVerification[] {
  const required: RequiredVerification[] = [];
  const add = (element: VerificationElement, subject?: string, state?: string) => {
    required.push({ element, ...(subject ? { subject } : {}), ...(state ? { state } : {}), entry: matrixEntry(element) });
  };

  for (const id of input.identifiers) {
    if (id.kind === "STATE_LICENSE") add("STATE_LICENSE", id.value, id.state);
    if (id.kind === "DEA") add("DEA", id.value, id.state);
    if (id.kind === "STATE_CDS") add("STATE_CDS", id.value, id.state);
  }

  add("NPI");
  add("EDUCATION");
  add("TRAINING");
  add("BOARD_CERT");
  if (input.isImg) add("ECFMG");
  add("MALPRACTICE_CLAIMS");
  add("MALPRACTICE_COVERAGE");
  add("NPDB");
  add("SANCTIONS");
  add("IDENTITY");
  add("BACKGROUND_CHECK");
  add("IMMUNIZATION");
  add("LIFE_SUPPORT");
  add("OIG_LEIE");
  add("SAM_GOV");
  add("CMS_PRECLUSION");

  // Exclusion screening is per-state for Medicaid.
  const states = new Set(input.identifiers.map((i) => i.state).filter((s): s is string => !!s));
  for (const state of states) add("STATE_MEDICAID_EXCLUSION", undefined, state);

  for (const employer of input.priorEmployers) add("WORK_HISTORY", employer);
  for (const affiliation of input.hospitalAffiliations) add("HOSPITAL_AFFILIATION", affiliation);

  const peers = input.peerReferenceNames.slice(0, Math.max(config.peerReferences.minimum, input.peerReferenceNames.length));
  const peerCount = Math.max(config.peerReferences.minimum, peers.length);
  for (let i = 0; i < peerCount; i += 1) {
    add("PEER_REFERENCE", peers[i] ?? `Peer reference ${i + 1} (not yet named)`);
  }

  // APP certification routes to a different board (§9); the element is the same,
  // the source is not. Recorded here so the work queue routes correctly.
  if (isApp(input.practitioner.type)) {
    required.push({
      element: "BOARD_CERT",
      subject: appCertifyingBody(input.practitioner.type),
      entry: { ...matrixEntry("BOARD_CERT"), primarySource: appCertifyingBody(input.practitioner.type) },
    });
  }

  return required;
}

/** §9: certification bodies differ by APP type, so verification routing must too. */
export function appCertifyingBody(type: Practitioner["type"]): string {
  switch (type) {
    case "NP":
      return "AANP / ANCC";
    case "PA":
      return "NCCPA";
    case "CRNA":
      return "NBCRNA";
    case "CNM":
      return "AMCB";
    case "CAA":
      return "NCCAA";
    default:
      return "ABMS / AOA";
  }
}

export type PsvItemStatus =
  | "VERIFIED"
  | "STALE"
  | "EXPIRING_BEFORE_DECISION"
  | "MISSING"
  | "IN_PROGRESS"
  | "DISCREPANCY"
  | "ADVERSE"
  | "UNABLE_TO_VERIFY";

export interface PsvItem {
  required: RequiredVerification;
  verification?: Verification;
  status: PsvItemStatus;
  /** Days until this verification goes stale for the decision date in view. */
  daysUntilStale: number | null;
  staleOn: IsoDate | null;
}

function sameSubject(required: RequiredVerification, v: Verification): boolean {
  if (required.element !== v.element) return false;
  if (required.state && v.state && required.state !== v.state) return false;
  if (required.subject && v.subject && required.subject !== v.subject) return false;
  return true;
}

/**
 * Evaluate the file against a prospective decision date. Passing the *decision*
 * date rather than today is what implements §4.3's "force re-verification if the
 * decision slips past the window".
 */
export function evaluatePsv(
  config: TenantConfig,
  required: readonly RequiredVerification[],
  verifications: readonly Verification[],
  decisionDate: IsoDate,
): PsvItem[] {
  const used = new Set<Id>();
  return required.map((req) => {
    const match = verifications.find((v) => !used.has(v.id) && sameSubject(req, v));
    if (match) used.add(match.id);

    if (!match) {
      return { required: req, status: "MISSING", daysUntilStale: null, staleOn: null };
    }

    const staleOn = addDays(match.verifiedOn, config.cycles.psvValidityDays);
    const daysUntilStale = daysBetween(decisionDate, staleOn);

    let status: PsvItemStatus;
    if (match.result === "ADVERSE") status = "ADVERSE";
    else if (match.result === "DISCREPANCY") status = "DISCREPANCY";
    else if (match.result === "UNABLE_TO_VERIFY") status = "UNABLE_TO_VERIFY";
    else if (isBefore(staleOn, decisionDate)) status = "STALE";
    else if (daysUntilStale <= 30) status = "EXPIRING_BEFORE_DECISION";
    else status = "VERIFIED";

    return { required: req, verification: match, status, daysUntilStale, staleOn };
  });
}

export interface PsvSummary {
  items: PsvItem[];
  total: number;
  verified: number;
  missing: number;
  stale: number;
  needsAdjudication: number;
  /** §13 "file completeness scoring against the applicable standard set". */
  completenessPercent: number;
  /** True when nothing blocks a credentialing decision on `decisionDate`. */
  decisionReady: boolean;
  accreditorApplied: TenantConfig["accreditor"];
  psvValidityDaysApplied: number;
}

export function summarizePsv(
  config: TenantConfig,
  items: readonly PsvItem[],
): PsvSummary {
  const verified = items.filter(
    (i) => i.status === "VERIFIED" || i.status === "EXPIRING_BEFORE_DECISION",
  ).length;
  const missing = items.filter((i) => i.status === "MISSING" || i.status === "IN_PROGRESS").length;
  const stale = items.filter((i) => i.status === "STALE").length;
  const needsAdjudication = items.filter(
    (i) => i.status === "DISCREPANCY" || i.status === "ADVERSE" || i.status === "UNABLE_TO_VERIFY",
  ).length;
  const total = items.length;
  return {
    items: [...items],
    total,
    verified,
    missing,
    stale,
    needsAdjudication,
    completenessPercent: total === 0 ? 0 : Math.round((verified / total) * 100),
    decisionReady: total > 0 && missing === 0 && stale === 0 && needsAdjudication === 0,
    accreditorApplied: config.accreditor,
    psvValidityDaysApplied: config.cycles.psvValidityDays,
  };
}

/**
 * §4.3: flag rather than overwrite. Comparison is whitespace- and case-insensitive
 * so that "Jane A. Smith" vs "jane a smith" is not paraded as a finding, but any
 * substantive difference is.
 */
export function detectDiscrepancy(
  selfReported: string | undefined,
  verified: string | undefined,
): boolean {
  if (selfReported === undefined || verified === undefined) return false;
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s.,]+/g, " ");
  return normalize(selfReported) !== normalize(verified);
}

/** §11: which monthly screens are due, and evidence of the last clean result. */
export interface MonthlyScreen {
  element: VerificationElement;
  label: string;
  lastScreened: IsoDate | null;
  dueOn: IsoDate | null;
  overdue: boolean;
  lastResult: Verification["result"] | null;
}

export function monthlyScreeningStatus(
  today: IsoDate,
  verifications: readonly Verification[],
  intervalDays = 30,
): MonthlyScreen[] {
  return PSV_MATRIX.filter((e) => e.monthlyRecheck).map((entry) => {
    const matches = verifications
      .filter((v) => v.element === entry.element)
      .sort((a, b) => (a.verifiedOn < b.verifiedOn ? 1 : -1));
    const last = matches[0];
    const dueOn = last ? addDays(last.verifiedOn, intervalDays) : null;
    return {
      element: entry.element,
      label: entry.label,
      lastScreened: last?.verifiedOn ?? null,
      dueOn,
      overdue: dueOn === null || daysBetween(today, dueOn) < 0,
      lastResult: last?.result ?? null,
    };
  });
}

/**
 * §15.8 / §15.11 — an intra-system transfer or a rehire reuses verifications that
 * are still inside the validity window, and re-runs only the delta. This is the
 * single largest saving the "collect once, verify once" premise buys.
 */
export interface DeltaVerificationPlan {
  reusable: Verification[];
  mustReverify: RequiredVerification[];
  reusedCount: number;
  savedManualTouches: number;
}

export function planDeltaVerification(
  config: TenantConfig,
  required: readonly RequiredVerification[],
  priorVerifications: readonly Verification[],
  decisionDate: IsoDate,
): DeltaVerificationPlan {
  const items = evaluatePsv(config, required, priorVerifications, decisionDate);
  const reusable = items
    .filter((i) => i.status === "VERIFIED" || i.status === "EXPIRING_BEFORE_DECISION")
    .map((i) => i.verification)
    .filter((v): v is Verification => v !== undefined);
  const mustReverify = items
    .filter((i) => i.status !== "VERIFIED" && i.status !== "EXPIRING_BEFORE_DECISION")
    .map((i) => i.required);
  return {
    reusable,
    mustReverify,
    reusedCount: reusable.length,
    savedManualTouches: items.filter(
      (i) =>
        (i.status === "VERIFIED" || i.status === "EXPIRING_BEFORE_DECISION") &&
        i.required.entry.highFollowUp,
    ).length,
  };
}
