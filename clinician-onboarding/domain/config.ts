/**
 * Tenant / facility configuration (§1).
 *
 * The requirements are explicit that none of this may be hardcoded: cycle
 * lengths, accreditor, delegation posture and CVO model differ per tenant and
 * change over time. Every engine in /domain takes config as an argument rather
 * than importing a constant, so a tenant can be reconfigured without a deploy —
 * and so a file can prove *which* rule set was applied when (§6).
 */

import type { Accreditor, PractitionerType } from "./types";

export type OrganizationType =
  | "HEALTH_SYSTEM"
  | "HOSPITAL"
  | "MEDICAL_GROUP"
  | "IPA"
  | "FQHC"
  | "ASC"
  | "TELEHEALTH"
  | "STAFFING";

export type CvoModel = "INTERNAL" | "OUTSOURCED" | "HYBRID";

export interface TenantConfig {
  id: string;
  name: string;
  organizationType: OrganizationType;
  accreditor: Accreditor;
  cvoModel: CvoModel;
  /** §1: cycle lengths are configuration, not constants. */
  cycles: {
    recredentialingMonths: number;
    reappointmentMonths: number;
    medicareRevalidationMonths: number;
    caqhAttestationDays: number;
    /** Most standards require PSV within this window of the decision (§4.3). */
    psvValidityDays: number;
  };
  /** Expirable reminder lead times in days (§10). */
  expirableLeadDays: number[];
  /** Minimum peer references and the policy constraints on who may serve (§4.3). */
  peerReferences: {
    minimum: number;
    sameSpecialtyRequired: boolean;
    excludeRelatives: boolean;
    excludePartners: boolean;
  };
  /** Statutory / policy cap on APPs per supervising physician, by state (§9). */
  appSupervisionCaps: Record<string, number>;
  /** Scope of practice by state and APP type (§9). */
  scopeOfPractice: ScopeRule[];
  states: string[];
  quietHours: { start: string; end: string };
}

export interface ScopeRule {
  state: string;
  appType: PractitionerType;
  authority: "FULL" | "REDUCED" | "RESTRICTED";
  /** Written collaborative/supervisory agreement required to practice. */
  agreementRequired: boolean;
  prescriptiveAuthority: boolean;
  /** DEA schedules the APP type may prescribe in this state. */
  controlledSubstanceSchedules: string[];
  /** Transition-to-practice hours before independent practice, if any. */
  transitionHours?: number;
}

export const DEFAULT_TENANT: TenantConfig = {
  id: "tenant-northstar",
  name: "Northstar Health",
  organizationType: "HEALTH_SYSTEM",
  accreditor: "JOINT_COMMISSION",
  cvoModel: "HYBRID",
  cycles: {
    recredentialingMonths: 36,
    reappointmentMonths: 24,
    medicareRevalidationMonths: 60,
    caqhAttestationDays: 120,
    psvValidityDays: 180,
  },
  expirableLeadDays: [120, 90, 60, 30, 14, 7, 0],
  peerReferences: {
    minimum: 3,
    sameSpecialtyRequired: true,
    excludeRelatives: true,
    excludePartners: true,
  },
  appSupervisionCaps: { CA: 4, TX: 7, AZ: 6, NV: 3, OR: 6, WA: 10 },
  scopeOfPractice: [
    { state: "OR", appType: "NP", authority: "FULL", agreementRequired: false, prescriptiveAuthority: true, controlledSubstanceSchedules: ["2", "3", "4", "5"] },
    { state: "WA", appType: "NP", authority: "FULL", agreementRequired: false, prescriptiveAuthority: true, controlledSubstanceSchedules: ["2", "3", "4", "5"] },
    { state: "AZ", appType: "NP", authority: "FULL", agreementRequired: false, prescriptiveAuthority: true, controlledSubstanceSchedules: ["2", "3", "4", "5"] },
    { state: "CA", appType: "NP", authority: "REDUCED", agreementRequired: true, prescriptiveAuthority: true, controlledSubstanceSchedules: ["3", "4", "5"], transitionHours: 4600 },
    { state: "TX", appType: "NP", authority: "RESTRICTED", agreementRequired: true, prescriptiveAuthority: true, controlledSubstanceSchedules: ["3", "4", "5"] },
    { state: "NV", appType: "NP", authority: "FULL", agreementRequired: false, prescriptiveAuthority: true, controlledSubstanceSchedules: ["2", "3", "4", "5"] },
    { state: "CA", appType: "PA", authority: "RESTRICTED", agreementRequired: true, prescriptiveAuthority: true, controlledSubstanceSchedules: ["3", "4", "5"] },
    { state: "TX", appType: "PA", authority: "RESTRICTED", agreementRequired: true, prescriptiveAuthority: true, controlledSubstanceSchedules: ["3", "4", "5"] },
    { state: "OR", appType: "PA", authority: "REDUCED", agreementRequired: true, prescriptiveAuthority: true, controlledSubstanceSchedules: ["2", "3", "4", "5"] },
    { state: "CA", appType: "CRNA", authority: "REDUCED", agreementRequired: true, prescriptiveAuthority: true, controlledSubstanceSchedules: ["2", "3", "4", "5"] },
  ],
  states: ["CA", "OR", "WA", "AZ", "NV", "TX"],
  quietHours: { start: "21:00", end: "07:00" },
};

export function scopeRuleFor(
  config: TenantConfig,
  state: string,
  appType: PractitionerType,
): ScopeRule | null {
  return (
    config.scopeOfPractice.find((r) => r.state === state && r.appType === appType) ?? null
  );
}

export function supervisionCapFor(config: TenantConfig, state: string): number | null {
  return config.appSupervisionCaps[state] ?? null;
}
