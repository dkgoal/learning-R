import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT, scopeRuleFor, supervisionCapFor } from "@/domain/config";
import {
  agreementIsValid,
  assessScopeOfPractice,
  checkSupervisionCapacity,
  coSignatureConfig,
  determineBillingModel,
} from "@/domain/advanced-practice";
import type { CollaborativeAgreement, Payor, Practitioner } from "@/domain/types";

const config = DEFAULT_TENANT;
const today = "2026-08-25";

const np: Practitioner = {
  id: "app1",
  legalFirstName: "Nia",
  legalLastName: "Whitfield",
  formerNames: [],
  type: "NP",
  primarySpecialty: "Family Practice",
  subspecialties: [],
  languages: [],
  email: "n@example.org",
  phone: "555",
};

const physician: Practitioner = { ...np, id: "md1", type: "MD" };

function agreement(overrides: Partial<CollaborativeAgreement> = {}): CollaborativeAgreement {
  return {
    id: "agr",
    practitionerId: "app1",
    supervisingPhysicianIds: ["md1"],
    alternateIds: ["md2"],
    state: "CA",
    scope: "Primary care",
    chartReviewPercent: 10,
    chartReviewFrequency: "MONTHLY",
    meetingCadence: "MONTHLY",
    effective: "2026-07-01",
    renews: "2027-07-01",
    stateFilingRequired: true,
    stateFiledOn: "2026-07-05",
    signedByApp: "2026-07-01",
    signedByPhysician: "2026-07-01",
    ...overrides,
  };
}

describe("supervision capacity", () => {
  const others = ["a", "b", "c"].map((id, i) =>
    agreement({ id: `agr-${id}`, practitionerId: `other-${i}` }),
  );

  it("permits an assignment below the state cap", () => {
    const result = checkSupervisionCapacity(config, "md1", "CA", others, "app1");
    expect(result.cap).toBe(4);
    expect(result.overCapacity).toBe(false);
    expect(result.atCapacity).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("refuses an assignment that would exceed the cap", () => {
    const four = [...others, agreement({ id: "agr-d", practitionerId: "other-3" })];
    const result = checkSupervisionCapacity(config, "md1", "CA", four, "app1");
    expect(result.overCapacity).toBe(true);
    expect(result.message).toMatch(/5 of a 4-APP limit/);
  });

  it("excludes the candidate's own existing agreement from the count", () => {
    const withMine = [...others, agreement({ id: "agr-mine", practitionerId: "app1" })];
    const result = checkSupervisionCapacity(config, "md1", "CA", withMine, "app1");
    expect(result.currentCount).toBe(3);
  });

  it("says so plainly when no cap is configured for the state", () => {
    const result = checkSupervisionCapacity(config, "md1", "NY", others, "app1");
    expect(result.cap).toBeNull();
    expect(result.message).toMatch(/No configured supervision cap/);
    expect(supervisionCapFor(config, "NY")).toBeNull();
  });
});

describe("scope of practice", () => {
  it("treats a physician as unconstrained by APP scope rules", () => {
    const result = assessScopeOfPractice(config, physician, "CA", undefined, ["2"]);
    expect(result.problems).toHaveLength(0);
    expect(result.agreementRequired).toBe(false);
  });

  it("requires an executed agreement in a reduced-practice state", () => {
    const result = assessScopeOfPractice(config, np, "CA", agreement({ signedByPhysician: undefined }), [], 9200);
    expect(result.rule?.authority).toBe("REDUCED");
    expect(result.agreementSatisfied).toBe(false);
    expect(result.problems.join(" ")).toMatch(/reduced-practice state/);
  });

  it("does not require an agreement in a full-practice state", () => {
    const result = assessScopeOfPractice(config, np, "OR", undefined, ["2", "3"]);
    expect(result.rule?.authority).toBe("FULL");
    expect(result.agreementRequired).toBe(false);
    expect(result.problems).toHaveLength(0);
  });

  it("catches a DEA schedule the state does not permit that APP type", () => {
    const result = assessScopeOfPractice(config, np, "TX", agreement({ state: "TX" }), ["2", "3", "4", "5"]);
    expect(result.schedulesExceedingScope).toEqual(["2"]);
    expect(result.problems.join(" ")).toMatch(/EHR prescribing configuration must restrict/);
  });

  it("counts transition-to-practice hours", () => {
    const short = assessScopeOfPractice(config, np, "CA", agreement(), [], 100);
    expect(short.problems.join(" ")).toMatch(/4600 documented transition-to-practice hours/);
    const met = assessScopeOfPractice(config, np, "CA", agreement(), [], 9200);
    expect(met.problems.join(" ")).not.toMatch(/transition-to-practice/);
  });

  it("fails closed when no rule is configured for the state", () => {
    const result = assessScopeOfPractice(config, np, "NY", agreement({ state: "NY" }), ["2"]);
    expect(result.rule).toBeNull();
    expect(result.prescriptiveAuthority).toBe(false);
    expect(result.schedulesExceedingScope).toEqual(["2"]);
    expect(result.problems[0]).toMatch(/No scope-of-practice rule configured/);
    expect(scopeRuleFor(config, "NY", "NP")).toBeNull();
  });
});

describe("collaborative agreement validity", () => {
  it("accepts a fully executed, filed agreement", () => {
    const result = agreementIsValid(agreement(), "CA", today);
    expect(result.valid).toBe(true);
    expect(result.daysToRenewal).toBe(310);
  });

  it("collects every defect rather than stopping at the first", () => {
    const result = agreementIsValid(
      agreement({
        supervisingPhysicianIds: [],
        alternateIds: [],
        signedByApp: undefined,
        signedByPhysician: undefined,
        stateFiledOn: undefined,
        chartReviewPercent: 0,
        renews: "2026-01-01",
      }),
      "CA",
      today,
    );
    expect(result.valid).toBe(false);
    expect(result.problems.length).toBeGreaterThanOrEqual(6);
    expect(result.problems.join(" ")).toMatch(/lapsed on 2026-01-01/);
  });

  it("catches an agreement filed for the wrong state", () => {
    expect(agreementIsValid(agreement({ state: "CA" }), "TX").problems.join(" ")).toMatch(
      /filed for CA, not TX/,
    );
  });

  it("reports a missing agreement as invalid", () => {
    expect(agreementIsValid(undefined).valid).toBe(false);
  });
});

describe("APP billing model", () => {
  const credentialing: Payor = {
    id: "pay-a",
    name: "Credentials APPs",
    program: "COMMERCIAL",
    submissionChannel: "PORTAL",
    typicalTurnaroundDays: 90,
    credentialsAppTypes: ["MD", "NP", "PA"],
  };
  const refusing: Payor = { ...credentialing, id: "pay-b", name: "Physician only", credentialsAppTypes: ["MD"] };

  it("forces billing under the supervising physician where the payor will not credential the type", () => {
    const result = determineBillingModel(np, refusing, "OFFICE", true);
    expect(result.model).toBe("UNDER_SUPERVISING_PHYSICIAN");
    expect(result.forcedBySupervisorRequirement).toBe(true);
  });

  it("uses split/shared rules in a facility setting", () => {
    const result = determineBillingModel(np, credentialing, "FACILITY", true);
    expect(result.model).toBe("SPLIT_SHARED");
    expect(result.documentationRequirements.join(" ")).toMatch(/substantive portion/i);
  });

  it("distinguishes incident-to from direct billing by supervision presence", () => {
    expect(determineBillingModel(np, credentialing, "OFFICE", true).model).toBe("INCIDENT_TO");
    expect(determineBillingModel(np, credentialing, "OFFICE", false).model).toBe("DIRECT_OWN_NPI");
  });

  it("leaves physicians on their own NPI", () => {
    const result = determineBillingModel(physician, refusing, "OFFICE", false);
    expect(result.model).toBe("DIRECT_OWN_NPI");
    expect(result.forcedBySupervisorRequirement).toBe(false);
  });
});

describe("co-signature routing", () => {
  it("routes a sampled percentage into the EHR queue where an agreement applies", () => {
    const scope = assessScopeOfPractice(config, np, "CA", agreement(), [], 9200);
    const config1 = coSignatureConfig(scope, agreement());
    expect(config1.required).toBe(true);
    expect(config1.percentOfCharts).toBe(10);
    expect(config1.ehrRule).toMatch(/10% of encounters/);
  });

  it("requires no routing in a full-practice state", () => {
    const scope = assessScopeOfPractice(config, np, "OR", undefined, []);
    expect(coSignatureConfig(scope, undefined).required).toBe(false);
  });
});
