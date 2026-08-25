/**
 * Seed audit log.
 *
 * Built by folding `append` over a list of events so the chain hashes are real:
 * the integrity check on the audit page verifies this log rather than asserting
 * it is fine. Includes READ entries on sensitive fields, because §2 requires
 * knowing who looked, not only who changed.
 */

import { append, type AuditEntry, type AuditLog, type NewAuditEntry } from "@/domain/audit";

const EVENTS: NewAuditEntry[] = [
  { id: "aud-001", at: "2026-05-22T14:02:00Z", occurredOn: "2026-05-22", actorId: "user-recruit-1", actorRole: "RECRUITER", action: "CREATE", entity: "onboardingCase", entityId: "case-osei", after: { stage: "INITIATION", startDate: "2026-10-05", employmentType: "EMPLOYED" }, sensitive: false, reason: "Offer accepted event received from ATS" },
  { id: "aud-002", at: "2026-05-22T14:02:01Z", occurredOn: "2026-05-22", actorId: "system", actorRole: "SYSTEM_ADMIN", action: "CREATE", entity: "practitioner", entityId: "prac-osei", after: { legalLastName: "Osei", type: "MD", primarySpecialty: "Cardiovascular Disease" }, sensitive: false, reason: "Golden record created from NPPES lookup" },
  { id: "aud-003", at: "2026-06-25T17:42:11Z", occurredOn: "2026-06-25", actorId: "prac-osei", actorRole: "CLINICIAN", action: "UPDATE", entity: "onboardingCase", entityId: "case-osei", field: "attestation", after: { signedAt: "2026-06-25T17:42:11Z", ip: "198.51.100.24" }, sensitive: false },
  { id: "aud-004", at: "2026-06-25T17:44:00Z", occurredOn: "2026-06-25", actorId: "prac-osei", actorRole: "CLINICIAN", action: "UPDATE", entity: "onboardingCase", entityId: "case-osei", field: "applicationCompleteOn", after: "2026-06-25", sensitive: false },
  { id: "aud-005", at: "2026-06-26T09:15:00Z", occurredOn: "2026-06-26", actorId: "user-cred-1", actorRole: "CREDENTIALING", action: "CREATE", entity: "verification", entityId: "ver-osei-lic", after: { element: "STATE_LICENSE", result: "CLEAN", source: "Medical Board of California" }, sensitive: false },
  { id: "aud-006", at: "2026-06-27T11:20:00Z", occurredOn: "2026-06-27", actorId: "user-cred-1", actorRole: "CREDENTIALING", action: "CREATE", entity: "verification", entityId: "ver-osei-npdb", after: { element: "NPDB", result: "ADVERSE" }, sensitive: true, reason: "NPDB query returned one report" },
  { id: "aud-007", at: "2026-06-27T11:26:00Z", occurredOn: "2026-06-27", actorId: "user-mso-1", actorRole: "MSO", action: "READ", entity: "verification", entityId: "ver-osei-npdb", field: "verification.npdbReport", sensitive: true, reason: "Enhanced review path — adverse history" },
  { id: "aud-008", at: "2026-07-06T08:40:00Z", occurredOn: "2026-07-06", actorId: "user-enroll-1", actorRole: "PAYOR_ENROLLMENT", action: "CREATE", entity: "payorEnrollment", entityId: "enr-osei-medicare", after: { status: "SUBMITTED", submitted: "2026-07-06", trackingNumber: "PECOS-8842019" }, sensitive: false },
  { id: "aud-009", at: "2026-07-06T08:41:00Z", occurredOn: "2026-07-06", actorId: "user-enroll-1", actorRole: "PAYOR_ENROLLMENT", action: "READ", entity: "practitioner", entityId: "prac-osei", field: "practitioner.ssnLast4", sensitive: true, reason: "CMS-855I submission" },
  { id: "aud-010", at: "2026-08-11T13:05:00Z", occurredOn: "2026-08-11", actorId: "user-cred-2", actorRole: "CREDENTIALING", action: "CREATE", entity: "verification", entityId: "ver-osei-work-1", after: { element: "WORK_HISTORY", result: "DISCREPANCY", selfReported: "2021-09-01 to 2026-04-30", verified: "2021-11-15 to 2026-04-30" }, sensitive: false, reason: "Employer-reported dates differ from self-report; flagged, not overwritten" },
  { id: "aud-011", at: "2026-08-22T16:30:00Z", occurredOn: "2026-08-22", actorId: "user-mso-1", actorRole: "MSO", action: "CREATE", entity: "committeeReview", entityId: "rev-osei-chair", after: { body: "DEPARTMENT_CHAIR", outcome: "DEFERRED", deferralReason: "Case logs required for catheterization and structural heart privileges" }, sensitive: false },
  { id: "aud-012", at: "2026-08-24T10:00:00Z", occurredOn: "2026-08-24", actorId: "user-audit-1", actorRole: "AUDITOR", action: "READ", entity: "onboardingCase", entityId: "case-osei", field: "adverseAction.description", sensitive: true, reason: "Quarterly file sampling" },

  { id: "aud-101", at: "2026-02-12T09:00:00Z", occurredOn: "2026-02-12", actorId: "user-recruit-1", actorRole: "RECRUITER", action: "CREATE", entity: "onboardingCase", entityId: "case-marchetti", after: { stage: "INITIATION", startDate: "2026-06-01" }, sensitive: false, reason: "Intra-system transfer initiated" },
  { id: "aud-102", at: "2026-03-18T10:30:00Z", occurredOn: "2026-03-18", actorId: "user-cred-2", actorRole: "CREDENTIALING", action: "CREATE", entity: "verification", entityId: "ver-marc-edu", after: { element: "EDUCATION", result: "CLEAN", byCvo: true }, sensitive: false, reason: "Reused from prior file within the validity window" },
  { id: "aud-103", at: "2026-05-14T15:00:00Z", occurredOn: "2026-05-14", actorId: "user-mso-1", actorRole: "MSO", action: "CREATE", entity: "committeeReview", entityId: "rev-marc-board", after: { body: "BOARD", outcome: "APPROVED", appointmentTermMonths: 24 }, sensitive: false },
  { id: "aud-104", at: "2026-06-18T12:00:00Z", occurredOn: "2026-06-18", actorId: "user-enroll-1", actorRole: "PAYOR_ENROLLMENT", action: "UPDATE", entity: "payorEnrollment", entityId: "enr-marc-medicare", field: "effectiveDate", after: "2026-06-15", sensitive: false, reason: "Written approval letter received; retroactive date granted to 2026-05-21" },
  { id: "aud-105", at: "2026-08-05T09:20:00Z", occurredOn: "2026-08-05", actorId: "user-enroll-2", actorRole: "PAYOR_ENROLLMENT", action: "UPDATE", entity: "payorEnrollment", entityId: "enr-marc-united", field: "followUps", after: { date: "2026-07-28", outcome: "In credentialing; no effective date offered" }, sensitive: false },
];

export const AUDIT_LOG: AuditLog = EVENTS.reduce<AuditEntry[]>((log, event) => append(log, event), []);
