/**
 * Seed practitioners and their cases.
 *
 * The five cases are chosen to exercise the edge cases in §15 rather than to
 * look tidy — a demo where everything is green teaches nothing about a system
 * whose whole purpose is surfacing what is about to go wrong:
 *
 *   1. Osei      — physician with an unachievable start date and privilege
 *                  requests unsupported by verified evidence (§15 general, §8.2)
 *   2. Whitfield — multi-state telehealth NP: new TIN with no commercial
 *                  contracts, scope-of-practice conflict, supervisor at the state
 *                  capacity cap, a payor that will not credential NPs (§15.3, §9)
 *   3. Chandran  — new graduate IMG on a visa, license pending at start (§15.1–4)
 *   4. Marchetti — intra-system transfer, live and billing, with held claims and
 *                  a retroactive effective date to work (§15.8, §15.16)
 *   5. Baird     — locum tenens on temporary privileges and a reciprocal billing
 *                  bridge that expires before enrollment completes (§15.5)
 */

import type {
  AdverseAction,
  CollaborativeAgreement,
  CommitteeReview,
  DocumentRecord,
  Expirable,
  Fppe,
  OnboardingCase,
  PayorEnrollment,
  Practitioner,
  PractitionerIdentifier,
  PrivilegeRequest,
  Task,
  Verification,
} from "@/domain/types";
import type { CredentialEvidence } from "@/domain/privileges";
import type { BridgeArrangement, HeldClaim } from "@/domain/billing";
import type { FactBag } from "@/domain/rules";

/** The demo clock. Every engine takes `today` as an argument; this is the value
 *  the pages pass in, so the seeded dates tell a coherent story. */
export const TODAY = "2026-08-25";

export const PRACTITIONERS: Practitioner[] = [
  {
    id: "prac-osei",
    legalFirstName: "Amara",
    legalLastName: "Osei",
    formerNames: [],
    type: "MD",
    primarySpecialty: "Cardiovascular Disease",
    subspecialties: ["Echocardiography"],
    dateOfBirth: "1984-03-11",
    ssnLast4: "4417",
    workAuthorization: { status: "CITIZEN" },
    languages: ["English", "Twi"],
    email: "a.osei@example.org",
    phone: "510-555-0142",
  },
  {
    id: "prac-whitfield",
    legalFirstName: "Nia",
    legalLastName: "Whitfield",
    formerNames: [{ name: "Nia Corbin", from: "2012-06-01", to: "2021-04-30" }],
    type: "NP",
    primarySpecialty: "Family Practice",
    subspecialties: [],
    dateOfBirth: "1989-11-02",
    ssnLast4: "9083",
    workAuthorization: { status: "CITIZEN" },
    languages: ["English", "Spanish"],
    email: "n.whitfield@example.org",
    phone: "415-555-0177",
  },
  {
    id: "prac-chandran",
    legalFirstName: "Ravi",
    legalLastName: "Chandran",
    formerNames: [],
    type: "MD",
    primarySpecialty: "Hospital Medicine",
    subspecialties: [],
    dateOfBirth: "1995-07-19",
    ssnLast4: "2210",
    workAuthorization: { status: "VISA", visaType: "H-1B", visaExpires: "2027-02-28" },
    languages: ["English", "Tamil", "Hindi"],
    email: "r.chandran@example.org",
    phone: "209-555-0119",
  },
  {
    id: "prac-marchetti",
    legalFirstName: "Elena",
    legalLastName: "Marchetti",
    formerNames: [],
    type: "DO",
    primarySpecialty: "Hospital Medicine",
    subspecialties: [],
    dateOfBirth: "1981-01-27",
    ssnLast4: "6634",
    workAuthorization: { status: "CITIZEN" },
    languages: ["English", "Italian"],
    email: "e.marchetti@example.org",
    phone: "209-555-0163",
    // §15.8: transferring between entities inside the same system. Her prior file
    // is the reason her verification set is a delta, not a restart.
    priorFileId: "file-legacy-8841",
  },
  {
    id: "prac-baird",
    legalFirstName: "Tom",
    legalLastName: "Baird",
    formerNames: [],
    type: "MD",
    primarySpecialty: "Hospital Medicine",
    subspecialties: [],
    dateOfBirth: "1976-09-05",
    ssnLast4: "1188",
    workAuthorization: { status: "CITIZEN" },
    languages: ["English"],
    email: "t.baird@locumsagency.example",
    phone: "916-555-0198",
  },
  {
    // Supervising physician for the APP case — not onboarding, but needed to
    // evaluate the §9 supervision capacity cap.
    id: "prac-lindqvist",
    legalFirstName: "Ingrid",
    legalLastName: "Lindqvist",
    formerNames: [],
    type: "MD",
    primarySpecialty: "Family Medicine",
    subspecialties: [],
    languages: ["English", "Swedish"],
    email: "i.lindqvist@example.org",
    phone: "209-555-0100",
  },
];

export const IDENTIFIERS: PractitionerIdentifier[] = [
  // Osei
  { id: "idn-osei-npi", practitionerId: "prac-osei", kind: "NPI_TYPE_1", value: "1730984412", status: "ACTIVE" },
  { id: "idn-osei-caqh", practitionerId: "prac-osei", kind: "CAQH", value: "14882301", status: "ACTIVE" },
  { id: "idn-osei-lic-ca", practitionerId: "prac-osei", kind: "STATE_LICENSE", value: "A-118422", state: "CA", issued: "2015-08-01", expires: "2027-06-30", status: "ACTIVE" },
  { id: "idn-osei-dea-ca", practitionerId: "prac-osei", kind: "DEA", value: "BO4429117", state: "CA", expires: "2027-03-31", status: "ACTIVE", schedules: ["2", "2N", "3", "4", "5"] },
  { id: "idn-osei-cds-ca", practitionerId: "prac-osei", kind: "STATE_CDS", value: "CDS-CA-88213", state: "CA", expires: "2027-02-28", status: "ACTIVE" },
  { id: "idn-osei-board", practitionerId: "prac-osei", kind: "BOARD_CERT", value: "ABIM-CV-771204", expires: "2029-12-31", status: "ACTIVE" },

  // Whitfield — twelve-state telehealth footprint, DEA per state (§15.3).
  { id: "idn-whit-npi", practitionerId: "prac-whitfield", kind: "NPI_TYPE_1", value: "1447712209", status: "ACTIVE" },
  { id: "idn-whit-caqh", practitionerId: "prac-whitfield", kind: "CAQH", value: "16640922", status: "ACTIVE" },
  { id: "idn-whit-lic-ca", practitionerId: "prac-whitfield", kind: "STATE_LICENSE", value: "NP-99231", state: "CA", expires: "2027-01-31", status: "ACTIVE" },
  { id: "idn-whit-lic-tx", practitionerId: "prac-whitfield", kind: "STATE_LICENSE", value: "TX-AP-40218", state: "TX", expires: "2027-09-30", status: "ACTIVE" },
  { id: "idn-whit-lic-or", practitionerId: "prac-whitfield", kind: "STATE_LICENSE", value: "OR-NP-11884", state: "OR", expires: "2026-11-30", status: "ACTIVE" },
  { id: "idn-whit-lic-wa", practitionerId: "prac-whitfield", kind: "STATE_LICENSE", value: "WA-AP60112233", state: "WA", expires: "2027-04-30", status: "ACTIVE" },
  { id: "idn-whit-lic-az", practitionerId: "prac-whitfield", kind: "STATE_LICENSE", value: "AZ-NP-33119", state: "AZ", expires: "2027-08-31", status: "ACTIVE" },
  { id: "idn-whit-lic-nv", practitionerId: "prac-whitfield", kind: "STATE_LICENSE", value: "NV-APRN-7712", state: "NV", expires: "2026-10-31", status: "ACTIVE" },
  { id: "idn-whit-dea-ca", practitionerId: "prac-whitfield", kind: "DEA", value: "MW7712004", state: "CA", expires: "2027-05-31", status: "ACTIVE", schedules: ["3", "4", "5"] },
  // Registered for schedule 2 in Texas, which Texas does not permit an NP to
  // prescribe — the scope engine catches this before EHR configuration does not.
  { id: "idn-whit-dea-tx", practitionerId: "prac-whitfield", kind: "DEA", value: "MW7712004", state: "TX", expires: "2027-05-31", status: "ACTIVE", schedules: ["2", "3", "4", "5"] },
  { id: "idn-whit-board", practitionerId: "prac-whitfield", kind: "BOARD_CERT", value: "AANP-FNP-220914", expires: "2028-06-30", status: "ACTIVE" },

  // Chandran — license still pending at start date (§15.2).
  { id: "idn-chan-npi", practitionerId: "prac-chandran", kind: "NPI_TYPE_1", value: "1992234117", status: "ACTIVE" },
  { id: "idn-chan-lic-ca", practitionerId: "prac-chandran", kind: "STATE_LICENSE", value: "PENDING-2026-88412", state: "CA", status: "PENDING" },
  { id: "idn-chan-ecfmg", practitionerId: "prac-chandran", kind: "ECFMG", value: "0-712-334-5", status: "ACTIVE" },

  // Marchetti
  { id: "idn-marc-npi", practitionerId: "prac-marchetti", kind: "NPI_TYPE_1", value: "1558842203", status: "ACTIVE" },
  { id: "idn-marc-caqh", practitionerId: "prac-marchetti", kind: "CAQH", value: "12009941", status: "ACTIVE" },
  { id: "idn-marc-lic-ca", practitionerId: "prac-marchetti", kind: "STATE_LICENSE", value: "20A-44120", state: "CA", expires: "2028-02-28", status: "ACTIVE" },
  { id: "idn-marc-dea-ca", practitionerId: "prac-marchetti", kind: "DEA", value: "BM2201884", state: "CA", expires: "2026-09-30", status: "ACTIVE", schedules: ["2", "3", "4", "5"] },
  { id: "idn-marc-ptan", practitionerId: "prac-marchetti", kind: "MEDICARE_PTAN", value: "CA0099213", status: "ACTIVE" },
  { id: "idn-marc-board", practitionerId: "prac-marchetti", kind: "BOARD_CERT", value: "ABIM-IM-559021", expires: "2027-12-31", status: "ACTIVE" },

  // Baird — locum
  { id: "idn-baird-npi", practitionerId: "prac-baird", kind: "NPI_TYPE_1", value: "1667723310", status: "ACTIVE" },
  { id: "idn-baird-lic-ca", practitionerId: "prac-baird", kind: "STATE_LICENSE", value: "A-772014", state: "CA", expires: "2027-11-30", status: "ACTIVE" },
  { id: "idn-baird-dea-ca", practitionerId: "prac-baird", kind: "DEA", value: "BB9912004", state: "CA", expires: "2027-07-31", status: "ACTIVE", schedules: ["2", "3", "4", "5"] },

  { id: "idn-lind-npi", practitionerId: "prac-lindqvist", kind: "NPI_TYPE_1", value: "1223349911", status: "ACTIVE" },
  { id: "idn-lind-lic-ca", practitionerId: "prac-lindqvist", kind: "STATE_LICENSE", value: "A-220114", state: "CA", expires: "2027-03-31", status: "ACTIVE" },
];

const SIG = (id: string, name: string, at: string) => ({
  signerId: id,
  signerName: name,
  signedAt: at,
  ip: "198.51.100.24",
  documentSha256: "9f2c4b1a7e6d5c3b8a0f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3",
});

export const CASES: OnboardingCase[] = [
  {
    id: "case-osei",
    practitionerId: "prac-osei",
    stage: "PARALLEL_TRACKS",
    initiated: "2026-05-20",
    // Recruitment committed to a start date the credentialing calendar cannot
    // reach. The system says so on day one rather than in month three (§4.1).
    startDate: "2026-10-05",
    employmentType: "EMPLOYED",
    organizationIds: ["org-nsmg"],
    facilityIds: ["fac-central"],
    locationIds: ["loc-cardio"],
    states: ["CA"],
    expectedPayorProductIds: [
      "prod-medicare-b",
      "prod-medi-cal",
      "prod-bcbs-ppo",
      "prod-bcbs-hmo",
      "prod-united-ppo",
      "prod-aetna-ma",
      "prod-healthnet-mcal",
    ],
    workHistory: [
      { employer: "Pacific Heart Institute", role: "Attending Cardiologist", from: "2021-09-01", to: "2026-04-30" },
      { employer: "UCSF Medical Center", role: "Cardiology Fellow", from: "2018-07-01", to: "2021-06-30" },
    ],
    disclosures: [
      { questionId: "license_action", affirmative: false },
      { questionId: "dea_action", affirmative: false },
      { questionId: "program_exclusion", affirmative: false },
      { questionId: "privilege_action", affirmative: false },
      { questionId: "society_action", affirmative: false },
      { questionId: "conviction", affirmative: false },
      { questionId: "malpractice_claims", affirmative: true, explanation: "One claim filed 2022, dismissed without payment in 2023. Case detail and carrier letter attached." },
      { questionId: "health_condition", affirmative: false },
      { questionId: "substance_use", affirmative: false },
      { questionId: "unpaid_judgments", affirmative: false },
      { questionId: "current_suits", affirmative: false },
    ],
    attestation: SIG("prac-osei", "Amara Osei, MD", "2026-06-25T17:42:11Z"),
    releaseOfInformation: SIG("prac-osei", "Amara Osei, MD", "2026-06-25T17:43:02Z"),
    npdbConsent: SIG("prac-osei", "Amara Osei, MD", "2026-06-25T17:43:40Z"),
    applicationCompleteOn: "2026-06-25",
  },
  {
    id: "case-whitfield",
    practitionerId: "prac-whitfield",
    stage: "PARALLEL_TRACKS",
    initiated: "2026-06-01",
    startDate: "2026-09-15",
    employmentType: "EMPLOYED",
    organizationIds: ["org-nsvc", "org-nsmg"],
    facilityIds: ["fac-valley"],
    locationIds: ["loc-virtual-ca", "loc-virtual-tx", "loc-valley"],
    states: ["CA", "TX", "OR", "WA", "AZ", "NV"],
    expectedPayorProductIds: ["prod-medicare-b", "prod-bcbs-ppo", "prod-united-ppo", "prod-medi-cal"],
    workHistory: [
      { employer: "Bay Telehealth Partners", role: "Nurse Practitioner", from: "2022-03-01", to: "2026-05-31" },
      { employer: "Modesto Community Clinic", role: "Nurse Practitioner", from: "2019-01-01", to: "2021-08-31" },
    ],
    disclosures: [
      { questionId: "license_action", affirmative: false },
      { questionId: "dea_action", affirmative: false },
      { questionId: "program_exclusion", affirmative: false },
      { questionId: "privilege_action", affirmative: false },
      { questionId: "society_action", affirmative: false },
      { questionId: "conviction", affirmative: false },
      { questionId: "malpractice_claims", affirmative: false },
      { questionId: "health_condition", affirmative: false },
      { questionId: "substance_use", affirmative: false },
      { questionId: "unpaid_judgments", affirmative: false },
      { questionId: "current_suits", affirmative: false },
    ],
    attestation: SIG("prac-whitfield", "Nia Whitfield, FNP-C", "2026-07-02T15:10:00Z"),
    releaseOfInformation: SIG("prac-whitfield", "Nia Whitfield, FNP-C", "2026-07-02T15:11:20Z"),
    applicationCompleteOn: "2026-07-02",
  },
  {
    id: "case-chandran",
    practitionerId: "prac-chandran",
    stage: "DATA_COLLECTION",
    initiated: "2026-08-01",
    startDate: "2026-12-01",
    employmentType: "EMPLOYED",
    organizationIds: ["org-nsmg"],
    facilityIds: ["fac-valley"],
    locationIds: ["loc-valley"],
    states: ["CA"],
    expectedPayorProductIds: ["prod-medicare-b", "prod-medi-cal", "prod-bcbs-ppo", "prod-healthnet-mcal"],
    // §15.1: a new graduate has no work history beyond training, and the gap
    // between residency completion and the start date needs an explanation.
    workHistory: [
      { employer: "Valley Regional — Internal Medicine Residency", role: "Resident", from: "2023-07-01", to: "2026-06-30" },
    ],
    currentGapExplanation:
      "Relocating to California and awaiting initial licensure; no employment between residency completion on 2026-06-30 and the start date.",
    disclosures: [
      { questionId: "license_action", affirmative: false },
      { questionId: "dea_action", affirmative: false },
      { questionId: "program_exclusion", affirmative: false },
      { questionId: "privilege_action", affirmative: false },
      { questionId: "conviction", affirmative: false },
      { questionId: "malpractice_claims", affirmative: false },
      { questionId: "health_condition", affirmative: false },
      { questionId: "substance_use", affirmative: false },
      { questionId: "unpaid_judgments", affirmative: false },
    ],
  },
  {
    id: "case-marchetti",
    practitionerId: "prac-marchetti",
    stage: "GO_LIVE",
    initiated: "2026-02-10",
    startDate: "2026-06-01",
    employmentType: "EMPLOYED",
    organizationIds: ["org-nsmg"],
    facilityIds: ["fac-valley"],
    locationIds: ["loc-valley"],
    states: ["CA"],
    expectedPayorProductIds: ["prod-medicare-b", "prod-medi-cal", "prod-bcbs-ppo", "prod-united-ppo"],
    workHistory: [
      { employer: "Northstar Foothill Physicians (same system, different TIN)", role: "Hospitalist", from: "2019-08-01", to: "2026-05-31" },
      { employer: "Mercy General Hospital", role: "Hospitalist", from: "2014-07-01", to: "2019-07-31" },
    ],
    disclosures: [
      { questionId: "license_action", affirmative: false },
      { questionId: "dea_action", affirmative: false },
      { questionId: "program_exclusion", affirmative: false },
      { questionId: "privilege_action", affirmative: false },
      { questionId: "society_action", affirmative: false },
      { questionId: "conviction", affirmative: false },
      { questionId: "malpractice_claims", affirmative: false },
      { questionId: "health_condition", affirmative: false },
      { questionId: "substance_use", affirmative: false },
      { questionId: "unpaid_judgments", affirmative: false },
      { questionId: "current_suits", affirmative: false },
    ],
    attestation: SIG("prac-marchetti", "Elena Marchetti, DO", "2026-03-04T12:00:00Z"),
    releaseOfInformation: SIG("prac-marchetti", "Elena Marchetti, DO", "2026-03-04T12:01:00Z"),
    npdbConsent: SIG("prac-marchetti", "Elena Marchetti, DO", "2026-03-04T12:02:00Z"),
    applicationCompleteOn: "2026-03-04",
    psvCompleteOn: "2026-04-08",
    committeeDecisionOn: "2026-05-14",
  },
  {
    id: "case-baird",
    practitionerId: "prac-baird",
    stage: "GO_LIVE",
    initiated: "2026-07-10",
    startDate: "2026-08-10",
    employmentType: "LOCUM_TENENS",
    organizationIds: ["org-nsmg"],
    facilityIds: ["fac-central"],
    locationIds: ["loc-cardio"],
    states: ["CA"],
    expectedPayorProductIds: ["prod-medicare-b"],
    workHistory: [
      { employer: "Statewide Locums Agency", role: "Locum Hospitalist", from: "2020-01-01" },
    ],
    disclosures: [
      { questionId: "license_action", affirmative: false },
      { questionId: "dea_action", affirmative: false },
      { questionId: "program_exclusion", affirmative: false },
      { questionId: "privilege_action", affirmative: false },
      { questionId: "society_action", affirmative: false },
      { questionId: "conviction", affirmative: false },
      { questionId: "malpractice_claims", affirmative: false },
      { questionId: "health_condition", affirmative: false },
      { questionId: "substance_use", affirmative: false },
      { questionId: "unpaid_judgments", affirmative: false },
      { questionId: "current_suits", affirmative: false },
    ],
    attestation: SIG("prac-baird", "Tom Baird, MD", "2026-07-18T09:15:00Z"),
    releaseOfInformation: SIG("prac-baird", "Tom Baird, MD", "2026-07-18T09:16:00Z"),
    npdbConsent: SIG("prac-baird", "Tom Baird, MD", "2026-07-18T09:17:00Z"),
    applicationCompleteOn: "2026-07-18",
  },
];

/** Milestones already achieved, per case — these re-baseline the forward pass. */
export const MILESTONE_ACTUALS: Record<string, Record<string, string>> = {
  "case-osei": {
    initiation: "2026-05-22",
    intake: "2026-06-25",
    psv_auto: "2026-07-01",
    hr_onboarding: "2026-07-20",
    peer_refs: "2026-08-14",
  },
  "case-whitfield": {
    initiation: "2026-06-03",
    intake: "2026-07-02",
    psv_auto: "2026-07-09",
    hr_onboarding: "2026-07-28",
  },
  "case-chandran": {
    initiation: "2026-08-03",
  },
  "case-marchetti": {
    initiation: "2026-02-12",
    intake: "2026-03-04",
    psv_auto: "2026-03-12",
    psv_manual: "2026-04-05",
    peer_refs: "2026-03-28",
    file_complete: "2026-04-08",
    dept_chair: "2026-04-16",
    credentials_committee: "2026-04-30",
    mec: "2026-05-08",
    board: "2026-05-14",
    hr_onboarding: "2026-04-02",
    provisioning: "2026-05-26",
    schedule_build: "2026-06-01",
    payor_submission: "2026-04-20",
  },
  "case-baird": {
    initiation: "2026-07-12",
    intake: "2026-07-18",
    psv_auto: "2026-07-24",
    hr_onboarding: "2026-08-01",
    temp_privileges: "2026-08-05",
    provisioning: "2026-08-09",
    payor_submission: "2026-08-06",
  },
};

export const VERIFICATIONS: Verification[] = [
  // --- Osei: a largely complete file with one discrepancy to adjudicate -----
  { id: "ver-osei-npi", practitionerId: "prac-osei", element: "NPI", source: "NPPES", method: "API", verifiedOn: "2026-06-26", verifierId: "user-cred-1", result: "CLEAN", artifactId: "doc-osei-npi" },
  { id: "ver-osei-lic", practitionerId: "prac-osei", element: "STATE_LICENSE", subject: "A-118422", state: "CA", source: "Medical Board of California", method: "API", verifiedOn: "2026-06-26", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-osei-dea", practitionerId: "prac-osei", element: "DEA", subject: "BO4429117", state: "CA", source: "DEA", method: "API", verifiedOn: "2026-06-26", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-osei-cds", practitionerId: "prac-osei", element: "STATE_CDS", subject: "CDS-CA-88213", state: "CA", source: "California DOJ", method: "WEB", verifiedOn: "2026-06-29", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-osei-edu", practitionerId: "prac-osei", element: "EDUCATION", source: "AMA Physician Profile", method: "PORTAL", verifiedOn: "2026-07-06", verifierId: "user-cred-2", result: "CLEAN" },
  { id: "ver-osei-train", practitionerId: "prac-osei", element: "TRAINING", source: "UCSF GME Office", method: "MAIL", verifiedOn: "2026-07-21", verifierId: "user-cred-2", result: "CLEAN" },
  { id: "ver-osei-board", practitionerId: "prac-osei", element: "BOARD_CERT", source: "ABIM", method: "API", verifiedOn: "2026-06-26", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-osei-npdb", practitionerId: "prac-osei", element: "NPDB", source: "NPDB", method: "API", verifiedOn: "2026-06-27", verifierId: "user-cred-1", result: "ADVERSE", notes: "One report: 2022 claim, dismissed without payment. Consistent with self-disclosure; routed to enhanced review." },
  { id: "ver-osei-mal-claims", practitionerId: "prac-osei", element: "MALPRACTICE_CLAIMS", source: "The Doctors Company", method: "MAIL", verifiedOn: "2026-07-14", verifierId: "user-cred-2", result: "CLEAN" },
  { id: "ver-osei-mal-cov", practitionerId: "prac-osei", element: "MALPRACTICE_COVERAGE", source: "The Doctors Company", method: "FAX", verifiedOn: "2026-07-14", verifierId: "user-cred-2", result: "CLEAN" },
  { id: "ver-osei-oig", practitionerId: "prac-osei", element: "OIG_LEIE", source: "OIG LEIE", method: "API", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-osei-sam", practitionerId: "prac-osei", element: "SAM_GOV", source: "SAM.gov", method: "API", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-osei-precl", practitionerId: "prac-osei", element: "CMS_PRECLUSION", source: "CMS", method: "API", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-osei-medexcl", practitionerId: "prac-osei", element: "STATE_MEDICAID_EXCLUSION", state: "CA", source: "DHCS Suspended & Ineligible List", method: "WEB", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-osei-sanc", practitionerId: "prac-osei", element: "SANCTIONS", source: "FSMB", method: "API", verifiedOn: "2026-06-27", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-osei-id", practitionerId: "prac-osei", element: "IDENTITY", source: "Government photo ID", method: "PORTAL", verifiedOn: "2026-06-25", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-osei-bg", practitionerId: "prac-osei", element: "BACKGROUND_CHECK", source: "HireRight", method: "VENDOR", verifiedOn: "2026-07-18", verifierId: "system", result: "CLEAN" },
  { id: "ver-osei-imm", practitionerId: "prac-osei", element: "IMMUNIZATION", source: "Occupational Health", method: "PORTAL", verifiedOn: "2026-07-20", verifierId: "user-hr-1", result: "CLEAN" },
  { id: "ver-osei-acls", practitionerId: "prac-osei", element: "LIFE_SUPPORT", source: "American Heart Association", method: "WEB", verifiedOn: "2026-06-30", verifierId: "user-cred-1", result: "CLEAN" },
  {
    id: "ver-osei-work-1",
    practitionerId: "prac-osei",
    element: "WORK_HISTORY",
    subject: "Pacific Heart Institute",
    source: "Pacific Heart Institute HR",
    method: "PHONE",
    verifiedOn: "2026-08-11",
    verifierId: "user-cred-2",
    result: "DISCREPANCY",
    selfReported: "2021-09-01 to 2026-04-30",
    verified: "2021-11-15 to 2026-04-30",
    notes: "Employer reports a start date ten weeks later than self-reported. Adjudicate before the file goes to committee; do not overwrite the application.",
  },
  { id: "ver-osei-work-2", practitionerId: "prac-osei", element: "WORK_HISTORY", subject: "UCSF Medical Center", source: "UCSF HR", method: "MAIL", verifiedOn: "2026-07-30", verifierId: "user-cred-2", result: "CLEAN" },
  { id: "ver-osei-aff-1", practitionerId: "prac-osei", element: "HOSPITAL_AFFILIATION", subject: "Pacific Heart Institute", source: "PHI Medical Staff Office", method: "FAX", verifiedOn: "2026-08-06", verifierId: "user-cred-2", result: "CLEAN" },
  { id: "ver-osei-peer-1", practitionerId: "prac-osei", element: "PEER_REFERENCE", subject: "Dr. Marcus Feld", source: "Dr. Marcus Feld", method: "PORTAL", verifiedOn: "2026-08-14", verifierId: "user-cred-2", result: "CLEAN" },
  { id: "ver-osei-peer-2", practitionerId: "prac-osei", element: "PEER_REFERENCE", subject: "Dr. Lian Park", source: "Dr. Lian Park", method: "PORTAL", verifiedOn: "2026-08-12", verifierId: "user-cred-2", result: "CLEAN" },

  // --- Whitfield: multi-state, several licenses still unverified ------------
  { id: "ver-whit-npi", practitionerId: "prac-whitfield", element: "NPI", source: "NPPES", method: "API", verifiedOn: "2026-07-03", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-whit-lic-ca", practitionerId: "prac-whitfield", element: "STATE_LICENSE", subject: "NP-99231", state: "CA", source: "California BRN", method: "API", verifiedOn: "2026-07-03", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-whit-lic-tx", practitionerId: "prac-whitfield", element: "STATE_LICENSE", subject: "TX-AP-40218", state: "TX", source: "Texas BON", method: "API", verifiedOn: "2026-07-03", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-whit-lic-or", practitionerId: "prac-whitfield", element: "STATE_LICENSE", subject: "OR-NP-11884", state: "OR", source: "Oregon State Board of Nursing", method: "WEB", verifiedOn: "2026-07-09", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-whit-dea-ca", practitionerId: "prac-whitfield", element: "DEA", subject: "MW7712004", state: "CA", source: "DEA", method: "API", verifiedOn: "2026-07-03", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-whit-dea-tx", practitionerId: "prac-whitfield", element: "DEA", subject: "MW7712004", state: "TX", source: "DEA", method: "API", verifiedOn: "2026-07-03", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-whit-board", practitionerId: "prac-whitfield", element: "BOARD_CERT", subject: "AANP / ANCC", source: "AANP", method: "API", verifiedOn: "2026-07-04", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-whit-edu", practitionerId: "prac-whitfield", element: "EDUCATION", source: "Samuel Merritt University", method: "MAIL", verifiedOn: "2026-07-28", verifierId: "user-cred-3", result: "CLEAN" },
  { id: "ver-whit-npdb", practitionerId: "prac-whitfield", element: "NPDB", source: "NPDB", method: "API", verifiedOn: "2026-07-05", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-whit-oig", practitionerId: "prac-whitfield", element: "OIG_LEIE", source: "OIG LEIE", method: "API", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-whit-sam", practitionerId: "prac-whitfield", element: "SAM_GOV", source: "SAM.gov", method: "API", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-whit-id", practitionerId: "prac-whitfield", element: "IDENTITY", source: "Government photo ID", method: "PORTAL", verifiedOn: "2026-07-02", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-whit-work-1", practitionerId: "prac-whitfield", element: "WORK_HISTORY", subject: "Bay Telehealth Partners", source: "Bay Telehealth HR", method: "PHONE", verifiedOn: "2026-08-04", verifierId: "user-cred-3", result: "CLEAN" },

  // --- Marchetti: prior file, verifications reusable within the window ------
  { id: "ver-marc-npi", practitionerId: "prac-marchetti", element: "NPI", source: "NPPES", method: "API", verifiedOn: "2026-03-05", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-marc-lic", practitionerId: "prac-marchetti", element: "STATE_LICENSE", subject: "20A-44120", state: "CA", source: "Osteopathic Medical Board of California", method: "API", verifiedOn: "2026-03-05", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-marc-dea", practitionerId: "prac-marchetti", element: "DEA", subject: "BM2201884", state: "CA", source: "DEA", method: "API", verifiedOn: "2026-03-05", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-marc-board", practitionerId: "prac-marchetti", element: "BOARD_CERT", source: "ABIM", method: "API", verifiedOn: "2026-03-06", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-marc-edu", practitionerId: "prac-marchetti", element: "EDUCATION", source: "AOA Profile", method: "PORTAL", verifiedOn: "2026-03-18", verifierId: "user-cred-2", result: "CLEAN", byCvo: true },
  { id: "ver-marc-train", practitionerId: "prac-marchetti", element: "TRAINING", source: "Mercy General GME", method: "MAIL", verifiedOn: "2026-03-25", verifierId: "user-cred-2", result: "CLEAN", byCvo: true },
  { id: "ver-marc-npdb", practitionerId: "prac-marchetti", element: "NPDB", source: "NPDB Continuous Query", method: "API", verifiedOn: "2026-08-01", verifierId: "system", result: "CLEAN" },
  { id: "ver-marc-oig", practitionerId: "prac-marchetti", element: "OIG_LEIE", source: "OIG LEIE", method: "API", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-marc-sam", practitionerId: "prac-marchetti", element: "SAM_GOV", source: "SAM.gov", method: "API", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-marc-mal", practitionerId: "prac-marchetti", element: "MALPRACTICE_COVERAGE", source: "NORCAL", method: "FAX", verifiedOn: "2026-03-20", verifierId: "user-cred-2", result: "CLEAN" },
  { id: "ver-marc-acls", practitionerId: "prac-marchetti", element: "LIFE_SUPPORT", source: "American Heart Association", method: "WEB", verifiedOn: "2026-03-10", verifierId: "user-cred-1", result: "CLEAN" },

  // --- Baird: locum, thin but sufficient for temporary privileges ----------
  { id: "ver-baird-npi", practitionerId: "prac-baird", element: "NPI", source: "NPPES", method: "API", verifiedOn: "2026-07-19", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-baird-lic", practitionerId: "prac-baird", element: "STATE_LICENSE", subject: "A-772014", state: "CA", source: "Medical Board of California", method: "API", verifiedOn: "2026-07-19", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-baird-dea", practitionerId: "prac-baird", element: "DEA", subject: "BB9912004", state: "CA", source: "DEA", method: "API", verifiedOn: "2026-07-19", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-baird-npdb", practitionerId: "prac-baird", element: "NPDB", source: "NPDB", method: "API", verifiedOn: "2026-07-20", verifierId: "user-cred-1", result: "CLEAN" },
  { id: "ver-baird-oig", practitionerId: "prac-baird", element: "OIG_LEIE", source: "OIG LEIE", method: "API", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-baird-sam", practitionerId: "prac-baird", element: "SAM_GOV", source: "SAM.gov", method: "API", verifiedOn: "2026-08-03", verifierId: "system", result: "CLEAN" },
  { id: "ver-baird-id", practitionerId: "prac-baird", element: "IDENTITY", source: "Government photo ID", method: "PORTAL", verifiedOn: "2026-07-18", verifierId: "user-cred-1", result: "CLEAN" },
];

export const ENROLLMENTS: PayorEnrollment[] = [
  // Osei — submitted across the board; nothing effective yet.
  { id: "enr-osei-medicare", caseId: "case-osei", practitionerId: "prac-osei", payorId: "pay-medicare", payorProductId: "prod-medicare-b", organizationId: "org-nsmg", locationId: "loc-cardio", status: "PAYOR_REVIEW", submitted: "2026-07-06", trackingNumber: "PECOS-8842019", par: true, followUps: [{ date: "2026-08-05", channel: "PORTAL", by: "user-enroll-1", outcome: "In development; no additional documentation requested." }] },
  { id: "enr-osei-bcbs-ppo", caseId: "case-osei", practitionerId: "prac-osei", payorId: "pay-bcbs", payorProductId: "prod-bcbs-ppo", organizationId: "org-nsmg", locationId: "loc-cardio", status: "SUBMITTED", submitted: "2026-07-08", trackingNumber: "AVL-771203", analystContact: "K. Boone", par: true, followUps: [] },
  { id: "enr-osei-bcbs-hmo", caseId: "case-osei", practitionerId: "prac-osei", payorId: "pay-bcbs", payorProductId: "prod-bcbs-hmo", organizationId: "org-nsmg", locationId: "loc-cardio", status: "SUBMITTED", submitted: "2026-07-08", trackingNumber: "AVL-771204", par: true, followUps: [] },
  { id: "enr-osei-united", caseId: "case-osei", practitionerId: "prac-osei", payorId: "pay-united", payorProductId: "prod-united-ppo", organizationId: "org-nsmg", locationId: "loc-cardio", status: "ADDITIONAL_INFO_REQUESTED", submitted: "2026-07-09", trackingNumber: "UHC-2026-44120", analystContact: "R. Alvarez", par: true, followUps: [{ date: "2026-08-18", channel: "PHONE", by: "user-enroll-2", outcome: "Payor requests a corrected CMS-855R signature page; resent same day." }] },
  { id: "enr-osei-aetna", caseId: "case-osei", practitionerId: "prac-osei", payorId: "pay-aetna-ma", payorProductId: "prod-aetna-ma", organizationId: "org-nsmg", locationId: "loc-cardio", status: "IN_PREP", par: true, followUps: [], notes: "Held until the Medicare PTAN is issued — parent program enrollment is a prerequisite." },
  { id: "enr-osei-healthnet", caseId: "case-osei", practitionerId: "prac-osei", payorId: "pay-healthnet", payorProductId: "prod-healthnet-mcal", organizationId: "org-nsmg", locationId: "loc-cardio", status: "SUBMITTED", submitted: "2026-08-01", trackingNumber: "ROSTER-2026-08", par: true, followUps: [], notes: "Included in the August delegated roster add file." },
  { id: "enr-osei-medical", caseId: "case-osei", practitionerId: "prac-osei", payorId: "pay-medi-cal", payorProductId: "prod-medi-cal", organizationId: "org-nsmg", locationId: "loc-cardio", status: "SUBMITTED", submitted: "2026-07-15", trackingNumber: "PAVE-99120", par: true, followUps: [] },

  // Whitfield — virtual-care TIN is Medicare-only, so the commercial products
  // sit blocked on contracting rather than on credentialing.
  { id: "enr-whit-medicare-ca", caseId: "case-whitfield", practitionerId: "prac-whitfield", payorId: "pay-medicare", payorProductId: "prod-medicare-b", organizationId: "org-nsvc", locationId: "loc-virtual-ca", status: "SUBMITTED", submitted: "2026-07-20", trackingNumber: "PECOS-9021144", par: true, followUps: [] },
  { id: "enr-whit-medicare-tx", caseId: "case-whitfield", practitionerId: "prac-whitfield", payorId: "pay-medicare", payorProductId: "prod-medicare-b", organizationId: "org-nsvc", locationId: "loc-virtual-tx", status: "IN_PREP", par: true, followUps: [], notes: "Texas location requires a separate practice location add to the existing enrollment." },
  { id: "enr-whit-bcbs", caseId: "case-whitfield", practitionerId: "prac-whitfield", payorId: "pay-bcbs", payorProductId: "prod-bcbs-ppo", organizationId: "org-nsmg", locationId: "loc-valley", status: "SUBMITTED", submitted: "2026-07-22", trackingNumber: "AVL-780114", par: true, followUps: [] },
  { id: "enr-whit-medical", caseId: "case-whitfield", practitionerId: "prac-whitfield", payorId: "pay-medi-cal", payorProductId: "prod-medi-cal", organizationId: "org-nsmg", locationId: "loc-valley", status: "SUBMITTED", submitted: "2026-07-22", par: true, followUps: [] },

  // Marchetti — live, mostly effective, one payor long overdue and one
  // retroactive effective date that unlocks held claims (§15.16).
  { id: "enr-marc-medicare", caseId: "case-marchetti", practitionerId: "prac-marchetti", payorId: "pay-medicare", payorProductId: "prod-medicare-b", organizationId: "org-nsmg", locationId: "loc-valley", status: "APPROVED", submitted: "2026-04-20", approved: "2026-06-18", effectiveDate: "2026-06-15", retroactiveTo: "2026-05-21", par: true, followUps: [], notes: "Retroactive effective date granted to 30 days prior to the corrected filing date of 2026-06-20 (§7.2)." },
  { id: "enr-marc-medical", caseId: "case-marchetti", practitionerId: "prac-marchetti", payorId: "pay-medi-cal", payorProductId: "prod-medi-cal", organizationId: "org-nsmg", locationId: "loc-valley", status: "APPROVED", submitted: "2026-04-20", approved: "2026-07-02", effectiveDate: "2026-07-01", par: true, followUps: [] },
  { id: "enr-marc-bcbs", caseId: "case-marchetti", practitionerId: "prac-marchetti", payorId: "pay-bcbs", payorProductId: "prod-bcbs-ppo", organizationId: "org-nsmg", locationId: "loc-valley", status: "APPROVED", submitted: "2026-04-22", approved: "2026-08-04", effectiveDate: "2026-08-01", par: true, followUps: [{ date: "2026-07-10", channel: "PORTAL", by: "user-enroll-1", outcome: "Committee-approved; loading to networks." }] },
  { id: "enr-marc-united", caseId: "case-marchetti", practitionerId: "prac-marchetti", payorId: "pay-united", payorProductId: "prod-united-ppo", organizationId: "org-nsmg", locationId: "loc-valley", status: "SUBMITTED", submitted: "2026-04-20", trackingNumber: "UHC-2026-33871", analystContact: "R. Alvarez", par: true, followUps: [{ date: "2026-06-12", channel: "PHONE", by: "user-enroll-2", outcome: "Payor cannot locate the application; resubmitted with the original tracking number retained." }, { date: "2026-07-28", channel: "PORTAL", by: "user-enroll-2", outcome: "Status: in credentialing. No effective date offered." }], resubmittedFrom: "enr-marc-united-original", notes: "§15.15 — payor lost the original submission; resubmission tracked without discarding the original history." },

  // Baird — locum, Medicare only.
  { id: "enr-baird-medicare", caseId: "case-baird", practitionerId: "prac-baird", payorId: "pay-medicare", payorProductId: "prod-medicare-b", organizationId: "org-nsmg", locationId: "loc-cardio", status: "SUBMITTED", submitted: "2026-08-06", trackingNumber: "PECOS-9111203", par: true, followUps: [] },
];

export const PRIVILEGE_REQUESTS: PrivilegeRequest[] = [
  {
    id: "prv-osei",
    caseId: "case-osei",
    practitionerId: "prac-osei",
    facilityId: "fac-central",
    privilegeSetId: "ps-cardiology",
    staffCategory: "ACTIVE",
    items: [
      { privilegeId: "priv-cardio-core", decision: "REQUESTED" },
      { privilegeId: "priv-cardio-tee", decision: "REQUESTED", claimedVolume: 95, evidencedVolume: 82, lastPerformed: "2026-04-18" },
      // Requested without the interventional training or the case volume to
      // support it — the §8.2 finding the system is built to surface.
      { privilegeId: "priv-cardio-cath", decision: "REQUESTED", claimedVolume: 140, evidencedVolume: 61, lastPerformed: "2026-03-02" },
      { privilegeId: "priv-cardio-sedation", decision: "REQUESTED", lastPerformed: "2026-04-30" },
      { privilegeId: "priv-cardio-tavr", decision: "REQUESTED", claimedVolume: 18, evidencedVolume: 6, lastPerformed: "2025-02-11" },
    ],
  },
  {
    id: "prv-whitfield",
    caseId: "case-whitfield",
    practitionerId: "prac-whitfield",
    facilityId: "fac-valley",
    privilegeSetId: "ps-ahp-primary",
    staffCategory: "ALLIED_HEALTH",
    items: [
      { privilegeId: "priv-ahp-core", decision: "REQUESTED" },
      { privilegeId: "priv-ahp-prescribe", decision: "REQUESTED" },
      { privilegeId: "priv-ahp-joint", decision: "REQUESTED", claimedVolume: 30, evidencedVolume: 12, lastPerformed: "2026-05-02" },
    ],
  },
  {
    id: "prv-marchetti",
    caseId: "case-marchetti",
    practitionerId: "prac-marchetti",
    facilityId: "fac-valley",
    privilegeSetId: "ps-hospitalist",
    staffCategory: "ACTIVE",
    items: [{ privilegeId: "priv-hosp-core", decision: "GRANTED" }],
  },
  {
    id: "prv-baird",
    caseId: "case-baird",
    practitionerId: "prac-baird",
    facilityId: "fac-central",
    privilegeSetId: "ps-hospitalist",
    staffCategory: "TELEMEDICINE",
    items: [{ privilegeId: "priv-hosp-core", decision: "GRANTED_WITH_CONDITIONS", conditions: "Temporary grant only; hospitalist service coverage." }],
    temporary: { granted: "2026-08-05", expires: "2026-10-30", reason: "URGENT_NEED" },
  },
];

export const COMMITTEE_REVIEWS: CommitteeReview[] = [
  { id: "rev-osei-chair", privilegeRequestId: "prv-osei", body: "DEPARTMENT_CHAIR", scheduled: "2026-08-20", decided: "2026-08-22", outcome: "DEFERRED", deferralReason: "Catheterization and structural heart privileges requested without supporting training or case volume; chair requests case logs from Pacific Heart Institute.", membersPresent: 1, quorumRequired: 1, votesFor: 0, votesAgainst: 0, recordedBy: "user-mso-1" },
  { id: "rev-marc-chair", privilegeRequestId: "prv-marchetti", body: "DEPARTMENT_CHAIR", scheduled: "2026-04-14", decided: "2026-04-16", outcome: "APPROVED", membersPresent: 1, quorumRequired: 1, votesFor: 1, votesAgainst: 0, recordedBy: "user-mso-1" },
  { id: "rev-marc-cc", privilegeRequestId: "prv-marchetti", body: "CREDENTIALS_COMMITTEE", scheduled: "2026-04-28", decided: "2026-04-30", outcome: "APPROVED", membersPresent: 7, quorumRequired: 5, votesFor: 7, votesAgainst: 0, recusals: [], recordedBy: "user-mso-1" },
  { id: "rev-marc-mec", privilegeRequestId: "prv-marchetti", body: "MEC", scheduled: "2026-05-06", decided: "2026-05-08", outcome: "APPROVED", membersPresent: 9, quorumRequired: 6, votesFor: 9, votesAgainst: 0, recordedBy: "user-mso-1" },
  { id: "rev-marc-board", privilegeRequestId: "prv-marchetti", body: "BOARD", scheduled: "2026-05-14", decided: "2026-05-14", outcome: "APPROVED", membersPresent: 11, quorumRequired: 7, votesFor: 11, votesAgainst: 0, appointmentTermMonths: 24, recordedBy: "user-mso-1" },
  { id: "rev-whit-chair", privilegeRequestId: "prv-whitfield", body: "DEPARTMENT_CHAIR", scheduled: "2026-09-02", recordedBy: "user-mso-2" },
];

export const FPPES: Fppe[] = [
  { id: "fppe-marc-core", practitionerId: "prac-marchetti", facilityId: "fac-valley", privilegeId: "priv-hosp-core", method: "CHART_REVIEW", trigger: "NEW_PRIVILEGE", volumeThreshold: 10, completedVolume: 6, evaluatorId: "prac-lindqvist", due: "2026-09-12" },
  { id: "fppe-baird-core", practitionerId: "prac-baird", facilityId: "fac-central", privilegeId: "priv-hosp-core", method: "PROCTORING", trigger: "NEW_PRIVILEGE", volumeThreshold: 5, completedVolume: 1, evaluatorId: "prac-lindqvist", due: "2026-08-20" },
];

export const EXPIRABLES: Expirable[] = [
  { id: "exp-osei-dea", practitionerId: "prac-osei", kind: "DEA", label: "DEA registration (CA)", state: "CA", expires: "2027-03-31", onExpiration: "SUSPEND_PRESCRIBING" },
  { id: "exp-osei-lic", practitionerId: "prac-osei", kind: "STATE_LICENSE", label: "California medical license", state: "CA", expires: "2027-06-30", onExpiration: "SUSPEND_PRIVILEGES" },
  { id: "exp-osei-acls", practitionerId: "prac-osei", kind: "LIFE_SUPPORT", label: "ACLS certification", expires: "2026-10-15", onExpiration: "SUSPEND_PRIVILEGES" },
  { id: "exp-osei-mal", practitionerId: "prac-osei", kind: "MALPRACTICE", label: "Malpractice policy", expires: "2026-12-31", onExpiration: "SUSPEND_PRIVILEGES" },
  { id: "exp-osei-caqh", practitionerId: "prac-osei", kind: "CAQH_ATTESTATION", label: "CAQH ProView attestation", expires: "2026-09-08", onExpiration: "NOTIFY_ONLY" },

  { id: "exp-whit-lic-nv", practitionerId: "prac-whitfield", kind: "STATE_LICENSE", label: "Nevada APRN license", state: "NV", expires: "2026-10-31", onExpiration: "SUSPEND_PRIVILEGES" },
  { id: "exp-whit-lic-or", practitionerId: "prac-whitfield", kind: "STATE_LICENSE", label: "Oregon NP license", state: "OR", expires: "2026-11-30", onExpiration: "SUSPEND_PRIVILEGES" },
  { id: "exp-whit-lic-ca", practitionerId: "prac-whitfield", kind: "STATE_LICENSE", label: "California NP license", state: "CA", expires: "2027-01-31", onExpiration: "SUSPEND_PRIVILEGES" },
  { id: "exp-whit-agreement", practitionerId: "prac-whitfield", kind: "COLLABORATIVE_AGREEMENT", label: "California collaborative practice agreement", state: "CA", expires: "2026-09-30", onExpiration: "SUSPEND_PRIVILEGES" },
  { id: "exp-whit-caqh", practitionerId: "prac-whitfield", kind: "CAQH_ATTESTATION", label: "CAQH ProView attestation", expires: "2026-08-22", onExpiration: "NOTIFY_ONLY" },

  { id: "exp-chan-visa", practitionerId: "prac-chandran", kind: "VISA", label: "H-1B work authorization", expires: "2027-02-28", onExpiration: "SUSPEND_PRIVILEGES" },

  // Already lapsed: the DEA renewal that nobody chased. Auto-suspension of
  // prescribing has fired, and it is visible on the dashboard as a live issue.
  { id: "exp-marc-dea", practitionerId: "prac-marchetti", kind: "DEA", label: "DEA registration (CA)", state: "CA", expires: "2026-09-30", onExpiration: "SUSPEND_PRESCRIBING" },
  { id: "exp-marc-reappt", practitionerId: "prac-marchetti", kind: "REAPPOINTMENT", label: "Medical staff reappointment (Valley)", expires: "2028-05-14", onExpiration: "SUSPEND_PRIVILEGES" },
  { id: "exp-marc-recred", practitionerId: "prac-marchetti", kind: "RECREDENTIALING", label: "Recredentialing cycle", expires: "2029-05-14", onExpiration: "SUSPEND_BILLING" },
  { id: "exp-marc-board", practitionerId: "prac-marchetti", kind: "BOARD_CERT", label: "ABIM Internal Medicine certification", expires: "2027-12-31", onExpiration: "NOTIFY_ONLY" },

  { id: "exp-baird-temp", practitionerId: "prac-baird", kind: "REAPPOINTMENT", label: "Temporary privileges (Central)", expires: "2026-10-30", onExpiration: "SUSPEND_PRIVILEGES" },
  { id: "exp-baird-mal", practitionerId: "prac-baird", kind: "MALPRACTICE", label: "Agency malpractice certificate", expires: "2026-08-31", onExpiration: "SUSPEND_PRIVILEGES" },
];

export const TASKS: Task[] = [
  { id: "tsk-osei-caselogs", caseId: "case-osei", title: "Obtain catheterization case logs from Pacific Heart Institute", ownerRole: "EXTERNAL_SOURCE", status: "IN_PROGRESS", created: "2026-08-06", due: "2026-08-20", slaDays: 14, remindersSent: 2, milestoneId: "psv_manual" },
  { id: "tsk-osei-adjudicate", caseId: "case-osei", title: "Adjudicate work history date discrepancy (Pacific Heart Institute)", ownerRole: "CREDENTIALING", status: "OPEN", created: "2026-08-11", due: "2026-08-18", slaDays: 5, remindersSent: 1, milestoneId: "psv_manual" },
  { id: "tsk-osei-peer3", caseId: "case-osei", title: "Third peer reference outstanding (Dr. Sana Qureshi)", ownerRole: "EXTERNAL_SOURCE", status: "OPEN", created: "2026-07-15", due: "2026-08-05", slaDays: 21, remindersSent: 3, milestoneId: "peer_refs" },
  { id: "tsk-osei-uhc", caseId: "case-osei", title: "Resend corrected CMS-855R signature page to UnitedHealthcare", ownerRole: "PAYOR_ENROLLMENT", status: "DONE", created: "2026-08-18", due: "2026-08-20", completed: "2026-08-18", slaDays: 2, remindersSent: 0 },
  { id: "tsk-osei-acls", caseId: "case-osei", title: "ACLS expires 2026-10-15 — upload renewal certificate", ownerRole: "CLINICIAN", status: "OPEN", created: "2026-07-17", due: "2026-08-15", slaDays: 14, remindersSent: 2 },

  { id: "tsk-whit-agreement", caseId: "case-whitfield", title: "Collaborative practice agreement — physician signature and CA filing", ownerRole: "CREDENTIALING", status: "BLOCKED", created: "2026-07-05", due: "2026-08-01", slaDays: 14, remindersSent: 4 },
  { id: "tsk-whit-supervisor", caseId: "case-whitfield", title: "Reassign supervising physician — Dr. Lindqvist is at the California cap", ownerRole: "MSO", status: "OPEN", created: "2026-08-10", due: "2026-08-24", slaDays: 10, remindersSent: 1 },
  { id: "tsk-whit-dea-tx", caseId: "case-whitfield", title: "Restrict Texas EHR prescribing to schedules 3–5", ownerRole: "IT", status: "OPEN", created: "2026-08-12", due: "2026-09-01", slaDays: 14, remindersSent: 0 },
  { id: "tsk-whit-contract", caseId: "case-whitfield", title: "Managed care: no commercial contracts under the Virtual Care TIN", ownerRole: "PAYOR_ENROLLMENT", status: "OPEN", created: "2026-07-06", due: "2026-08-06", slaDays: 30, remindersSent: 2 },
  { id: "tsk-whit-licenses", caseId: "case-whitfield", title: "Verify remaining state licenses (WA, AZ, NV)", ownerRole: "CREDENTIALING", status: "IN_PROGRESS", created: "2026-07-09", due: "2026-08-20", slaDays: 21, remindersSent: 1, milestoneId: "psv_manual" },

  { id: "tsk-chan-license", caseId: "case-chandran", title: "California initial licensure application — track board status weekly", ownerRole: "CREDENTIALING", status: "IN_PROGRESS", created: "2026-08-03", due: "2026-10-15", slaDays: 60, remindersSent: 0 },
  { id: "tsk-chan-app", caseId: "case-chandran", title: "Complete unified application and e-sign attestations", ownerRole: "CLINICIAN", status: "OPEN", created: "2026-08-03", due: "2026-08-17", slaDays: 14, remindersSent: 2, milestoneId: "intake" },
  { id: "tsk-chan-ecfmg", caseId: "case-chandran", title: "ECFMG certification verification", ownerRole: "CREDENTIALING", status: "OPEN", created: "2026-08-05", due: "2026-08-26", slaDays: 14, remindersSent: 0 },
  { id: "tsk-chan-visa", caseId: "case-chandran", title: "H-1B expires 2027-02-28 — start extension packet with immigration counsel", ownerRole: "HR", status: "OPEN", created: "2026-08-10", due: "2026-09-30", slaDays: 30, remindersSent: 0 },

  { id: "tsk-marc-uhc", caseId: "case-marchetti", title: "UnitedHealthcare enrollment pending 127 days — escalate to network rep", ownerRole: "PAYOR_ENROLLMENT", status: "IN_PROGRESS", created: "2026-06-12", due: "2026-07-12", slaDays: 21, remindersSent: 5 },
  { id: "tsk-marc-claims", caseId: "case-marchetti", title: "Release held claims under the Medicare retroactive effective date", ownerRole: "PAYOR_ENROLLMENT", status: "OPEN", created: "2026-08-05", due: "2026-08-28", slaDays: 14, remindersSent: 1 },
  { id: "tsk-marc-dea", caseId: "case-marchetti", title: "DEA renewal due 2026-09-30", ownerRole: "CLINICIAN", status: "OPEN", created: "2026-06-02", due: "2026-08-31", slaDays: 30, remindersSent: 3 },
  { id: "tsk-marc-fppe", caseId: "case-marchetti", title: "FPPE chart review 6 of 10 complete", ownerRole: "DEPARTMENT_CHAIR", status: "IN_PROGRESS", created: "2026-06-01", due: "2026-09-12", slaDays: 90, remindersSent: 0 },

  { id: "tsk-baird-fppe", caseId: "case-baird", title: "FPPE proctoring overdue — 1 of 5 cases observed", ownerRole: "DEPARTMENT_CHAIR", status: "OPEN", created: "2026-08-05", due: "2026-08-20", slaDays: 14, remindersSent: 1 },
  { id: "tsk-baird-bridge", caseId: "case-baird", title: "Reciprocal billing bridge ends 2026-10-09 — confirm enrollment path", ownerRole: "REVENUE_CYCLE", status: "OPEN", created: "2026-08-10", due: "2026-09-20", slaDays: 30, remindersSent: 0 },
];

export const AGREEMENTS: CollaborativeAgreement[] = [
  {
    id: "agr-whitfield-ca",
    practitionerId: "prac-whitfield",
    supervisingPhysicianIds: ["prac-lindqvist"],
    alternateIds: [],
    state: "CA",
    scope: "Adult and adolescent primary care, telehealth and in-clinic.",
    chartReviewPercent: 10,
    chartReviewFrequency: "MONTHLY",
    meetingCadence: "MONTHLY",
    effective: "2026-07-01",
    renews: "2026-09-30",
    stateFilingRequired: true,
    signedByApp: "2026-07-01",
    // Unsigned by the physician and unfiled with the state — the APP cannot
    // practice independently in California until both are true (§9).
  },
  // Four other APPs already supervised by Dr. Lindqvist in California, which is
  // the configured cap. Adding Whitfield would exceed it.
  { id: "agr-app-1", practitionerId: "prac-app-1", supervisingPhysicianIds: ["prac-lindqvist"], alternateIds: ["prac-osei"], state: "CA", scope: "Primary care", chartReviewPercent: 10, chartReviewFrequency: "MONTHLY", meetingCadence: "MONTHLY", effective: "2024-01-01", renews: "2027-01-01", stateFilingRequired: true, stateFiledOn: "2024-01-05", signedByApp: "2024-01-01", signedByPhysician: "2024-01-01" },
  { id: "agr-app-2", practitionerId: "prac-app-2", supervisingPhysicianIds: ["prac-lindqvist"], alternateIds: ["prac-osei"], state: "CA", scope: "Primary care", chartReviewPercent: 10, chartReviewFrequency: "MONTHLY", meetingCadence: "MONTHLY", effective: "2024-06-01", renews: "2027-06-01", stateFilingRequired: true, stateFiledOn: "2024-06-04", signedByApp: "2024-06-01", signedByPhysician: "2024-06-01" },
  { id: "agr-app-3", practitionerId: "prac-app-3", supervisingPhysicianIds: ["prac-lindqvist"], alternateIds: ["prac-osei"], state: "CA", scope: "Urgent care", chartReviewPercent: 15, chartReviewFrequency: "MONTHLY", meetingCadence: "QUARTERLY", effective: "2025-02-01", renews: "2028-02-01", stateFilingRequired: true, stateFiledOn: "2025-02-06", signedByApp: "2025-02-01", signedByPhysician: "2025-02-01" },
  { id: "agr-app-4", practitionerId: "prac-app-4", supervisingPhysicianIds: ["prac-lindqvist"], alternateIds: ["prac-osei"], state: "CA", scope: "Primary care", chartReviewPercent: 10, chartReviewFrequency: "MONTHLY", meetingCadence: "MONTHLY", effective: "2025-09-01", renews: "2028-09-01", stateFilingRequired: true, stateFiledOn: "2025-09-03", signedByApp: "2025-09-01", signedByPhysician: "2025-09-01" },
];

export const DOCUMENTS: DocumentRecord[] = [
  { id: "doc-osei-id", practitionerId: "prac-osei", type: "Government photo ID", version: 1, uploaded: "2026-06-25", sourceClass: "SELF_REPORTED", sha256: "a1".repeat(32) },
  { id: "doc-osei-cv", practitionerId: "prac-osei", type: "Curriculum vitae", version: 2, uploaded: "2026-06-25", sourceClass: "SELF_REPORTED", supersedesId: "doc-osei-cv-v1", sha256: "b2".repeat(32) },
  { id: "doc-osei-coi", practitionerId: "prac-osei", type: "Malpractice certificate of insurance", version: 1, uploaded: "2026-07-14", sourceClass: "PRIMARY_SOURCE", expires: "2026-12-31", sha256: "c3".repeat(32) },
  { id: "doc-osei-dea", practitionerId: "prac-osei", type: "DEA registration certificate", version: 1, uploaded: "2026-06-25", sourceClass: "PRIMARY_SOURCE", expires: "2027-03-31", sha256: "d4".repeat(32) },
  { id: "doc-osei-lic", practitionerId: "prac-osei", type: "State license certificate", version: 1, uploaded: "2026-06-25", sourceClass: "PRIMARY_SOURCE", expires: "2027-06-30", sha256: "e5".repeat(32) },
  { id: "doc-osei-board", practitionerId: "prac-osei", type: "Board certificate or eligibility letter", version: 1, uploaded: "2026-06-26", sourceClass: "PRIMARY_SOURCE", sha256: "f6".repeat(32) },
  { id: "doc-osei-w9", practitionerId: "prac-osei", type: "W-9", version: 1, uploaded: "2026-07-02", sourceClass: "SELF_REPORTED", sha256: "17".repeat(32) },
  { id: "doc-whit-id", practitionerId: "prac-whitfield", type: "Government photo ID", version: 1, uploaded: "2026-07-02", sourceClass: "SELF_REPORTED", sha256: "28".repeat(32) },
  { id: "doc-whit-cv", practitionerId: "prac-whitfield", type: "Curriculum vitae", version: 1, uploaded: "2026-07-02", sourceClass: "SELF_REPORTED", sha256: "39".repeat(32) },
  { id: "doc-whit-coi", practitionerId: "prac-whitfield", type: "Malpractice certificate of insurance", version: 1, uploaded: "2026-07-06", sourceClass: "PRIMARY_SOURCE", expires: "2027-06-30", sha256: "4a".repeat(32) },
  { id: "doc-whit-lic", practitionerId: "prac-whitfield", type: "State license certificate", version: 1, uploaded: "2026-07-02", sourceClass: "PRIMARY_SOURCE", expires: "2027-01-31", sha256: "5b".repeat(32) },
  { id: "doc-whit-board", practitionerId: "prac-whitfield", type: "Board certificate or eligibility letter", version: 1, uploaded: "2026-07-04", sourceClass: "PRIMARY_SOURCE", expires: "2028-06-30", sha256: "6c".repeat(32) },
];

export const ADVERSE_ACTIONS: AdverseAction[] = [
  {
    id: "adv-osei-1",
    practitionerId: "prac-osei",
    kind: "MALPRACTICE_CLAIM",
    occurred: "2022-05-14",
    description: "Claim alleging delayed diagnosis of aortic dissection; dismissed on summary judgment in 2023 with no payment.",
    disposition: "Dismissed, no payment",
    paymentAmount: 0,
    selfDisclosed: true,
    discoveredByVerification: true,
    npdbReportable: false,
  },
];

/** Verified evidence for the privilege criteria engine, per request. */
export const CREDENTIAL_EVIDENCE: Record<string, CredentialEvidence> = {
  "prv-osei": {
    boardCertified: true,
    residencyCompleted: "2018-06-30",
    trainingCompleted: ["Cardiovascular Disease Fellowship", "Advanced Echocardiography"],
    activeLicenseStates: ["CA"],
    deaActiveStates: ["CA"],
    lifeSupportHeld: ["ACLS", "BLS"],
    volumes: {
      "priv-cardio-tee": { cases: 82, lastPerformed: "2026-04-18" },
      "priv-cardio-cath": { cases: 61, lastPerformed: "2026-03-02" },
      "priv-cardio-sedation": { cases: 210, lastPerformed: "2026-04-30" },
      "priv-cardio-tavr": { cases: 6, lastPerformed: "2025-02-11" },
    },
    facilityState: "CA",
  },
  "prv-whitfield": {
    boardCertified: true,
    trainingCompleted: ["MSN Family Nurse Practitioner"],
    activeLicenseStates: ["CA", "TX", "OR", "WA", "AZ", "NV"],
    deaActiveStates: ["CA", "TX"],
    lifeSupportHeld: ["BLS"],
    volumes: { "priv-ahp-joint": { cases: 12, lastPerformed: "2026-05-02" } },
    facilityState: "CA",
  },
  "prv-marchetti": {
    boardCertified: true,
    residencyCompleted: "2014-06-30",
    trainingCompleted: ["Internal Medicine Residency"],
    activeLicenseStates: ["CA"],
    deaActiveStates: ["CA"],
    lifeSupportHeld: ["ACLS", "BLS"],
    volumes: { "priv-hosp-core": { cases: 480, lastPerformed: "2026-08-20" } },
    facilityState: "CA",
  },
  "prv-baird": {
    boardCertified: true,
    residencyCompleted: "2006-06-30",
    trainingCompleted: ["Internal Medicine Residency"],
    activeLicenseStates: ["CA"],
    deaActiveStates: ["CA"],
    lifeSupportHeld: ["ACLS", "BLS"],
    volumes: { "priv-hosp-core": { cases: 900, lastPerformed: "2026-08-22" } },
    facilityState: "CA",
  },
};

/** Fact bags for the §10 rules engine, per case. */
export const CASE_FACTS: Record<string, FactBag> = {
  "case-osei": {
    deaVerified: true,
    stateCdsVerified: true,
    epcsIdentityProofed: false,
    epcsTwoFactorEnrolled: false,
    locationMatchesDeaAddress: true,
    licenseActiveInFacilityState: true,
    ehrProviderRecordCreated: false,
    privilegesGranted: false,
    malpracticeCoverageActive: true,
    payorEffectiveDateOnFile: false,
    payorApprovalInWriting: false,
    serviceDateOnOrAfterEffective: false,
    psvComplete: false,
    psvStaleCount: 0,
    unadjudicatedFindings: 2,
    peerReferencesReceived: 2,
    backgroundCheckCleared: true,
    i9Complete: true,
    occHealthCleared: true,
    scopeRuleConfigured: true,
    agreementExecuted: true,
    supervisorUnderCapacityCap: true,
    visaDaysRemaining: 9999,
  },
  "case-whitfield": {
    deaVerified: true,
    stateCdsVerified: false,
    epcsIdentityProofed: false,
    epcsTwoFactorEnrolled: false,
    locationMatchesDeaAddress: true,
    licenseActiveInFacilityState: true,
    ehrProviderRecordCreated: false,
    privilegesGranted: false,
    malpracticeCoverageActive: true,
    payorEffectiveDateOnFile: false,
    payorApprovalInWriting: false,
    serviceDateOnOrAfterEffective: false,
    psvComplete: false,
    psvStaleCount: 0,
    unadjudicatedFindings: 0,
    peerReferencesReceived: 1,
    backgroundCheckCleared: true,
    i9Complete: true,
    occHealthCleared: false,
    scopeRuleConfigured: true,
    agreementExecuted: false,
    supervisorUnderCapacityCap: false,
    visaDaysRemaining: 9999,
  },
  "case-chandran": {
    deaVerified: false,
    stateCdsVerified: false,
    epcsIdentityProofed: false,
    epcsTwoFactorEnrolled: false,
    locationMatchesDeaAddress: false,
    licenseActiveInFacilityState: false,
    ehrProviderRecordCreated: false,
    privilegesGranted: false,
    malpracticeCoverageActive: false,
    payorEffectiveDateOnFile: false,
    payorApprovalInWriting: false,
    serviceDateOnOrAfterEffective: false,
    psvComplete: false,
    psvStaleCount: 0,
    unadjudicatedFindings: 0,
    peerReferencesReceived: 0,
    backgroundCheckCleared: false,
    i9Complete: false,
    occHealthCleared: false,
    scopeRuleConfigured: true,
    agreementExecuted: true,
    supervisorUnderCapacityCap: true,
    visaDaysRemaining: 89,
  },
  "case-marchetti": {
    deaVerified: true,
    stateCdsVerified: true,
    epcsIdentityProofed: true,
    epcsTwoFactorEnrolled: true,
    locationMatchesDeaAddress: true,
    licenseActiveInFacilityState: true,
    ehrProviderRecordCreated: true,
    privilegesGranted: true,
    malpracticeCoverageActive: true,
    payorEffectiveDateOnFile: true,
    payorApprovalInWriting: true,
    serviceDateOnOrAfterEffective: true,
    psvComplete: true,
    psvStaleCount: 0,
    unadjudicatedFindings: 0,
    peerReferencesReceived: 3,
    backgroundCheckCleared: true,
    i9Complete: true,
    occHealthCleared: true,
    scopeRuleConfigured: true,
    agreementExecuted: true,
    supervisorUnderCapacityCap: true,
    visaDaysRemaining: 9999,
  },
  "case-baird": {
    deaVerified: true,
    stateCdsVerified: true,
    epcsIdentityProofed: false,
    epcsTwoFactorEnrolled: false,
    locationMatchesDeaAddress: true,
    licenseActiveInFacilityState: true,
    ehrProviderRecordCreated: true,
    privilegesGranted: true,
    malpracticeCoverageActive: true,
    payorEffectiveDateOnFile: false,
    payorApprovalInWriting: false,
    serviceDateOnOrAfterEffective: false,
    psvComplete: false,
    psvStaleCount: 0,
    unadjudicatedFindings: 0,
    peerReferencesReceived: 2,
    backgroundCheckCleared: true,
    i9Complete: true,
    occHealthCleared: true,
    scopeRuleConfigured: true,
    agreementExecuted: true,
    supervisorUnderCapacityCap: true,
    visaDaysRemaining: 9999,
  },
};

/**
 * Claims held during credentialing (§4.7). Marchetti started 2026-06-01 but the
 * payors became effective on different dates — which is the whole point of
 * tracking a first billable date per payor rather than one per clinician.
 */
export const HELD_CLAIMS: HeldClaim[] = [
  { id: "clm-1001", practitionerId: "prac-marchetti", payorId: "pay-medicare", payorProductId: "prod-medicare-b", organizationId: "org-nsmg", locationId: "loc-valley", serviceDate: "2026-06-02", amount: 1840 },
  { id: "clm-1002", practitionerId: "prac-marchetti", payorId: "pay-medicare", payorProductId: "prod-medicare-b", organizationId: "org-nsmg", locationId: "loc-valley", serviceDate: "2026-06-09", amount: 2260 },
  { id: "clm-1003", practitionerId: "prac-marchetti", payorId: "pay-medicare", payorProductId: "prod-medicare-b", organizationId: "org-nsmg", locationId: "loc-valley", serviceDate: "2026-05-28", amount: 1190 },
  { id: "clm-1010", practitionerId: "prac-marchetti", payorId: "pay-bcbs", payorProductId: "prod-bcbs-ppo", organizationId: "org-nsmg", locationId: "loc-valley", serviceDate: "2026-06-15", amount: 3120 },
  { id: "clm-1011", practitionerId: "prac-marchetti", payorId: "pay-bcbs", payorProductId: "prod-bcbs-ppo", organizationId: "org-nsmg", locationId: "loc-valley", serviceDate: "2026-08-06", amount: 2480 },
  { id: "clm-1020", practitionerId: "prac-marchetti", payorId: "pay-united", payorProductId: "prod-united-ppo", organizationId: "org-nsmg", locationId: "loc-valley", serviceDate: "2026-06-04", amount: 4310 },
  { id: "clm-1021", practitionerId: "prac-marchetti", payorId: "pay-united", payorProductId: "prod-united-ppo", organizationId: "org-nsmg", locationId: "loc-valley", serviceDate: "2026-07-11", amount: 3890 },
  { id: "clm-1022", practitionerId: "prac-marchetti", payorId: "pay-united", payorProductId: "prod-united-ppo", organizationId: "org-nsmg", locationId: "loc-valley", serviceDate: "2026-08-14", amount: 2740 },
  { id: "clm-1030", practitionerId: "prac-marchetti", payorId: "pay-medi-cal", payorProductId: "prod-medi-cal", organizationId: "org-nsmg", locationId: "loc-valley", serviceDate: "2026-07-20", amount: 960 },
];

/** Payor filing limits in days from date of service. */
export const FILING_LIMITS = {
  byPayorId: {
    "pay-medicare": 365,
    "pay-bcbs": 90,
    // UnitedHealthcare runs a 60-day filing limit here, which is why one of
    // Marchetti's held claims has already aged past recovery (§4.7).
    "pay-united": 60,
    "pay-medi-cal": 180,
    "pay-healthnet": 180,
    "pay-aetna-ma": 120,
  },
  default: 90,
};

/** Declared hospital affiliations and named peers, per practitioner (§5, §6). */
export const HOSPITAL_AFFILIATIONS: Record<string, string[]> = {
  "prac-osei": ["Pacific Heart Institute"],
  "prac-whitfield": [],
  "prac-chandran": ["Valley Regional Medical Center"],
  "prac-marchetti": ["Northstar Foothill Hospital", "Mercy General Hospital"],
  "prac-baird": ["Sacramento County Hospital", "Redding Medical Center"],
};

export const PEER_REFERENCES: Record<string, string[]> = {
  "prac-osei": ["Dr. Marcus Feld", "Dr. Lian Park", "Dr. Sana Qureshi"],
  "prac-whitfield": ["Dr. Ingrid Lindqvist", "Dana Ruiz, FNP", "Dr. Paul Okoye"],
  "prac-chandran": ["Dr. Hannah Kroll", "Dr. Ana Beltran", "Dr. Yusuf Aziz"],
  "prac-marchetti": ["Dr. Ingrid Lindqvist", "Dr. Sam Whitaker", "Dr. Priya Nair"],
  "prac-baird": ["Dr. Rex Halloran", "Dr. Ana Beltran", "Dr. Priya Nair"],
};

/** Documented independent practice hours, for state transition-to-practice rules (§9). */
export const PRACTICE_HOURS: Record<string, number> = {
  "prac-whitfield": 9200,
};

export const BRIDGES: Record<string, BridgeArrangement> = {
  "case-baird": {
    kind: "RECIPROCAL_BILLING",
    modifier: "Q6",
    regularPhysicianNpi: "1558842203",
    substituteNpi: "1667723310",
    start: "2026-08-10",
    maxContinuousDays: 60,
  },
};
