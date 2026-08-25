/**
 * Field-level RBAC (§2, §14).
 *
 * "RBAC must be field-level, not just screen-level. Sensitive data (malpractice
 * claim detail, NPDB reports, health attestations, SSN, DOB) must be restricted
 * to specific roles and separately audited on read."
 *
 * Screen-level RBAC fails here because the same *case screen* is used by a
 * recruiter, a credentialing specialist and an auditor, and they may not see the
 * same fields on it. So redaction happens on the record, on the way out, and
 * reading a sensitive field is itself an auditable event.
 */

export type Role =
  | "CLINICIAN"
  | "RECRUITER"
  | "CREDENTIALING"
  | "PAYOR_ENROLLMENT"
  | "MSO"
  | "DEPARTMENT_CHAIR"
  | "COMMITTEE"
  | "HR"
  | "IT"
  | "REVENUE_CYCLE"
  | "COMPLIANCE"
  | "PRACTICE_MANAGER"
  | "SYSTEM_ADMIN"
  | "AUDITOR";

export const ROLE_LABELS: Record<Role, string> = {
  CLINICIAN: "Clinician (applicant)",
  RECRUITER: "Recruiter / Provider Relations",
  CREDENTIALING: "Credentialing Specialist / CVO",
  PAYOR_ENROLLMENT: "Payor Enrollment Specialist",
  MSO: "Medical Staff Office",
  DEPARTMENT_CHAIR: "Department Chair / Service Line Chief",
  COMMITTEE: "Credentials Committee / MEC / Board",
  HR: "HR / HRIS",
  IT: "IT Provisioning",
  REVENUE_CYCLE: "Revenue Cycle",
  COMPLIANCE: "Compliance / Legal",
  PRACTICE_MANAGER: "Practice / Clinic Manager",
  SYSTEM_ADMIN: "System Admin",
  AUDITOR: "Auditor (read-only)",
};

export type Sensitivity = "NORMAL" | "SENSITIVE" | "RESTRICTED";

export interface FieldPolicy {
  field: string;
  sensitivity: Sensitivity;
  read: Role[];
  write: Role[];
  /** Sensitive reads are logged individually, not just as a record view (§2). */
  auditOnRead: boolean;
}

/**
 * The policy table. Anything not listed defaults to NORMAL and is readable by
 * staff roles — an allow-list on sensitive fields is the part that matters, and
 * keeping the table short keeps it reviewable by the compliance owner.
 */
export const FIELD_POLICIES: readonly FieldPolicy[] = [
  { field: "practitioner.ssnLast4", sensitivity: "RESTRICTED", read: ["CREDENTIALING", "HR", "COMPLIANCE"], write: ["HR"], auditOnRead: true },
  { field: "practitioner.dateOfBirth", sensitivity: "RESTRICTED", read: ["CREDENTIALING", "HR", "COMPLIANCE", "PAYOR_ENROLLMENT"], write: ["HR", "CREDENTIALING"], auditOnRead: true },
  { field: "practitioner.workAuthorization", sensitivity: "SENSITIVE", read: ["HR", "CREDENTIALING", "COMPLIANCE"], write: ["HR"], auditOnRead: true },
  { field: "adverseAction.description", sensitivity: "RESTRICTED", read: ["CREDENTIALING", "MSO", "COMMITTEE", "DEPARTMENT_CHAIR", "COMPLIANCE"], write: ["CREDENTIALING"], auditOnRead: true },
  { field: "adverseAction.paymentAmount", sensitivity: "RESTRICTED", read: ["CREDENTIALING", "COMMITTEE", "COMPLIANCE"], write: ["CREDENTIALING"], auditOnRead: true },
  { field: "verification.npdbReport", sensitivity: "RESTRICTED", read: ["CREDENTIALING", "MSO", "COMMITTEE", "COMPLIANCE"], write: ["CREDENTIALING"], auditOnRead: true },
  { field: "disclosure.health_condition", sensitivity: "RESTRICTED", read: ["MSO", "COMMITTEE", "COMPLIANCE"], write: ["CLINICIAN"], auditOnRead: true },
  { field: "disclosure.substance_use", sensitivity: "RESTRICTED", read: ["MSO", "COMMITTEE", "COMPLIANCE"], write: ["CLINICIAN"], auditOnRead: true },
  { field: "banking.eft", sensitivity: "RESTRICTED", read: ["PAYOR_ENROLLMENT", "COMPLIANCE"], write: ["PAYOR_ENROLLMENT"], auditOnRead: true },
  { field: "peerReview.case", sensitivity: "RESTRICTED", read: ["MSO", "COMMITTEE", "DEPARTMENT_CHAIR"], write: ["MSO"], auditOnRead: true },
  { field: "malpractice.claimDetail", sensitivity: "RESTRICTED", read: ["CREDENTIALING", "MSO", "COMMITTEE", "COMPLIANCE"], write: ["CREDENTIALING"], auditOnRead: true },
];

const STAFF_ROLES: Role[] = [
  "RECRUITER",
  "CREDENTIALING",
  "PAYOR_ENROLLMENT",
  "MSO",
  "DEPARTMENT_CHAIR",
  "COMMITTEE",
  "HR",
  "IT",
  "REVENUE_CYCLE",
  "COMPLIANCE",
  "PRACTICE_MANAGER",
  "SYSTEM_ADMIN",
  "AUDITOR",
];

export function policyFor(field: string): FieldPolicy {
  return (
    FIELD_POLICIES.find((p) => p.field === field) ?? {
      field,
      sensitivity: "NORMAL",
      read: [...STAFF_ROLES, "CLINICIAN"],
      write: [...STAFF_ROLES],
      auditOnRead: false,
    }
  );
}

export function canRead(role: Role, field: string): boolean {
  // The auditor sees everything and changes nothing — that is the point of the
  // role, and it is the one place a blanket read grant is correct.
  if (role === "AUDITOR") return true;
  return policyFor(field).read.includes(role);
}

export function canWrite(role: Role, field: string): boolean {
  if (role === "AUDITOR") return false;
  return policyFor(field).write.includes(role);
}

export interface RedactionResult<T> {
  value: Partial<T>;
  redactedFields: string[];
  /** Sensitive fields actually read — the caller must write these to the audit log. */
  sensitiveReads: string[];
}

/**
 * Redact a record for a role. `prefix` names the entity so policy lookups match
 * the dotted field keys above (e.g. redact(practitioner, role, "practitioner")).
 */
export function redact<T extends Record<string, unknown>>(
  record: T,
  role: Role,
  prefix: string,
): RedactionResult<T> {
  const value: Partial<T> = {};
  const redactedFields: string[] = [];
  const sensitiveReads: string[] = [];

  for (const key of Object.keys(record) as (keyof T & string)[]) {
    const field = `${prefix}.${key}`;
    if (canRead(role, field)) {
      value[key] = record[key];
      if (policyFor(field).auditOnRead) sensitiveReads.push(field);
    } else {
      redactedFields.push(field);
    }
  }

  return { value, redactedFields, sensitiveReads };
}

/**
 * §8.3: the committee packet is "redacted per role". A department chair reviewing
 * competence does not need banking detail; a payor enrollment specialist does not
 * need the peer review case file.
 */
export function packetSections(role: Role): { section: string; included: boolean; reason?: string }[] {
  const sections: { section: string; field: string }[] = [
    { section: "Application & work history", field: "application.summary" },
    { section: "Verification summary", field: "verification.summary" },
    { section: "Malpractice claims detail", field: "malpractice.claimDetail" },
    { section: "NPDB report", field: "verification.npdbReport" },
    { section: "Health & substance attestations", field: "disclosure.health_condition" },
    { section: "Peer references", field: "peerReference.summary" },
    { section: "Privilege request & criteria findings", field: "privileges.summary" },
    { section: "Peer review cases", field: "peerReview.case" },
  ];
  return sections.map(({ section, field }) => {
    const included = canRead(role, field);
    return included
      ? { section, included }
      : { section, included, reason: `Restricted from ${ROLE_LABELS[role]} by field policy` };
  });
}
