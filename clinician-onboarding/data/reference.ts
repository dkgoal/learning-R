/**
 * Reference data: the organization's own configuration — legal entities,
 * facilities, locations, the payor matrix, contracts, and the DOP library.
 *
 * In a deployment this is tenant configuration loaded from the database. Keeping
 * it in one module makes the §7.1 point concrete: the required payor set for any
 * clinician is *derivable* from these tables plus the clinician's locations, so
 * nobody has to remember it.
 */

import type {
  Facility,
  Organization,
  Payor,
  PayorContract,
  PayorProduct,
  PracticeLocation,
  Privilege,
  PrivilegeSet,
} from "@/domain/types";

export const ORGANIZATIONS: Organization[] = [
  { id: "org-nsmg", name: "Northstar Medical Group", tin: "471234567", npiType2: "1477882345" },
  // A newly formed TIN for the virtual care line — contracted with Medicare only,
  // which is what makes the telehealth case in the seed data interesting (§7.5).
  { id: "org-nsvc", name: "Northstar Virtual Care", tin: "883344556", npiType2: "1902334455" },
];

export const FACILITIES: Facility[] = [
  { id: "fac-central", name: "Northstar Central Hospital", organizationId: "org-nsmg", state: "CA", bylawsId: "bylaws-central-2024", accreditor: "JOINT_COMMISSION" },
  { id: "fac-valley", name: "Northstar Valley Hospital", organizationId: "org-nsmg", state: "CA", bylawsId: "bylaws-valley-2023", accreditor: "JOINT_COMMISSION" },
];

export const LOCATIONS: PracticeLocation[] = [
  { id: "loc-cardio", name: "Central Cardiology Clinic", organizationId: "org-nsmg", facilityId: "fac-central", address: "1400 Bayshore Ave, Oakland, CA", state: "CA", acceptingNewPatients: true, adaAccessible: true },
  { id: "loc-valley", name: "Valley Primary Care", organizationId: "org-nsmg", facilityId: "fac-valley", address: "88 Orchard Rd, Modesto, CA", state: "CA", acceptingNewPatients: true, adaAccessible: true },
  { id: "loc-virtual-ca", name: "Northstar Virtual Care — California", organizationId: "org-nsvc", address: "Virtual (CA)", state: "CA", acceptingNewPatients: true, adaAccessible: true },
  { id: "loc-virtual-tx", name: "Northstar Virtual Care — Texas", organizationId: "org-nsvc", address: "Virtual (TX)", state: "TX", acceptingNewPatients: true, adaAccessible: true },
];

export const PAYORS: Payor[] = [
  {
    id: "pay-medicare",
    name: "Medicare (Noridian JE)",
    program: "MEDICARE",
    submissionChannel: "PECOS",
    typicalTurnaroundDays: 60,
    credentialsAppTypes: ["MD", "DO", "NP", "PA", "CRNA", "CNM", "PSYCHOLOGIST", "OTHER_LIP"],
  },
  {
    id: "pay-medi-cal",
    name: "Medi-Cal (California Medicaid)",
    program: "MEDICAID",
    submissionChannel: "PORTAL",
    typicalTurnaroundDays: 120,
    credentialsAppTypes: ["MD", "DO", "NP", "PA", "CNM", "PSYCHOLOGIST"],
  },
  {
    id: "pay-bcbs",
    name: "Blue Shield of California",
    program: "COMMERCIAL",
    submissionChannel: "AVAILITY",
    typicalTurnaroundDays: 90,
    credentialsAppTypes: ["MD", "DO", "NP", "PA", "CRNA", "CNM", "PSYCHOLOGIST"],
  },
  {
    id: "pay-united",
    name: "UnitedHealthcare",
    program: "COMMERCIAL",
    submissionChannel: "PORTAL",
    typicalTurnaroundDays: 120,
    // §9: a payor that does not credential NPs or PAs directly. Services must be
    // billed under the supervising physician, and revenue cycle needs to know.
    credentialsAppTypes: ["MD", "DO", "CRNA", "PSYCHOLOGIST"],
  },
  {
    id: "pay-aetna-ma",
    name: "Aetna Medicare Advantage",
    program: "MEDICARE_ADVANTAGE",
    parentProgram: "MEDICARE",
    submissionChannel: "PORTAL",
    typicalTurnaroundDays: 75,
    credentialsAppTypes: ["MD", "DO", "NP", "PA"],
  },
  {
    id: "pay-healthnet",
    name: "Health Net Medi-Cal Managed Care",
    program: "MEDICAID_MCO",
    parentProgram: "MEDICAID",
    submissionChannel: "ROSTER",
    typicalTurnaroundDays: 45,
    credentialsAppTypes: ["MD", "DO", "NP", "PA", "CNM"],
  },
];

export const PAYOR_PRODUCTS: PayorProduct[] = [
  { id: "prod-medicare-b", payorId: "pay-medicare", name: "Medicare Part B", network: "PPO", states: ["CA", "OR", "TX", "WA", "AZ", "NV"] },
  { id: "prod-medi-cal", payorId: "pay-medi-cal", name: "Medi-Cal Fee-for-Service", network: "MEDICAID_MCO", states: ["CA"] },
  { id: "prod-bcbs-ppo", payorId: "pay-bcbs", name: "Blue Shield PPO", network: "PPO", states: ["CA"] },
  { id: "prod-bcbs-hmo", payorId: "pay-bcbs", name: "Blue Shield HMO", network: "HMO", states: ["CA"] },
  { id: "prod-united-ppo", payorId: "pay-united", name: "UHC Choice Plus PPO", network: "PPO", states: ["CA", "TX"] },
  { id: "prod-aetna-ma", payorId: "pay-aetna-ma", name: "Aetna Medicare Advantage PPO", network: "MA", states: ["CA"] },
  { id: "prod-healthnet-mcal", payorId: "pay-healthnet", name: "Health Net Medi-Cal HMO", network: "MEDICAID_MCO", states: ["CA"] },
];

export const PAYOR_CONTRACTS: PayorContract[] = [
  { id: "ct-nsmg-medicare", organizationId: "org-nsmg", payorId: "pay-medicare", productIds: ["prod-medicare-b"], effective: "2019-01-01", delegated: false },
  { id: "ct-nsmg-medical", organizationId: "org-nsmg", payorId: "pay-medi-cal", productIds: ["prod-medi-cal"], effective: "2019-01-01", delegated: false },
  { id: "ct-nsmg-bcbs", organizationId: "org-nsmg", payorId: "pay-bcbs", productIds: ["prod-bcbs-ppo", "prod-bcbs-hmo"], effective: "2020-07-01", delegated: false },
  { id: "ct-nsmg-united", organizationId: "org-nsmg", payorId: "pay-united", productIds: ["prod-united-ppo"], effective: "2021-04-01", delegated: false },
  { id: "ct-nsmg-aetna", organizationId: "org-nsmg", payorId: "pay-aetna-ma", productIds: ["prod-aetna-ma"], effective: "2022-01-01", delegated: false },
  // The one delegated agreement: we roster, we get audited, we owe a monthly file (§7.4).
  { id: "ct-nsmg-healthnet", organizationId: "org-nsmg", payorId: "pay-healthnet", productIds: ["prod-healthnet-mcal"], effective: "2023-01-01", delegated: true, rosterCadenceDays: 30 },
  // Northstar Virtual Care is a new TIN: Medicare only. Every commercial product
  // at a virtual location therefore raises a NO_CONTRACT blocker (§7.5).
  { id: "ct-nsvc-medicare", organizationId: "org-nsvc", payorId: "pay-medicare", productIds: ["prod-medicare-b"], effective: "2025-10-01", delegated: false },
];

// ---------------------------------------------------------------------------
// Delineation of privileges library (§8.2)
// ---------------------------------------------------------------------------

export const PRIVILEGE_SETS: PrivilegeSet[] = [
  { id: "ps-cardiology", name: "Cardiovascular Disease — Delineation of Privileges", specialty: "Cardiology", department: "Medicine", version: "3.2", effective: "2025-01-01", appliesTo: ["MD", "DO"] },
  { id: "ps-ahp-primary", name: "Allied Health — Primary Care APP Privileges", specialty: "Primary Care", department: "Ambulatory", version: "1.4", effective: "2025-06-01", appliesTo: ["NP", "PA"] },
  { id: "ps-hospitalist", name: "Hospital Medicine — Delineation of Privileges", specialty: "Hospital Medicine", department: "Medicine", version: "2.1", effective: "2024-09-01", appliesTo: ["MD", "DO"] },
];

export const PRIVILEGES: Privilege[] = [
  {
    id: "priv-cardio-core",
    privilegeSetId: "ps-cardiology",
    name: "Core cardiovascular disease privileges",
    kind: "CORE",
    criteria: [
      { kind: "LICENSE_ACTIVE", label: "Active license in the facility's state" },
      { kind: "TRAINING_COMPLETED", label: "Completed accredited cardiovascular disease fellowship", detail: "Cardiovascular Disease Fellowship" },
      { kind: "BOARD_ELIGIBLE_WINDOW", label: "Board certified, or eligible within 60 months of residency completion", value: 60 },
    ],
  },
  {
    id: "priv-cardio-tee",
    privilegeSetId: "ps-cardiology",
    name: "Transesophageal echocardiography",
    kind: "SPECIAL",
    criteria: [
      { kind: "TRAINING_COMPLETED", label: "Advanced echocardiography training", detail: "Advanced Echocardiography" },
      { kind: "MIN_VOLUME", label: "Minimum 50 TEE studies", value: 50 },
      { kind: "CURRENT_ACTIVITY", label: "Activity within the last 24 months", value: 24 },
    ],
  },
  {
    id: "priv-cardio-cath",
    privilegeSetId: "ps-cardiology",
    name: "Diagnostic cardiac catheterization",
    kind: "SPECIAL",
    criteria: [
      { kind: "TRAINING_COMPLETED", label: "Interventional cardiology training", detail: "Interventional Cardiology Fellowship" },
      { kind: "MIN_VOLUME", label: "Minimum 100 diagnostic catheterizations", value: 100 },
      { kind: "CURRENT_ACTIVITY", label: "Activity within the last 12 months", value: 12 },
      { kind: "BOARD_CERTIFIED", label: "Board certified in cardiovascular disease" },
    ],
  },
  {
    id: "priv-cardio-sedation",
    privilegeSetId: "ps-cardiology",
    name: "Moderate sedation",
    kind: "SPECIAL",
    criteria: [
      { kind: "LIFE_SUPPORT", label: "Current ACLS certification", detail: "ACLS" },
      { kind: "CURRENT_ACTIVITY", label: "Activity within the last 24 months", value: 24 },
    ],
  },
  {
    id: "priv-cardio-tavr",
    privilegeSetId: "ps-cardiology",
    name: "Structural heart intervention (TAVR)",
    kind: "SPECIAL",
    criteria: [
      { kind: "BOARD_CERTIFIED", label: "Board certified in cardiovascular disease" },
      { kind: "TRAINING_COMPLETED", label: "Structural heart fellowship or documented equivalent", detail: "Structural Heart Fellowship" },
      { kind: "MIN_VOLUME", label: "Minimum 25 structural cases", value: 25 },
      { kind: "CURRENT_ACTIVITY", label: "Activity within the last 12 months", value: 12 },
    ],
  },
  {
    id: "priv-ahp-core",
    privilegeSetId: "ps-ahp-primary",
    name: "Core primary care privileges (APP)",
    kind: "CORE",
    criteria: [
      { kind: "LICENSE_ACTIVE", label: "Active license in the facility's state" },
      { kind: "BOARD_CERTIFIED", label: "National certification current (AANP/ANCC/NCCPA)" },
    ],
  },
  {
    id: "priv-ahp-prescribe",
    privilegeSetId: "ps-ahp-primary",
    name: "Prescriptive authority including controlled substances",
    kind: "SPECIAL",
    criteria: [
      { kind: "DEA_ACTIVE", label: "DEA registration active for the facility's state" },
      { kind: "LICENSE_ACTIVE", label: "Active license in the facility's state" },
    ],
  },
  {
    id: "priv-ahp-joint",
    privilegeSetId: "ps-ahp-primary",
    name: "Joint injections",
    kind: "SPECIAL",
    criteria: [
      { kind: "MIN_VOLUME", label: "Minimum 25 supervised procedures", value: 25 },
      { kind: "CURRENT_ACTIVITY", label: "Activity within the last 24 months", value: 24 },
    ],
  },
  {
    id: "priv-hosp-core",
    privilegeSetId: "ps-hospitalist",
    name: "Core hospital medicine privileges",
    kind: "CORE",
    criteria: [
      { kind: "LICENSE_ACTIVE", label: "Active license in the facility's state" },
      { kind: "BOARD_ELIGIBLE_WINDOW", label: "Board certified, or eligible within 60 months", value: 60 },
      { kind: "LIFE_SUPPORT", label: "Current ACLS certification", detail: "ACLS" },
    ],
  },
];

export const REQUIRED_DOCUMENT_TYPES = [
  "Government photo ID",
  "Curriculum vitae",
  "Malpractice certificate of insurance",
  "DEA registration certificate",
  "State license certificate",
  "Board certificate or eligibility letter",
  "W-9",
  "Signed CMS-855R",
];
