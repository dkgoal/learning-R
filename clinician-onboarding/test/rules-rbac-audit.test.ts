import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  evaluateCondition,
  evaluateRule,
  evaluateRules,
  gateFor,
  type FactBag,
  type Rule,
} from "@/domain/rules";
import {
  FIELD_POLICIES,
  ROLE_LABELS,
  canRead,
  canWrite,
  packetSections,
  policyFor,
  redact,
} from "@/domain/rbac";
import {
  append,
  chainHash,
  entriesFor,
  reconstructAsOf,
  reconstructFile,
  sensitiveReads,
  verifyIntegrity,
  type AuditEntry,
  type AuditLog,
} from "@/domain/audit";

// ---------------------------------------------------------------------------
// Rules engine (§10)
// ---------------------------------------------------------------------------

describe("condition operators", () => {
  const facts: FactBag = {
    yes: true,
    no: false,
    count: 5,
    name: "ada",
    list: ["a", "b"],
    empty: "",
  };

  it("evaluates each operator against the fact bag", () => {
    const check = (fact: string, operator: Parameters<typeof evaluateCondition>[0]["operator"], value?: string | number | boolean) =>
      evaluateCondition({ fact, operator, value, label: "l" }, facts).met;

    expect(check("yes", "IS_TRUE")).toBe(true);
    expect(check("no", "IS_TRUE")).toBe(false);
    expect(check("no", "IS_FALSE")).toBe(true);
    expect(check("name", "EQUALS", "ada")).toBe(true);
    expect(check("name", "NOT_EQUALS", "bo")).toBe(true);
    expect(check("count", "GTE", 5)).toBe(true);
    expect(check("count", "GTE", 6)).toBe(false);
    expect(check("count", "LTE", 5)).toBe(true);
    expect(check("list", "INCLUDES", "b")).toBe(true);
    expect(check("list", "INCLUDES", "z")).toBe(false);
    expect(check("name", "IS_PRESENT")).toBe(true);
    expect(check("empty", "IS_PRESENT")).toBe(false);
    expect(check("missing", "IS_PRESENT")).toBe(false);
  });

  it("reports the actual value when a condition fails", () => {
    expect(evaluateCondition({ fact: "no", operator: "IS_TRUE", label: "Must be true" }, facts).explanation).toBe(
      "Must be true — currently false",
    );
    expect(evaluateCondition({ fact: "missing", operator: "IS_TRUE", label: "x" }, facts).explanation).toMatch(
      /not recorded/,
    );
    expect(evaluateCondition({ fact: "list", operator: "IS_TRUE", label: "x" }, facts).explanation).toMatch(/a, b/);
    expect(
      evaluateCondition({ fact: "count", operator: "IS_TRUE", label: "x" }, facts).explanation,
    ).toMatch(/currently 5/);
    expect(
      evaluateCondition({ fact: "emptyList", operator: "IS_TRUE", label: "x" }, { emptyList: [] }).explanation,
    ).toMatch(/empty/);
  });

  it("requires GTE and LTE operands to be numeric", () => {
    expect(evaluateCondition({ fact: "name", operator: "GTE", value: 1, label: "x" }, facts).met).toBe(false);
  });
});

describe("rule evaluation", () => {
  const rule: Rule = {
    id: "r",
    name: "Test rule",
    gates: "DO_THING",
    description: "d",
    severity: "BLOCKING",
    all: [{ fact: "a", operator: "IS_TRUE", label: "A must hold" }],
    any: [
      { fact: "b", operator: "IS_TRUE", label: "B" },
      { fact: "c", operator: "IS_TRUE", label: "C" },
    ],
  };

  it("requires every `all` condition and at least one `any`", () => {
    expect(evaluateRule(rule, { a: true, b: true, c: false }).satisfied).toBe(true);
    expect(evaluateRule(rule, { a: true, b: false, c: false }).satisfied).toBe(false);
    expect(evaluateRule(rule, { a: false, b: true, c: true }).satisfied).toBe(false);
  });

  it("names the failing conditions in the summary", () => {
    const result = evaluateRule(rule, { a: false, b: true });
    expect(result.unmet).toHaveLength(1);
    expect(result.summary).toMatch(/blocked by 1 condition — A must hold/);
    expect(evaluateRule(rule, { a: true, b: true }).summary).toMatch(/all conditions met/);
  });

  it("treats a rule with no `any` group as satisfied on `all` alone", () => {
    const simple: Rule = { ...rule, any: undefined };
    expect(evaluateRule(simple, { a: true }).satisfied).toBe(true);
  });
});

describe("gates", () => {
  it("blocks on a blocking failure and passes on a warning", () => {
    const blocked = gateFor(DEFAULT_RULES, "PROVISION_EPCS", { deaVerified: false });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blocking).toHaveLength(1);

    // The visa runway rule is a warning: it must be visible without stopping
    // access provisioning.
    const warned = gateFor(DEFAULT_RULES, "PROVISION_ACCESS", {
      backgroundCheckCleared: true,
      i9Complete: true,
      occHealthCleared: true,
      visaDaysRemaining: 30,
    });
    expect(warned.allowed).toBe(true);
    expect(warned.warnings).toHaveLength(1);
  });

  it("opens the EPCS gate only when every controlled-substance condition holds", () => {
    const facts: FactBag = {
      deaVerified: true,
      stateCdsVerified: true,
      epcsIdentityProofed: true,
      epcsTwoFactorEnrolled: true,
      locationMatchesDeaAddress: true,
    };
    expect(gateFor(DEFAULT_RULES, "PROVISION_EPCS", facts).allowed).toBe(true);
    expect(
      gateFor(DEFAULT_RULES, "PROVISION_EPCS", { ...facts, locationMatchesDeaAddress: false }).allowed,
    ).toBe(false);
  });

  it("allows a gate with no rules attached", () => {
    expect(gateFor(DEFAULT_RULES, "NOT_A_GATE", {}).allowed).toBe(true);
    expect(evaluateRules([], {})).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Field-level RBAC (§2, §14)
// ---------------------------------------------------------------------------

describe("field-level RBAC", () => {
  it("restricts sensitive fields to the named roles", () => {
    expect(canRead("CREDENTIALING", "practitioner.ssnLast4")).toBe(true);
    expect(canRead("RECRUITER", "practitioner.ssnLast4")).toBe(false);
    expect(canRead("IT", "banking.eft")).toBe(false);
    expect(canRead("PAYOR_ENROLLMENT", "banking.eft")).toBe(true);
  });

  it("lets the auditor read everything and write nothing", () => {
    expect(canRead("AUDITOR", "practitioner.ssnLast4")).toBe(true);
    expect(canWrite("AUDITOR", "practitioner.ssnLast4")).toBe(false);
    expect(canWrite("HR", "practitioner.ssnLast4")).toBe(true);
  });

  it("defaults unlisted fields to staff-readable", () => {
    const policy = policyFor("practitioner.email");
    expect(policy.sensitivity).toBe("NORMAL");
    expect(policy.auditOnRead).toBe(false);
    expect(canRead("RECRUITER", "practitioner.email")).toBe(true);
  });

  it("redacts a record and reports what a sensitive read must log", () => {
    const record = { legalLastName: "Osei", ssnLast4: "4417", dateOfBirth: "1984-03-11" };
    const forRecruiter = redact(record, "RECRUITER", "practitioner");
    expect(forRecruiter.value.legalLastName).toBe("Osei");
    expect(forRecruiter.value.ssnLast4).toBeUndefined();
    expect(forRecruiter.redactedFields.sort()).toEqual([
      "practitioner.dateOfBirth",
      "practitioner.ssnLast4",
    ]);
    expect(forRecruiter.sensitiveReads).toHaveLength(0);

    const forCredentialing = redact(record, "CREDENTIALING", "practitioner");
    expect(forCredentialing.value.ssnLast4).toBe("4417");
    expect(forCredentialing.sensitiveReads).toContain("practitioner.ssnLast4");
  });

  it("redacts committee packet sections per role", () => {
    const chair = packetSections("DEPARTMENT_CHAIR");
    const enrollment = packetSections("PAYOR_ENROLLMENT");
    expect(chair.find((s) => s.section === "Peer review cases")?.included).toBe(true);
    expect(enrollment.find((s) => s.section === "Peer review cases")?.included).toBe(false);
    expect(enrollment.find((s) => s.section === "NPDB report")?.reason).toMatch(/Restricted from/);
    // The auditor sees the whole packet — read-only, and separately logged.
    expect(packetSections("AUDITOR").every((s) => s.included)).toBe(true);
  });

  it("labels every role for the UI", () => {
    for (const policy of FIELD_POLICIES) {
      for (const role of [...policy.read, ...policy.write]) {
        expect(ROLE_LABELS[role]).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Audit log (§14)
// ---------------------------------------------------------------------------

describe("append-only audit log", () => {
  const base = {
    at: "2026-01-01T00:00:00Z",
    occurredOn: "2026-01-01",
    actorId: "u1",
    actorRole: "CREDENTIALING",
    entity: "practitioner",
    entityId: "p1",
    sensitive: false,
  };

  function log(): AuditLog {
    let l: AuditLog = [];
    l = append(l, { ...base, id: "1", action: "CREATE", after: { name: "Ada", status: "ACTIVE" } });
    l = append(l, { ...base, id: "2", at: "2026-02-01T00:00:00Z", occurredOn: "2026-02-01", action: "UPDATE", field: "status", after: "SUSPENDED" });
    l = append(l, { ...base, id: "3", at: "2026-03-01T00:00:00Z", occurredOn: "2026-03-01", action: "READ", field: "practitioner.ssnLast4", sensitive: true });
    l = append(l, { ...base, id: "4", at: "2026-04-01T00:00:00Z", occurredOn: "2026-04-01", action: "UPDATE", field: "status", after: "ACTIVE" });
    return l;
  }

  it("does not mutate the log it is given", () => {
    const original: AuditLog = [];
    const next = append(original, { ...base, id: "1", action: "CREATE", after: {} });
    expect(original).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it("chains each entry to its predecessor", () => {
    const l = log();
    expect(l[0]?.previousHash).toBe("0".repeat(16));
    expect(l[1]?.previousHash).toBe(l[0]?.hash);
    expect(verifyIntegrity(l).intact).toBe(true);
    expect(verifyIntegrity([]).intact).toBe(true);
  });

  it("detects a tampered entry", () => {
    const l = [...log()];
    l[1] = { ...(l[1] as AuditEntry), after: "NEVER_SUSPENDED" };
    const result = verifyIntegrity(l);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("produces a stable hash for the same input", () => {
    expect(chainHash("payload", "prev")).toBe(chainHash("payload", "prev"));
    expect(chainHash("payload", "prev")).not.toBe(chainHash("payload", "other"));
  });

  it("reconstructs state as of a past date, not as of now", () => {
    const l = log();
    const february = reconstructAsOf(l, "practitioner", "p1", "2026-02-15");
    expect(february.status).toBe("SUSPENDED");
    const now = reconstructAsOf(l, "practitioner", "p1", "2026-12-31");
    expect(now.status).toBe("ACTIVE");
    expect(now.name).toBe("Ada");
  });

  it("ignores reads when folding state", () => {
    const l = log();
    const state = reconstructAsOf(l, "practitioner", "p1", "2026-03-15");
    expect(state.status).toBe("SUSPENDED");
    expect(state["practitioner.ssnLast4"]).toBeUndefined();
  });

  it("handles field and whole-record deletes", () => {
    let l = log();
    l = append(l, { ...base, id: "5", at: "2026-05-01T00:00:00Z", occurredOn: "2026-05-01", action: "DELETE", field: "status" });
    expect(reconstructAsOf(l, "practitioner", "p1", "2026-06-01").status).toBeUndefined();
    l = append(l, { ...base, id: "6", at: "2026-06-01T00:00:00Z", occurredOn: "2026-06-01", action: "DELETE" });
    expect(reconstructAsOf(l, "practitioner", "p1", "2026-07-01")).toEqual({});
  });

  it("isolates sensitive reads and per-entity history", () => {
    const l = log();
    expect(sensitiveReads(l)).toHaveLength(1);
    expect(entriesFor(l, "practitioner", "p1")).toHaveLength(4);
    expect(entriesFor(l, "payorEnrollment", "e1")).toHaveLength(0);
  });

  it("reconstructs the whole file as of a decision date", () => {
    const file = reconstructFile(log(), "p1", "2026-02-15");
    expect(file.asOf).toBe("2026-02-15");
    expect(file.integrity.intact).toBe(true);
    expect(file.entryCount).toBeGreaterThan(0);
    const practitioner = file.entities.find((e) => e.entity === "practitioner");
    expect(practitioner?.state.status).toBe("SUSPENDED");
  });
});
