/**
 * Core domain model (requirements §3).
 *
 * The load-bearing decision here is that every relationship a naive model would
 * flatten is a join row instead. A practitioner onboards at several facilities,
 * under several TINs, in several states, with different privilege sets and
 * different payor participation *at the same time*. So there is no
 * `practitioner.status`, no `practitioner.facilityId`, and no
 * `practitioner.payorStatus` — status lives on the join (PayorEnrollment,
 * PrivilegeRequest, FacilityAppointment), never on the person.
 */

import type { IsoDate } from "./dates";

export type Id = string;

// ---------------------------------------------------------------------------
// People and organizations
// ---------------------------------------------------------------------------

export type PractitionerType =
  | "MD"
  | "DO"
  | "NP"
  | "PA"
  | "CRNA"
  | "CNM"
  | "CAA"
  | "PSYCHOLOGIST"
  | "OTHER_LIP";

/** APPs carry a different legal and billing structure (§9), not fewer fields. */
export const APP_TYPES: readonly PractitionerType[] = [
  "NP",
  "PA",
  "CRNA",
  "CNM",
  "CAA",
] as const;

export function isApp(type: PractitionerType): boolean {
  return APP_TYPES.includes(type);
}

export type EmploymentType =
  | "EMPLOYED"
  | "CONTRACTED"
  | "LOCUM_TENENS"
  | "ACADEMIC"
  | "MOONLIGHTING";

/**
 * The golden record. Persists across employers and facilities — a rehire or an
 * intra-system transfer reuses this record and its verifications rather than
 * restarting (§15.8, §15.11).
 */
export interface Practitioner {
  id: Id;
  legalFirstName: string;
  legalLastName: string;
  formerNames: { name: string; from: IsoDate; to: IsoDate }[];
  type: PractitionerType;
  primarySpecialty: string;
  subspecialties: string[];
  /** Restricted fields. Never rendered without a field-level RBAC check (§2). */
  dateOfBirth?: IsoDate;
  ssnLast4?: string;
  workAuthorization?: {
    status: "CITIZEN" | "PERMANENT_RESIDENT" | "VISA";
    visaType?: "H-1B" | "J-1" | "TN" | "O-1";
    visaExpires?: IsoDate;
    j1WaiverSiteId?: Id;
  };
  languages: string[];
  email: string;
  phone: string;
  /** Present when the person has onboarded here before (§15.11 rehire). */
  priorFileId?: Id;
}

export type IdentifierKind =
  | "NPI_TYPE_1"
  | "CAQH"
  | "DEA"
  | "STATE_LICENSE"
  | "STATE_CDS"
  | "MEDICARE_PTAN"
  | "MEDICAID_ID"
  | "ECFMG"
  | "BOARD_CERT"
  | "TAXONOMY";

export interface PractitionerIdentifier {
  id: Id;
  practitionerId: Id;
  kind: IdentifierKind;
  value: string;
  /** DEA, licenses, CDS, Medicaid IDs and PTANs are all state-scoped. */
  state?: string;
  issued?: IsoDate;
  expires?: IsoDate;
  status: "ACTIVE" | "PENDING" | "INACTIVE" | "EXPIRED" | "SURRENDERED" | "RESTRICTED";
  restrictions?: string;
  /** DEA schedules (e.g. ["2", "2N", "3", "4", "5"]). */
  schedules?: string[];
}

/** Billing entity — the TIN a claim goes out under. Carries the Type 2 NPI. */
export interface Organization {
  id: Id;
  name: string;
  tin: string;
  npiType2: string;
}

export interface Facility {
  id: Id;
  name: string;
  organizationId: Id;
  state: string;
  /** Bylaws differ per hospital in a multi-facility system (§8.1). */
  bylawsId: Id;
  accreditor: Accreditor;
}

export type Accreditor = "JOINT_COMMISSION" | "DNV" | "HFAP" | "NCQA" | "URAC" | "AAAHC";

export interface PracticeLocation {
  id: Id;
  name: string;
  organizationId: Id;
  facilityId?: Id;
  address: string;
  state: string;
  acceptingNewPatients: boolean;
  adaAccessible: boolean;
}

// ---------------------------------------------------------------------------
// Payors
// ---------------------------------------------------------------------------

export type PayorProgram =
  | "COMMERCIAL"
  | "MEDICARE"
  | "MEDICAID"
  | "MEDICARE_ADVANTAGE"
  | "MEDICAID_MCO"
  | "TRICARE"
  | "WORKERS_COMP";

export interface Payor {
  id: Id;
  name: string;
  program: PayorProgram;
  /** MA and Medicaid MCO plans require the parent program first (§7.2). */
  parentProgram?: PayorProgram;
  submissionChannel: "PORTAL" | "AVAILITY" | "PECOS" | "ROSTER" | "EMAIL" | "PAPER";
  typicalTurnaroundDays: number;
  /** Some payors do not credential some APP types at all (§9). */
  credentialsAppTypes: PractitionerType[];
}

export interface PayorProduct {
  id: Id;
  payorId: Id;
  name: string;
  network: "HMO" | "PPO" | "EPO" | "EXCHANGE" | "MA" | "MEDICAID_MCO" | "BEHAVIORAL" | "NARROW";
  states: string[];
}

/**
 * Contracting (is the group in-network?) is not credentialing (is this clinician
 * loaded under that contract?) — §7.5. A missing contract roughly doubles the
 * timeline, so it is modeled separately and surfaced separately.
 */
export interface PayorContract {
  id: Id;
  organizationId: Id;
  payorId: Id;
  productIds: Id[];
  effective: IsoDate;
  expires?: IsoDate;
  /** Delegated: we roster them. Non-delegated: we submit an application each time. */
  delegated: boolean;
  rosterCadenceDays?: number;
}

export type EnrollmentStatus =
  | "NOT_STARTED"
  | "IN_PREP"
  | "SUBMITTED"
  | "PAYOR_REVIEW"
  | "ADDITIONAL_INFO_REQUESTED"
  | "APPROVED"
  | "DENIED"
  | "WITHDRAWN";

/** One row per payor product × TIN × location. Status lives here, not on the person. */
export interface PayorEnrollment {
  id: Id;
  caseId: Id;
  practitionerId: Id;
  payorId: Id;
  payorProductId: Id;
  organizationId: Id;
  locationId: Id;
  status: EnrollmentStatus;
  submitted?: IsoDate;
  trackingNumber?: string;
  analystContact?: string;
  approved?: IsoDate;
  /** Date of record — only ever set from the payor's written approval (§7.3). */
  effectiveDate?: IsoDate;
  /** Payor granted an effective date earlier than approval (§15.16). */
  retroactiveTo?: IsoDate;
  par: boolean;
  followUps: FollowUp[];
  /** Set when the payor loses the submission and we resubmit (§15.15). */
  resubmittedFrom?: Id;
  notes?: string;
}

export interface FollowUp {
  date: IsoDate;
  channel: "PHONE" | "PORTAL" | "EMAIL" | "FAX";
  by: string;
  outcome: string;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type VerificationElement =
  | "STATE_LICENSE"
  | "DEA"
  | "STATE_CDS"
  | "EDUCATION"
  | "TRAINING"
  | "BOARD_CERT"
  | "ECFMG"
  | "WORK_HISTORY"
  | "HOSPITAL_AFFILIATION"
  | "MALPRACTICE_CLAIMS"
  | "MALPRACTICE_COVERAGE"
  | "NPDB"
  | "OIG_LEIE"
  | "SAM_GOV"
  | "STATE_MEDICAID_EXCLUSION"
  | "CMS_PRECLUSION"
  | "PEER_REFERENCE"
  | "NPI"
  | "SANCTIONS"
  | "IMMUNIZATION"
  | "BACKGROUND_CHECK"
  | "IDENTITY"
  | "LIFE_SUPPORT";

export type VerificationMethod = "API" | "PORTAL" | "WEB" | "PHONE" | "MAIL" | "FAX" | "VENDOR";

export type VerificationResult = "CLEAN" | "ADVERSE" | "DISCREPANCY" | "UNABLE_TO_VERIFY";

/**
 * One record per verified element (§6). The artifact is the audit evidence: a
 * clean OIG screen is worth storing precisely *because* it is clean.
 */
export interface Verification {
  id: Id;
  practitionerId: Id;
  element: VerificationElement;
  /** Which license/DEA/affiliation this verifies, when the element repeats. */
  subject?: string;
  state?: string;
  source: string;
  method: VerificationMethod;
  verifiedOn: IsoDate;
  verifierId: Id;
  result: VerificationResult;
  artifactId?: Id;
  /** Populated when the verified value differs from what the clinician reported. */
  selfReported?: string;
  verified?: string;
  /** True when a delegated CVO performed it and we accept it (§6). */
  byCvo?: boolean;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Privileging
// ---------------------------------------------------------------------------

export type PrivilegeKind = "CORE" | "SPECIAL";

export interface PrivilegeCriterion {
  /** Machine-checkable criterion; see domain/privileges.ts for evaluation. */
  kind:
    | "BOARD_CERTIFIED"
    | "BOARD_ELIGIBLE_WINDOW"
    | "TRAINING_COMPLETED"
    | "MIN_VOLUME"
    | "CURRENT_ACTIVITY"
    | "LICENSE_ACTIVE"
    | "DEA_ACTIVE"
    | "LIFE_SUPPORT";
  label: string;
  /** MIN_VOLUME: cases required. CURRENT_ACTIVITY / BOARD_ELIGIBLE_WINDOW: months. */
  value?: number;
  detail?: string;
}

export interface Privilege {
  id: Id;
  privilegeSetId: Id;
  name: string;
  kind: PrivilegeKind;
  criteria: PrivilegeCriterion[];
}

/** Delineation of privileges form — versioned, per department (§8.2). */
export interface PrivilegeSet {
  id: Id;
  name: string;
  specialty: string;
  department: string;
  version: string;
  effective: IsoDate;
  /** APPs privilege under an allied-health category with its own DOP (§9). */
  appliesTo: PractitionerType[];
}

export type PrivilegeDecision = "REQUESTED" | "GRANTED" | "GRANTED_WITH_CONDITIONS" | "DENIED" | "WITHDRAWN";

export interface PrivilegeRequestItem {
  privilegeId: Id;
  decision: PrivilegeDecision;
  conditions?: string;
  proctorRequired?: boolean;
  /** Self-reported case volume, and the count evidenced by verified case logs. */
  claimedVolume?: number;
  evidencedVolume?: number;
  lastPerformed?: IsoDate;
}

export interface PrivilegeRequest {
  id: Id;
  caseId: Id;
  practitionerId: Id;
  facilityId: Id;
  privilegeSetId: Id;
  staffCategory: StaffCategory;
  items: PrivilegeRequestItem[];
  /** Temporary privileges have hard duration limits (§8.3). */
  temporary?: { granted: IsoDate; expires: IsoDate; reason: "PENDING_APPLICATION" | "URGENT_NEED" | "DISASTER" };
  /** Telemedicine privileging by proxy (§8.3). */
  proxy?: { distantSiteFacility: string; agreementOnFile: boolean; distantSiteAccredited: boolean; performanceDataReceived: boolean };
}

export type StaffCategory =
  | "ACTIVE"
  | "PROVISIONAL"
  | "COURTESY"
  | "CONSULTING"
  | "AFFILIATE"
  | "HONORARY"
  | "TELEMEDICINE"
  | "ALLIED_HEALTH";

export type CommitteeBody = "DEPARTMENT_CHAIR" | "CREDENTIALS_COMMITTEE" | "MEC" | "BOARD";

export interface CommitteeReview {
  id: Id;
  privilegeRequestId: Id;
  body: CommitteeBody;
  scheduled?: IsoDate;
  decided?: IsoDate;
  outcome?: "APPROVED" | "APPROVED_WITH_CONDITIONS" | "DEFERRED" | "DENIED";
  deferralReason?: string;
  membersPresent?: number;
  quorumRequired?: number;
  recusals?: string[];
  votesFor?: number;
  votesAgainst?: number;
  conditions?: string;
  appointmentTermMonths?: number;
  recordedBy?: Id;
}

/** FPPE is triggered for every newly granted privilege (§8.4). */
export interface Fppe {
  id: Id;
  practitionerId: Id;
  facilityId: Id;
  privilegeId: Id;
  method: "CHART_REVIEW" | "PROCTORING" | "SIMULATION" | "DIRECT_OBSERVATION";
  trigger: "NEW_PRIVILEGE" | "FOR_CAUSE";
  volumeThreshold: number;
  completedVolume: number;
  evaluatorId?: Id;
  due: IsoDate;
  completed?: IsoDate;
  outcome?: "SATISFACTORY" | "EXTENDED" | "UNSATISFACTORY";
}

// ---------------------------------------------------------------------------
// Documents, expirables, tasks
// ---------------------------------------------------------------------------

export interface DocumentRecord {
  id: Id;
  practitionerId: Id;
  type: string;
  version: number;
  uploaded: IsoDate;
  /** Self-reported documents can support an application but never a PSV (§3). */
  sourceClass: "SELF_REPORTED" | "PRIMARY_SOURCE";
  expires?: IsoDate;
  supersedesId?: Id;
  sha256: string;
}

export type ExpirableKind =
  | "STATE_LICENSE"
  | "DEA"
  | "STATE_CDS"
  | "BOARD_CERT"
  | "MALPRACTICE"
  | "LIFE_SUPPORT"
  | "CAQH_ATTESTATION"
  | "VISA"
  | "IMMUNIZATION"
  | "MEDICARE_REVALIDATION"
  | "MEDICAID_REVALIDATION"
  | "REAPPOINTMENT"
  | "RECREDENTIALING"
  | "COLLABORATIVE_AGREEMENT";

export interface Expirable {
  id: Id;
  practitionerId: Id;
  kind: ExpirableKind;
  label: string;
  state?: string;
  expires: IsoDate;
  /** What happens automatically at expiration (§10). */
  onExpiration: "SUSPEND_PRIVILEGES" | "SUSPEND_PRESCRIBING" | "SUSPEND_BILLING" | "NOTIFY_ONLY";
  renewedOn?: IsoDate;
}

export type TaskOwnerRole =
  | "CLINICIAN"
  | "CREDENTIALING"
  | "PAYOR_ENROLLMENT"
  | "MSO"
  | "HR"
  | "IT"
  | "REVENUE_CYCLE"
  | "DEPARTMENT_CHAIR"
  | "EXTERNAL_SOURCE"
  | "PAYOR"
  | "COMMITTEE";

export interface Task {
  id: Id;
  caseId: Id;
  title: string;
  ownerRole: TaskOwnerRole;
  assigneeId?: Id;
  status: "OPEN" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
  created: IsoDate;
  due: IsoDate;
  completed?: IsoDate;
  slaDays: number;
  remindersSent: number;
  milestoneId?: string;
}

// ---------------------------------------------------------------------------
// Disclosures and adverse history
// ---------------------------------------------------------------------------

export interface AdverseAction {
  id: Id;
  practitionerId: Id;
  kind:
    | "MALPRACTICE_CLAIM"
    | "LICENSURE_ACTION"
    | "DEA_ACTION"
    | "EXCLUSION"
    | "PRIVILEGE_ACTION"
    | "SOCIETY_ACTION"
    | "CONVICTION"
    | "RESIGNATION_UNDER_INVESTIGATION";
  occurred: IsoDate;
  description: string;
  disposition?: string;
  paymentAmount?: number;
  selfDisclosed: boolean;
  discoveredByVerification: boolean;
  /** NPDB reporting obligations run on strict clocks (§8.3, §15.17). */
  npdbReportable: boolean;
  npdbReportedOn?: IsoDate;
}

export interface WorkHistoryEntry {
  employer: string;
  role: string;
  /** Month precision is the standard; day is not required (§5). */
  from: IsoDate;
  to?: IsoDate;
  gapExplanation?: string;
}

export interface DisclosureAnswer {
  questionId: string;
  affirmative: boolean;
  explanation?: string;
}

// ---------------------------------------------------------------------------
// APP-specific (§9)
// ---------------------------------------------------------------------------

export interface CollaborativeAgreement {
  id: Id;
  practitionerId: Id;
  supervisingPhysicianIds: Id[];
  alternateIds: Id[];
  state: string;
  scope: string;
  chartReviewPercent: number;
  chartReviewFrequency: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  meetingCadence: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  effective: IsoDate;
  renews: IsoDate;
  stateFilingRequired: boolean;
  stateFiledOn?: IsoDate;
  signedByApp?: IsoDate;
  signedByPhysician?: IsoDate;
}

// ---------------------------------------------------------------------------
// The umbrella case
// ---------------------------------------------------------------------------

export type CaseStage =
  | "INITIATION"
  | "DATA_COLLECTION"
  | "PSV"
  | "PARALLEL_TRACKS"
  | "PROVISIONING"
  | "GO_LIVE"
  | "MAINTENANCE"
  | "CANCELLED";

/** One clinician + one start date. Links every track together (§3). */
export interface OnboardingCase {
  id: Id;
  practitionerId: Id;
  stage: CaseStage;
  initiated: IsoDate;
  startDate: IsoDate;
  employmentType: EmploymentType;
  organizationIds: Id[];
  facilityIds: Id[];
  locationIds: Id[];
  states: string[];
  expectedPayorProductIds: Id[];
  workHistory: WorkHistoryEntry[];
  /** Explains a break between the most recent position and today (§4.2, §15.1). */
  currentGapExplanation?: string;
  disclosures: DisclosureAnswer[];
  attestation?: ESignature;
  releaseOfInformation?: ESignature;
  npdbConsent?: ESignature;
  /** Stage timestamps feed the KPI decomposition in §13. */
  applicationCompleteOn?: IsoDate;
  psvCompleteOn?: IsoDate;
  committeeDecisionOn?: IsoDate;
  cancelledOn?: IsoDate;
}

/** ESIGN/UETA evidence: identity, timestamp, IP (§4.2). */
export interface ESignature {
  signerId: Id;
  signerName: string;
  signedAt: string;
  ip: string;
  documentSha256: string;
}
