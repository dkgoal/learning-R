/**
 * Advanced Practice Provider requirements (§9).
 *
 * "APPs are not 'physicians with fewer fields.'" The three things that actually
 * differ and that a physician-shaped model gets wrong:
 *
 *  - A collaborative/supervisory agreement is a first-class object with its own
 *    signatures, renewal date and state filing — not a checkbox.
 *  - Supervising physicians have **capacity limits** that many states cap by
 *    statute. Enforcing the cap requires knowing every APP that physician already
 *    supervises, which only a system with the golden record can do.
 *  - Billing may run incident-to, split/shared, or under the APP's own NPI, and
 *    the choice is constrained by payor, setting and documentation.
 */

import { daysBetween, type IsoDate } from "./dates";
import { scopeRuleFor, supervisionCapFor, type ScopeRule, type TenantConfig } from "./config";
import type { CollaborativeAgreement, Id, Payor, Practitioner, PractitionerType } from "./types";
import { isApp } from "./types";

export interface SupervisionCapacity {
  supervisingPhysicianId: Id;
  state: string;
  cap: number | null;
  currentCount: number;
  atCapacity: boolean;
  overCapacity: boolean;
  remaining: number | null;
  message: string;
}

/**
 * §9: "Track supervising physician capacity limits — many states cap the number
 * of APPs a physician may supervise. The system must enforce and alert on this."
 */
export function checkSupervisionCapacity(
  config: TenantConfig,
  supervisingPhysicianId: Id,
  state: string,
  agreements: readonly CollaborativeAgreement[],
  /** The APP about to be added, excluded from the current count. */
  candidateAppId?: Id,
): SupervisionCapacity {
  const cap = supervisionCapFor(config, state);
  const supervised = new Set(
    agreements
      .filter(
        (a) =>
          a.state === state &&
          a.supervisingPhysicianIds.includes(supervisingPhysicianId) &&
          a.practitionerId !== candidateAppId,
      )
      .map((a) => a.practitionerId),
  );
  const currentCount = supervised.size;
  const prospective = currentCount + (candidateAppId ? 1 : 0);

  if (cap === null) {
    return {
      supervisingPhysicianId,
      state,
      cap: null,
      currentCount,
      atCapacity: false,
      overCapacity: false,
      remaining: null,
      message: `No configured supervision cap for ${state}; verify against current state statute before relying on this.`,
    };
  }

  return {
    supervisingPhysicianId,
    state,
    cap,
    currentCount,
    atCapacity: prospective === cap,
    overCapacity: prospective > cap,
    remaining: Math.max(0, cap - prospective),
    message:
      prospective > cap
        ? `Adding this APP would put the physician at ${prospective} of a ${cap}-APP limit in ${state}. Assign a different supervising physician.`
        : prospective === cap
          ? `This assignment reaches the ${state} limit of ${cap} APPs for this physician.`
          : `${prospective} of ${cap} APPs supervised in ${state}.`,
  };
}

export interface ScopeAssessment {
  state: string;
  appType: PractitionerType;
  rule: ScopeRule | null;
  agreementRequired: boolean;
  agreementSatisfied: boolean;
  prescriptiveAuthority: boolean;
  permittedSchedules: string[];
  /** Schedules on the DEA registration that the state does not permit this type. */
  schedulesExceedingScope: string[];
  transitionHoursRequired: number | null;
  problems: string[];
}

/** §9 state scope-of-practice rules engine: full / reduced / restricted. */
export function assessScopeOfPractice(
  config: TenantConfig,
  practitioner: Practitioner,
  state: string,
  agreement: CollaborativeAgreement | undefined,
  deaSchedules: readonly string[] = [],
  documentedPracticeHours = 0,
): ScopeAssessment {
  const rule = scopeRuleFor(config, state, practitioner.type);
  const problems: string[] = [];

  if (!isApp(practitioner.type)) {
    return {
      state,
      appType: practitioner.type,
      rule: null,
      agreementRequired: false,
      agreementSatisfied: true,
      prescriptiveAuthority: true,
      permittedSchedules: [...deaSchedules],
      schedulesExceedingScope: [],
      transitionHoursRequired: null,
      problems: [],
    };
  }

  if (!rule) {
    problems.push(
      `No scope-of-practice rule configured for ${practitioner.type} in ${state}. Configure before privileging or enrolling in this state.`,
    );
    return {
      state,
      appType: practitioner.type,
      rule: null,
      agreementRequired: true,
      agreementSatisfied: false,
      prescriptiveAuthority: false,
      permittedSchedules: [],
      schedulesExceedingScope: [...deaSchedules],
      transitionHoursRequired: null,
      problems,
    };
  }

  const agreementSatisfied = !rule.agreementRequired || agreementIsValid(agreement, state).valid;
  if (rule.agreementRequired && !agreementSatisfied) {
    problems.push(
      `${state} is a ${rule.authority.toLowerCase()}-practice state for ${practitioner.type}s: a valid, fully executed agreement is required before independent practice.`,
    );
  }

  const schedulesExceedingScope = deaSchedules.filter(
    (s) => !rule.controlledSubstanceSchedules.includes(s),
  );
  if (schedulesExceedingScope.length > 0) {
    problems.push(
      `DEA registration includes schedule(s) ${schedulesExceedingScope.join(", ")} that ${state} does not permit a ${practitioner.type} to prescribe. EHR prescribing configuration must restrict them.`,
    );
  }

  if (rule.transitionHours && documentedPracticeHours < rule.transitionHours) {
    problems.push(
      `${state} requires ${rule.transitionHours} documented transition-to-practice hours; ${documentedPracticeHours} on file.`,
    );
  }

  return {
    state,
    appType: practitioner.type,
    rule,
    agreementRequired: rule.agreementRequired,
    agreementSatisfied,
    prescriptiveAuthority: rule.prescriptiveAuthority,
    permittedSchedules: [...rule.controlledSubstanceSchedules],
    schedulesExceedingScope,
    transitionHoursRequired: rule.transitionHours ?? null,
    problems,
  };
}

export interface AgreementValidity {
  valid: boolean;
  problems: string[];
  daysToRenewal: number | null;
}

export function agreementIsValid(
  agreement: CollaborativeAgreement | undefined,
  expectedState?: string,
  today?: IsoDate,
): AgreementValidity {
  if (!agreement) {
    return { valid: false, problems: ["No collaborative/supervisory agreement on file."], daysToRenewal: null };
  }
  const problems: string[] = [];
  if (expectedState && agreement.state !== expectedState) {
    problems.push(`Agreement is filed for ${agreement.state}, not ${expectedState}.`);
  }
  if (agreement.supervisingPhysicianIds.length === 0) {
    problems.push("No supervising/collaborating physician named.");
  }
  if (agreement.alternateIds.length === 0) {
    problems.push("No alternate named — coverage lapses when the primary is unavailable.");
  }
  if (!agreement.signedByApp) problems.push("Not signed by the APP.");
  if (!agreement.signedByPhysician) problems.push("Not signed by the supervising physician.");
  if (agreement.stateFilingRequired && !agreement.stateFiledOn) {
    problems.push(`${agreement.state} requires the agreement to be filed with the state; no filing date recorded.`);
  }
  if (agreement.chartReviewPercent <= 0) {
    problems.push("Chart review percentage not specified.");
  }
  const daysToRenewal = today ? daysBetween(today, agreement.renews) : null;
  if (daysToRenewal !== null && daysToRenewal < 0) {
    problems.push(`Agreement lapsed on ${agreement.renews}.`);
  }
  return { valid: problems.length === 0, problems, daysToRenewal };
}

export type BillingModel = "DIRECT_OWN_NPI" | "INCIDENT_TO" | "SPLIT_SHARED" | "UNDER_SUPERVISING_PHYSICIAN";

export interface BillingModelAssessment {
  model: BillingModel;
  rationale: string;
  documentationRequirements: string[];
  /** True when the payor will not credential this APP type at all (§7, §9). */
  forcedBySupervisorRequirement: boolean;
}

/**
 * §9: "Flag when a payor does not credential a given APP type and requires
 * billing under the supervising physician." That flag has to reach revenue cycle
 * *before* the first claim, not after the first denial.
 */
export function determineBillingModel(
  practitioner: Practitioner,
  payor: Payor,
  setting: "OFFICE" | "FACILITY",
  supervisingPhysicianPresent: boolean,
): BillingModelAssessment {
  if (!isApp(practitioner.type)) {
    return {
      model: "DIRECT_OWN_NPI",
      rationale: "Physician bills under their own NPI.",
      documentationRequirements: [],
      forcedBySupervisorRequirement: false,
    };
  }

  if (!payor.credentialsAppTypes.includes(practitioner.type)) {
    return {
      model: "UNDER_SUPERVISING_PHYSICIAN",
      rationale: `${payor.name} does not credential ${practitioner.type}s; services must be billed under the supervising physician.`,
      documentationRequirements: [
        "Supervising physician of record documented on every encounter",
        "Supervision requirements per the payor's policy met and documented",
      ],
      forcedBySupervisorRequirement: true,
    };
  }

  if (setting === "FACILITY") {
    return {
      model: "SPLIT_SHARED",
      rationale:
        "Facility setting: a shared visit may be billed under the physician when they perform a substantive portion, otherwise under the APP's own NPI.",
      documentationRequirements: [
        "Substantive portion documented and attributed",
        "Both practitioners identified in the note",
        "Same group, same patient, same calendar date",
      ],
      forcedBySupervisorRequirement: false,
    };
  }

  if (supervisingPhysicianPresent) {
    return {
      model: "INCIDENT_TO",
      rationale:
        "Office setting with direct physician supervision available and an established plan of care.",
      documentationRequirements: [
        "Physician established the plan of care for the presenting problem",
        "Physician present in the office suite and immediately available",
        "No new problem addressed during the visit",
        "Supervising physician identified in the record",
      ],
      forcedBySupervisorRequirement: false,
    };
  }

  return {
    model: "DIRECT_OWN_NPI",
    rationale: "Payor credentials this APP type and no physician supervision is present for the encounter.",
    documentationRequirements: ["APP's own NPI on the claim", "Scope-of-practice limits observed"],
    forcedBySupervisorRequirement: false,
  };
}

/** §9: co-signature requirements route into the EHR configuration. */
export interface CoSignatureConfig {
  required: boolean;
  percentOfCharts: number;
  frequency: CollaborativeAgreement["chartReviewFrequency"];
  ehrRule: string;
}

export function coSignatureConfig(
  scope: ScopeAssessment,
  agreement: CollaborativeAgreement | undefined,
): CoSignatureConfig {
  const required = scope.agreementRequired && Boolean(agreement);
  const percent = agreement?.chartReviewPercent ?? 0;
  return {
    required,
    percentOfCharts: percent,
    frequency: agreement?.chartReviewFrequency ?? "MONTHLY",
    ehrRule: required
      ? `Route ${percent}% of encounters to the supervising physician's co-sign queue, sampled ${(agreement?.chartReviewFrequency ?? "MONTHLY").toLowerCase()}.`
      : "No co-signature routing required in this state for this APP type.",
  };
}
