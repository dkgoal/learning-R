import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT } from "@/domain/config";
import {
  PSV_MATRIX,
  appCertifyingBody,
  detectDiscrepancy,
  evaluatePsv,
  matrixEntry,
  monthlyScreeningStatus,
  planDeltaVerification,
  requiredVerifications,
  summarizePsv,
  type RequiredVerification,
} from "@/domain/psv";
import type { Practitioner, PractitionerIdentifier, Verification } from "@/domain/types";

const config = DEFAULT_TENANT;

const physician: Practitioner = {
  id: "p1",
  legalFirstName: "Ada",
  legalLastName: "Reyes",
  formerNames: [],
  type: "MD",
  primarySpecialty: "Cardiology",
  subspecialties: [],
  languages: ["English"],
  email: "a@example.org",
  phone: "555-0100",
};

const identifiers: PractitionerIdentifier[] = [
  { id: "i1", practitionerId: "p1", kind: "NPI_TYPE_1", value: "1234567893", status: "ACTIVE" },
  { id: "i2", practitionerId: "p1", kind: "STATE_LICENSE", value: "CA-1", state: "CA", status: "ACTIVE" },
  { id: "i3", practitionerId: "p1", kind: "STATE_LICENSE", value: "OR-1", state: "OR", status: "ACTIVE" },
  { id: "i4", practitionerId: "p1", kind: "DEA", value: "BR1", state: "CA", status: "ACTIVE" },
];

function required(overrides: Partial<Parameters<typeof requiredVerifications>[1]> = {}) {
  return requiredVerifications(config, {
    practitioner: physician,
    identifiers,
    hospitalAffiliations: ["Mercy General"],
    priorEmployers: ["Mercy Medical Group"],
    peerReferenceNames: ["Dr. A", "Dr. B"],
    ...overrides,
  });
}

describe("required verification set", () => {
  it("derives one license verification per state held", () => {
    // The quiet way a file goes incomplete: verifying only the "main" license.
    const licenses = required().filter((r) => r.element === "STATE_LICENSE");
    expect(licenses.map((l) => l.state).sort()).toEqual(["CA", "OR"]);
  });

  it("pads peer references up to the configured minimum", () => {
    const peers = required().filter((r) => r.element === "PEER_REFERENCE");
    expect(peers).toHaveLength(config.peerReferences.minimum);
    expect(peers[2]?.subject).toContain("not yet named");
  });

  it("adds ECFMG only for international medical graduates", () => {
    expect(required().some((r) => r.element === "ECFMG")).toBe(false);
    expect(required({ isImg: true }).some((r) => r.element === "ECFMG")).toBe(true);
  });

  it("routes APP certification to the right board", () => {
    const np = requiredVerifications(config, {
      practitioner: { ...physician, type: "NP" },
      identifiers,
      hospitalAffiliations: [],
      priorEmployers: [],
      peerReferenceNames: [],
    });
    const certs = np.filter((r) => r.element === "BOARD_CERT");
    expect(certs.some((c) => c.entry.primarySource.includes("AANP"))).toBe(true);
    expect(appCertifyingBody("PA")).toBe("NCCPA");
    expect(appCertifyingBody("CRNA")).toBe("NBCRNA");
    expect(appCertifyingBody("CNM")).toBe("AMCB");
    expect(appCertifyingBody("CAA")).toBe("NCCAA");
    expect(appCertifyingBody("DO")).toContain("ABMS");
  });

  it("screens state Medicaid exclusion lists per state", () => {
    const excl = required().filter((r) => r.element === "STATE_MEDICAID_EXCLUSION");
    expect(excl.map((e) => e.state).sort()).toEqual(["CA", "OR"]);
  });
});

describe("verification timeliness", () => {
  const npi: RequiredVerification[] = [{ element: "NPI", entry: matrixEntry("NPI") }];

  function verification(verifiedOn: string, extra: Partial<Verification> = {}): Verification {
    return {
      id: "v1",
      practitionerId: "p1",
      element: "NPI",
      source: "NPPES",
      method: "API",
      verifiedOn,
      verifierId: "u1",
      result: "CLEAN",
      ...extra,
    };
  }

  it("goes stale once the decision slips past the validity window", () => {
    const fresh = evaluatePsv(config, npi, [verification("2026-06-01")], "2026-07-01");
    expect(fresh[0]?.status).toBe("VERIFIED");

    // 180-day window from 2026-06-01 closes 2026-11-28.
    const slipped = evaluatePsv(config, npi, [verification("2026-06-01")], "2026-12-15");
    expect(slipped[0]?.status).toBe("STALE");
    expect(slipped[0]?.staleOn).toBe("2026-11-28");
  });

  it("warns before the window closes rather than at the moment it does", () => {
    const nearly = evaluatePsv(config, npi, [verification("2026-06-01")], "2026-11-15");
    expect(nearly[0]?.status).toBe("EXPIRING_BEFORE_DECISION");
    expect(nearly[0]?.daysUntilStale).toBe(13);
  });

  it("surfaces adverse and discrepant results over staleness", () => {
    const adverse = evaluatePsv(config, npi, [verification("2026-06-01", { result: "ADVERSE" })], "2026-12-15");
    expect(adverse[0]?.status).toBe("ADVERSE");
    const unable = evaluatePsv(
      config,
      npi,
      [verification("2026-06-01", { result: "UNABLE_TO_VERIFY" })],
      "2026-07-01",
    );
    expect(unable[0]?.status).toBe("UNABLE_TO_VERIFY");
  });

  it("reports a missing verification rather than assuming one", () => {
    expect(evaluatePsv(config, npi, [], "2026-07-01")[0]?.status).toBe("MISSING");
  });

  it("does not reuse one verification for two required subjects", () => {
    const twoLicenses: RequiredVerification[] = [
      { element: "STATE_LICENSE", subject: "CA-1", state: "CA", entry: matrixEntry("STATE_LICENSE") },
      { element: "STATE_LICENSE", subject: "OR-1", state: "OR", entry: matrixEntry("STATE_LICENSE") },
    ];
    const only: Verification[] = [
      { id: "v", practitionerId: "p1", element: "STATE_LICENSE", subject: "CA-1", state: "CA", source: "MBC", method: "API", verifiedOn: "2026-06-01", verifierId: "u", result: "CLEAN" },
    ];
    const items = evaluatePsv(config, twoLicenses, only, "2026-07-01");
    expect(items[0]?.status).toBe("VERIFIED");
    expect(items[1]?.status).toBe("MISSING");
  });
});

describe("summary and decision readiness", () => {
  it("blocks a decision on anything missing, stale or unadjudicated", () => {
    const reqs: RequiredVerification[] = [
      { element: "NPI", entry: matrixEntry("NPI") },
      { element: "DEA", entry: matrixEntry("DEA") },
    ];
    const clean: Verification[] = [
      { id: "a", practitionerId: "p1", element: "NPI", source: "NPPES", method: "API", verifiedOn: "2026-06-01", verifierId: "u", result: "CLEAN" },
      { id: "b", practitionerId: "p1", element: "DEA", source: "DEA", method: "API", verifiedOn: "2026-06-01", verifierId: "u", result: "CLEAN" },
    ];
    const ready = summarizePsv(config, evaluatePsv(config, reqs, clean, "2026-07-01"));
    expect(ready.decisionReady).toBe(true);
    expect(ready.completenessPercent).toBe(100);
    expect(ready.psvValidityDaysApplied).toBe(180);

    const partial = summarizePsv(config, evaluatePsv(config, reqs, [clean[0] as Verification], "2026-07-01"));
    expect(partial.decisionReady).toBe(false);
    expect(partial.completenessPercent).toBe(50);

    expect(summarizePsv(config, []).decisionReady).toBe(false);
  });
});

describe("discrepancies", () => {
  it("ignores formatting noise but catches substance", () => {
    expect(detectDiscrepancy("Jane A. Smith", "jane a smith")).toBe(false);
    expect(detectDiscrepancy("2021-09-01", "2021-11-15")).toBe(true);
    expect(detectDiscrepancy(undefined, "anything")).toBe(false);
  });
});

describe("monthly screening", () => {
  it("marks a never-screened element overdue", () => {
    const screens = monthlyScreeningStatus("2026-08-25", []);
    expect(screens).toHaveLength(PSV_MATRIX.filter((e) => e.monthlyRecheck).length);
    expect(screens.every((s) => s.overdue)).toBe(true);
    expect(screens[0]?.lastResult).toBeNull();
  });

  it("uses the most recent screen and keeps the clean result as evidence", () => {
    const screens = monthlyScreeningStatus("2026-08-25", [
      { id: "old", practitionerId: "p1", element: "OIG_LEIE", source: "OIG", method: "API", verifiedOn: "2026-05-01", verifierId: "s", result: "CLEAN" },
      { id: "new", practitionerId: "p1", element: "OIG_LEIE", source: "OIG", method: "API", verifiedOn: "2026-08-10", verifierId: "s", result: "CLEAN" },
    ]);
    const oig = screens.find((s) => s.element === "OIG_LEIE");
    expect(oig?.lastScreened).toBe("2026-08-10");
    expect(oig?.overdue).toBe(false);
    expect(oig?.lastResult).toBe("CLEAN");
  });
});

describe("delta verification for transfers and rehires", () => {
  it("reuses what is still current and re-runs only the rest", () => {
    const reqs: RequiredVerification[] = [
      { element: "NPI", entry: matrixEntry("NPI") },
      { element: "WORK_HISTORY", subject: "Mercy", entry: matrixEntry("WORK_HISTORY") },
      { element: "DEA", entry: matrixEntry("DEA") },
    ];
    const prior: Verification[] = [
      { id: "a", practitionerId: "p1", element: "NPI", source: "NPPES", method: "API", verifiedOn: "2026-06-01", verifierId: "u", result: "CLEAN" },
      { id: "b", practitionerId: "p1", element: "WORK_HISTORY", subject: "Mercy", source: "Mercy HR", method: "PHONE", verifiedOn: "2026-06-01", verifierId: "u", result: "CLEAN" },
    ];
    const plan = planDeltaVerification(config, reqs, prior, "2026-07-01");
    expect(plan.reusedCount).toBe(2);
    // The high-follow-up manual source is the one worth counting as saved.
    expect(plan.savedManualTouches).toBe(1);
    expect(plan.mustReverify.map((r) => r.element)).toEqual(["DEA"]);
  });
});

describe("matrix", () => {
  it("throws on an unmapped element rather than inventing a source", () => {
    expect(() => matrixEntry("NOT_A_THING" as never)).toThrow();
  });
});
