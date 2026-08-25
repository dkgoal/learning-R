/**
 * The onboarding milestone graph (§3 "Onboarding Milestone / Gate — with
 * dependency edges", §4).
 *
 * Two things make this graph worth having rather than a checklist:
 *
 *  1. The payor track and the privileging track run *in parallel* off a shared
 *     verification layer (§4.4). Modeling them as one sequence is the mistake
 *     that produces 6-month onboardings.
 *  2. The two tracks end at *different* gates. Privileging and HR gate the
 *     start date; payor effective dates gate the first billable encounter.
 *     Conflating them hides the revenue leak described in §4.7.
 *
 * Durations are the planning defaults an admin edits; they are inputs to
 * `planTimeline`, never assertions about a specific case.
 */

export type Track = "HR" | "CREDENTIALING" | "PAYOR" | "PRIVILEGING" | "PROVISIONING";

/** Which terminal date a milestone is planned backward from. */
export type Gate = "START_DATE" | "FIRST_BILLABLE";

export interface MilestoneDef {
  id: string;
  label: string;
  track: Track;
  /** Planning duration in calendar days. */
  durationDays: number;
  dependsOn: string[];
  /** Set on terminal milestones only; interior ones inherit from successors. */
  gate?: Gate;
  /** Who the clock is waiting on — drives bottleneck attribution (§13). */
  waitingOn: "INTERNAL" | "CLINICIAN" | "EXTERNAL_SOURCE" | "PAYOR" | "COMMITTEE";
}

export const DEFAULT_MILESTONES: MilestoneDef[] = [
  {
    id: "initiation",
    label: "Case initiated from HRIS/ATS",
    track: "HR",
    durationDays: 2,
    dependsOn: [],
    waitingOn: "INTERNAL",
  },
  {
    id: "intake",
    label: "Application complete & attested",
    track: "CREDENTIALING",
    durationDays: 21,
    dependsOn: ["initiation"],
    waitingOn: "CLINICIAN",
  },
  {
    id: "psv_auto",
    label: "Automated PSV (NPPES, NPDB, OIG, SAM, boards, DEA)",
    track: "CREDENTIALING",
    durationDays: 5,
    dependsOn: ["intake"],
    waitingOn: "INTERNAL",
  },
  {
    id: "psv_manual",
    label: "Manual PSV (work history, affiliations, training)",
    track: "CREDENTIALING",
    durationDays: 45,
    dependsOn: ["intake"],
    waitingOn: "EXTERNAL_SOURCE",
  },
  {
    id: "peer_refs",
    label: "Peer references returned",
    track: "CREDENTIALING",
    durationDays: 30,
    dependsOn: ["intake"],
    waitingOn: "EXTERNAL_SOURCE",
  },
  {
    id: "file_complete",
    label: "Credentialing file assembled",
    track: "CREDENTIALING",
    durationDays: 3,
    dependsOn: ["psv_auto", "psv_manual", "peer_refs"],
    waitingOn: "INTERNAL",
  },
  {
    id: "payor_submission",
    label: "Payor applications / roster adds submitted",
    track: "PAYOR",
    durationDays: 5,
    dependsOn: ["file_complete"],
    waitingOn: "INTERNAL",
  },
  {
    id: "payor_effective",
    label: "Payor effective dates confirmed",
    track: "PAYOR",
    durationDays: 120,
    dependsOn: ["payor_submission"],
    gate: "FIRST_BILLABLE",
    waitingOn: "PAYOR",
  },
  {
    id: "dept_chair",
    label: "Department chair review & privilege recommendation",
    track: "PRIVILEGING",
    durationDays: 7,
    dependsOn: ["file_complete"],
    waitingOn: "COMMITTEE",
  },
  {
    id: "credentials_committee",
    label: "Credentials committee",
    track: "PRIVILEGING",
    durationDays: 14,
    dependsOn: ["dept_chair"],
    waitingOn: "COMMITTEE",
  },
  {
    id: "mec",
    label: "Medical Executive Committee",
    track: "PRIVILEGING",
    durationDays: 14,
    dependsOn: ["credentials_committee"],
    waitingOn: "COMMITTEE",
  },
  {
    id: "board",
    label: "Governing board appointment",
    track: "PRIVILEGING",
    durationDays: 14,
    dependsOn: ["mec"],
    waitingOn: "COMMITTEE",
  },
  {
    id: "hr_onboarding",
    label: "HR: I-9, background check, occupational health",
    track: "HR",
    durationDays: 21,
    dependsOn: ["initiation"],
    waitingOn: "CLINICIAN",
  },
  {
    id: "provisioning",
    label: "EHR, EPCS, SSO, badge provisioning",
    track: "PROVISIONING",
    durationDays: 10,
    dependsOn: ["board", "hr_onboarding"],
    waitingOn: "INTERNAL",
  },
  {
    id: "schedule_build",
    label: "Schedule template build & clinic go-live",
    track: "PROVISIONING",
    durationDays: 14,
    dependsOn: ["provisioning"],
    gate: "START_DATE",
    waitingOn: "INTERNAL",
  },
];

/**
 * §15.5: a locum tenens clinician works under temporary privileges and may never
 * be fully credentialed. Planning them against the full graph reports a start
 * date that is "98 days late" for someone who is already seeing patients — the
 * graph is wrong for them, not the start date. This is the shorter track:
 * abbreviated verification, temporary privileges, and Medicare-only enrollment
 * bridged by a reciprocal billing arrangement.
 */
export const LOCUM_MILESTONES: MilestoneDef[] = [
  { id: "initiation", label: "Locum assignment confirmed", track: "HR", durationDays: 2, dependsOn: [], waitingOn: "INTERNAL" },
  { id: "intake", label: "Abbreviated application & attestations", track: "CREDENTIALING", durationDays: 7, dependsOn: ["initiation"], waitingOn: "CLINICIAN" },
  { id: "psv_auto", label: "Automated PSV (license, DEA, NPDB, exclusions)", track: "CREDENTIALING", durationDays: 5, dependsOn: ["intake"], waitingOn: "INTERNAL" },
  { id: "temp_privileges", label: "Temporary privileges granted", track: "PRIVILEGING", durationDays: 5, dependsOn: ["psv_auto"], waitingOn: "COMMITTEE" },
  { id: "hr_onboarding", label: "Agency paperwork, badge, occupational health", track: "HR", durationDays: 7, dependsOn: ["initiation"], waitingOn: "CLINICIAN" },
  { id: "provisioning", label: "EHR and access provisioning", track: "PROVISIONING", durationDays: 5, dependsOn: ["temp_privileges", "hr_onboarding"], gate: "START_DATE", waitingOn: "INTERNAL" },
  { id: "payor_submission", label: "Medicare enrollment submitted", track: "PAYOR", durationDays: 5, dependsOn: ["psv_auto"], waitingOn: "INTERNAL" },
  { id: "payor_effective", label: "Medicare effective date confirmed", track: "PAYOR", durationDays: 60, dependsOn: ["payor_submission"], gate: "FIRST_BILLABLE", waitingOn: "PAYOR" },
];
