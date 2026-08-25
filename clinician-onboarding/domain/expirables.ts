/**
 * Expirables engine (§10) and the monitoring side of §11.
 *
 * "Every dated credential generates renewal tasks at configurable lead times
 * (commonly 120/90/60/30/14/7/0 days), with auto-suspension actions defined at
 * expiration."
 *
 * The engine is pure and takes `today` as an argument. That is not fastidiousness:
 * the suspension consequences here are consequential enough that an auditor will
 * ask what the system believed on a given date, and a function that reads the
 * clock internally cannot answer.
 */

import { addDays, addMonths, daysBetween, type IsoDate } from "./dates";
import type { TenantConfig } from "./config";
import type { Expirable, Id, Task } from "./types";

export type ExpirableStatus = "CURRENT" | "UPCOMING" | "URGENT" | "DUE_TODAY" | "LAPSED";

export interface ExpirableView {
  expirable: Expirable;
  daysRemaining: number;
  status: ExpirableStatus;
  /** The lead-time threshold currently crossed, if any (120, 90, 60 …). */
  leadThreshold: number | null;
  /** True once the expiration action has fired. */
  actionFired: boolean;
  action: Expirable["onExpiration"];
}

export function evaluateExpirable(
  config: TenantConfig,
  today: IsoDate,
  expirable: Expirable,
): ExpirableView {
  const daysRemaining = daysBetween(today, expirable.expires);
  const leads = [...config.expirableLeadDays].sort((a, b) => a - b);
  const leadThreshold =
    daysRemaining < 0 ? null : (leads.find((l) => daysRemaining <= l) ?? null);

  let status: ExpirableStatus;
  if (daysRemaining < 0) status = "LAPSED";
  else if (daysRemaining === 0) status = "DUE_TODAY";
  else if (daysRemaining <= 30) status = "URGENT";
  else if (leadThreshold !== null) status = "UPCOMING";
  else status = "CURRENT";

  return {
    expirable,
    daysRemaining,
    status,
    leadThreshold,
    actionFired: daysRemaining < 0 && expirable.onExpiration !== "NOTIFY_ONLY",
    action: expirable.onExpiration,
  };
}

export function evaluateExpirables(
  config: TenantConfig,
  today: IsoDate,
  expirables: readonly Expirable[],
): ExpirableView[] {
  return expirables
    .map((e) => evaluateExpirable(config, today, e))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export interface ExpirablesDashboard {
  lapsed: ExpirableView[];
  within30: ExpirableView[];
  within60: ExpirableView[];
  within90: ExpirableView[];
  beyond90: ExpirableView[];
  /** Suspensions that have already fired and need release before the clinician works. */
  activeSuspensions: ExpirableView[];
}

/** §13 "Expirables dashboard with 30/60/90-day horizon and lapsed items". */
export function expirablesDashboard(
  config: TenantConfig,
  today: IsoDate,
  expirables: readonly Expirable[],
): ExpirablesDashboard {
  const views = evaluateExpirables(config, today, expirables);
  const inWindow = (v: ExpirableView, lo: number, hi: number) =>
    v.daysRemaining >= lo && v.daysRemaining <= hi;
  return {
    lapsed: views.filter((v) => v.daysRemaining < 0),
    within30: views.filter((v) => inWindow(v, 0, 30)),
    within60: views.filter((v) => inWindow(v, 31, 60)),
    within90: views.filter((v) => inWindow(v, 61, 90)),
    beyond90: views.filter((v) => v.daysRemaining > 90),
    activeSuspensions: views.filter((v) => v.actionFired),
  };
}

/**
 * Renewal tasks at each configured lead time. Generating the whole ladder up
 * front (rather than one reminder at a time) means the schedule is inspectable:
 * a specialist can see that the 90-day nudge exists before it fires.
 */
export function renewalTasks(
  config: TenantConfig,
  expirable: Expirable,
  caseId: Id,
  ownerRole: Task["ownerRole"] = "CREDENTIALING",
): Task[] {
  return [...config.expirableLeadDays]
    .sort((a, b) => b - a)
    .map((lead) => {
      const due = addDays(expirable.expires, -lead);
      return {
        id: `${expirable.id}-renew-${lead}`,
        caseId,
        title:
          lead === 0
            ? `${expirable.label} expires today — ${describeAction(expirable.onExpiration)}`
            : `Renew ${expirable.label} (${lead}-day notice)`,
        ownerRole,
        status: "OPEN",
        created: due,
        due,
        slaDays: lead === 0 ? 0 : Math.min(lead, 14),
        remindersSent: 0,
      } satisfies Task;
    });
}

function describeAction(action: Expirable["onExpiration"]): string {
  switch (action) {
    case "SUSPEND_PRIVILEGES":
      return "privileges will be suspended";
    case "SUSPEND_PRESCRIBING":
      return "prescribing rights will be suspended";
    case "SUSPEND_BILLING":
      return "billing will be held";
    case "NOTIFY_ONLY":
      return "notification only";
  }
}

// ---------------------------------------------------------------------------
// Derived cycle expirables (§11)
// ---------------------------------------------------------------------------

/**
 * Recredentialing (commonly 36 months) and reappointment (commonly 24 months)
 * are separate cycles for the same person. §11 asks the system to *reconcile*
 * them so the re-verification effort is shared rather than duplicated: when the
 * two land within the reconciliation window, run one verification pass.
 */
export interface CycleReconciliation {
  practitionerId: Id;
  recredentialingDue: IsoDate;
  reappointmentDue: IsoDate;
  gapDays: number;
  /** True when one verification pass can serve both cycles. */
  canShareVerification: boolean;
  /** The earlier of the two — when the shared pass must be ready. */
  sharedVerificationBy: IsoDate;
}

export function reconcileCycles(
  config: TenantConfig,
  practitionerId: Id,
  lastCredentialed: IsoDate,
  lastAppointed: IsoDate,
  reconciliationWindowDays = 90,
): CycleReconciliation {
  const recredentialingDue = addMonths(lastCredentialed, config.cycles.recredentialingMonths);
  const reappointmentDue = addMonths(lastAppointed, config.cycles.reappointmentMonths);
  const gapDays = Math.abs(daysBetween(recredentialingDue, reappointmentDue));
  const sharedVerificationBy =
    daysBetween(recredentialingDue, reappointmentDue) < 0 ? reappointmentDue : recredentialingDue;
  return {
    practitionerId,
    recredentialingDue,
    reappointmentDue,
    gapDays,
    canShareVerification: gapDays <= reconciliationWindowDays,
    sharedVerificationBy,
  };
}

/** §8.5: reappointment kicks off 120–180 days before term expiration. */
export function reappointmentInitiationDate(termExpires: IsoDate, leadDays = 150): IsoDate {
  return addDays(termExpires, -leadDays);
}

/** §7.3 / §11: CAQH attestation must be refreshed every 120 days. */
export function caqhAttestationDue(config: TenantConfig, lastAttested: IsoDate): IsoDate {
  return addDays(lastAttested, config.cycles.caqhAttestationDays);
}
