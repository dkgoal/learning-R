/**
 * Declarative gating rules engine (§10).
 *
 * "Rules engine for gating logic, expressed declaratively and editable by admins
 * without code (e.g., 'EPCS provisioning requires: DEA verified AND state CDS
 * verified AND EPCS identity proofing complete AND location matches DEA
 * registered address')."
 *
 * Rules are data. They evaluate against a flat fact bag assembled from the case,
 * and an unmet rule reports *which* condition failed and what the actual value
 * was — a gate that only says "blocked" moves the work from the system to a
 * phone call.
 */

export type FactValue = string | number | boolean | string[] | null | undefined;
export type FactBag = Record<string, FactValue>;

export type ConditionOperator =
  | "IS_TRUE"
  | "IS_FALSE"
  | "EQUALS"
  | "NOT_EQUALS"
  | "GTE"
  | "LTE"
  | "INCLUDES"
  | "IS_PRESENT";

export interface Condition {
  fact: string;
  operator: ConditionOperator;
  value?: string | number | boolean;
  /** Human-readable form shown in the admin rule editor and on the gate. */
  label: string;
}

export interface Rule {
  id: string;
  name: string;
  /** What this rule gates — an action, a provisioning step, a status change. */
  gates: string;
  description: string;
  /** Every condition must hold. */
  all: Condition[];
  /** At least one must hold, when present. */
  any?: Condition[];
  severity: "BLOCKING" | "WARNING";
}

export interface ConditionResult {
  condition: Condition;
  met: boolean;
  actual: FactValue;
  explanation: string;
}

export interface RuleResult {
  rule: Rule;
  satisfied: boolean;
  conditions: ConditionResult[];
  unmet: ConditionResult[];
  /** One-line reason for the UI when the gate is closed. */
  summary: string;
}

export function evaluateCondition(condition: Condition, facts: FactBag): ConditionResult {
  const actual = facts[condition.fact];
  let met = false;

  switch (condition.operator) {
    case "IS_TRUE":
      met = actual === true;
      break;
    case "IS_FALSE":
      met = actual === false;
      break;
    case "EQUALS":
      met = actual === condition.value;
      break;
    case "NOT_EQUALS":
      met = actual !== condition.value;
      break;
    case "GTE":
      met = typeof actual === "number" && typeof condition.value === "number" && actual >= condition.value;
      break;
    case "LTE":
      met = typeof actual === "number" && typeof condition.value === "number" && actual <= condition.value;
      break;
    case "INCLUDES":
      met = Array.isArray(actual) && actual.includes(String(condition.value));
      break;
    case "IS_PRESENT":
      met = actual !== null && actual !== undefined && actual !== "";
      break;
  }

  return {
    condition,
    met,
    actual: actual ?? null,
    explanation: met
      ? condition.label
      : `${condition.label} — currently ${formatFact(actual)}`,
  };
}

function formatFact(value: FactValue): string {
  if (value === undefined || value === null) return "not recorded";
  if (Array.isArray(value)) return value.length === 0 ? "empty" : value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function evaluateRule(rule: Rule, facts: FactBag): RuleResult {
  const allResults = rule.all.map((c) => evaluateCondition(c, facts));
  const anyResults = (rule.any ?? []).map((c) => evaluateCondition(c, facts));
  const anySatisfied = anyResults.length === 0 || anyResults.some((r) => r.met);
  const conditions = [...allResults, ...anyResults];
  const unmet = [
    ...allResults.filter((r) => !r.met),
    ...(anySatisfied ? [] : anyResults),
  ];
  const satisfied = allResults.every((r) => r.met) && anySatisfied;
  return {
    rule,
    satisfied,
    conditions,
    unmet,
    summary: satisfied
      ? `${rule.name}: all conditions met.`
      : `${rule.name}: blocked by ${unmet.length} condition${unmet.length === 1 ? "" : "s"} — ${unmet.map((u) => u.condition.label).join("; ")}`,
  };
}

export function evaluateRules(rules: readonly Rule[], facts: FactBag): RuleResult[] {
  return rules.map((r) => evaluateRule(r, facts));
}

/** Rules gating a specific action; blocking failures stop it, warnings do not. */
export function gateFor(
  rules: readonly Rule[],
  gates: string,
  facts: FactBag,
): { allowed: boolean; blocking: RuleResult[]; warnings: RuleResult[] } {
  const applicable = rules.filter((r) => r.gates === gates);
  const results = evaluateRules(applicable, facts);
  const failed = results.filter((r) => !r.satisfied);
  return {
    allowed: failed.every((r) => r.rule.severity !== "BLOCKING"),
    blocking: failed.filter((r) => r.rule.severity === "BLOCKING"),
    warnings: failed.filter((r) => r.rule.severity === "WARNING"),
  };
}

/**
 * Shipped defaults. These are seed configuration an admin edits — including the
 * EPCS example named verbatim in §10, and the §4.6 requirement that provisioning
 * be dependency-gated rather than fired on a start date.
 */
export const DEFAULT_RULES: Rule[] = [
  {
    id: "rule-epcs",
    name: "EPCS prescribing activation",
    gates: "PROVISION_EPCS",
    description:
      "Electronic prescribing of controlled substances may not be enabled until the DEA registration, state CDS registration, identity proofing and registered address all line up for the location.",
    severity: "BLOCKING",
    all: [
      { fact: "deaVerified", operator: "IS_TRUE", label: "DEA registration verified from primary source" },
      { fact: "stateCdsVerified", operator: "IS_TRUE", label: "State controlled substance registration verified" },
      { fact: "epcsIdentityProofed", operator: "IS_TRUE", label: "EPCS identity proofing complete" },
      { fact: "epcsTwoFactorEnrolled", operator: "IS_TRUE", label: "Two-factor authentication enrolled" },
      { fact: "locationMatchesDeaAddress", operator: "IS_TRUE", label: "Practice location matches the DEA registered address" },
    ],
  },
  {
    id: "rule-ehr-prescribing",
    name: "EHR prescribing rights",
    gates: "PROVISION_EHR_PRESCRIBING",
    description: "General prescribing rights require an active license in the facility's state.",
    severity: "BLOCKING",
    all: [
      { fact: "licenseActiveInFacilityState", operator: "IS_TRUE", label: "Active license in the facility's state" },
      { fact: "ehrProviderRecordCreated", operator: "IS_TRUE", label: "EHR provider record created" },
    ],
  },
  {
    id: "rule-schedule-build",
    name: "Schedule template activation",
    gates: "ACTIVATE_SCHEDULE",
    description:
      "A clinic template should not go live before privileges are granted; scheduling patients against ungranted privileges is how facilities end up cancelling clinics.",
    severity: "BLOCKING",
    all: [
      { fact: "privilegesGranted", operator: "IS_TRUE", label: "Privileges granted by the governing board" },
      { fact: "ehrProviderRecordCreated", operator: "IS_TRUE", label: "EHR provider record created" },
      { fact: "malpracticeCoverageActive", operator: "IS_TRUE", label: "Malpractice coverage active at this location" },
    ],
  },
  {
    id: "rule-billing-release",
    name: "Billing hold release",
    gates: "RELEASE_BILLING",
    description:
      "Claims release per payor, on that payor's written effective date — never on the employment start date.",
    severity: "BLOCKING",
    all: [
      { fact: "payorEffectiveDateOnFile", operator: "IS_TRUE", label: "Payor effective date of record captured" },
      { fact: "payorApprovalInWriting", operator: "IS_TRUE", label: "Written payor approval stored" },
      { fact: "serviceDateOnOrAfterEffective", operator: "IS_TRUE", label: "Service date is on or after the effective date" },
    ],
  },
  {
    id: "rule-app-independent-practice",
    name: "APP independent practice",
    gates: "APP_PRACTICE",
    description:
      "In reduced and restricted states an APP may not practice before a fully executed, state-filed agreement is in place.",
    severity: "BLOCKING",
    all: [
      { fact: "scopeRuleConfigured", operator: "IS_TRUE", label: "State scope-of-practice rule configured" },
      { fact: "agreementExecuted", operator: "IS_TRUE", label: "Collaborative/supervisory agreement fully executed" },
      { fact: "supervisorUnderCapacityCap", operator: "IS_TRUE", label: "Supervising physician is under the state capacity cap" },
    ],
  },
  {
    id: "rule-committee-packet",
    name: "Committee packet release",
    gates: "SUBMIT_TO_COMMITTEE",
    description:
      "A file goes to committee only when the PSV set is complete, current against the decision date, and free of unadjudicated findings.",
    severity: "BLOCKING",
    all: [
      { fact: "psvComplete", operator: "IS_TRUE", label: "All required verifications complete" },
      { fact: "psvStaleCount", operator: "LTE", value: 0, label: "No verification stale at the decision date" },
      { fact: "unadjudicatedFindings", operator: "LTE", value: 0, label: "No unadjudicated discrepancies or adverse findings" },
      { fact: "peerReferencesReceived", operator: "GTE", value: 3, label: "Minimum peer references received" },
    ],
  },
  {
    id: "rule-badge",
    name: "Badge and network access",
    gates: "PROVISION_ACCESS",
    description: "Physical and network access follow HR clearance, not the credentialing file.",
    severity: "BLOCKING",
    all: [
      { fact: "backgroundCheckCleared", operator: "IS_TRUE", label: "Background check cleared" },
      { fact: "i9Complete", operator: "IS_TRUE", label: "I-9 complete" },
      { fact: "occHealthCleared", operator: "IS_TRUE", label: "Occupational health cleared" },
    ],
  },
  {
    id: "rule-visa-window",
    name: "Work authorization runway",
    gates: "PROVISION_ACCESS",
    description:
      "A visa expiring inside the first 90 days is a warning, not a block — but it must be visible before the start date, not after.",
    severity: "WARNING",
    all: [{ fact: "visaDaysRemaining", operator: "GTE", value: 90, label: "At least 90 days of work authorization remaining" }],
  },
];
