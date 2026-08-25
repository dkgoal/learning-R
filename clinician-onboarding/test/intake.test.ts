import { describe, expect, it } from "vitest";
import {
  DISCLOSURE_QUESTIONS,
  checkCompleteness,
  checklistDueDate,
  detectWorkHistoryGaps,
  measureResponsiveness,
  nudgeLevelFor,
  requiresEnhancedReview,
  summarizePrefill,
  validateDisclosures,
  validateSignature,
} from "@/domain/intake";
import type { DisclosureAnswer, OnboardingCase, Practitioner, WorkHistoryEntry } from "@/domain/types";

const today = "2026-08-25";

describe("work history gap detection", () => {
  it("flags a gap longer than 30 days between positions", () => {
    const history: WorkHistoryEntry[] = [
      { employer: "A", role: "r", from: "2020-01-01", to: "2022-01-31" },
      { employer: "B", role: "r", from: "2022-06-01", to: "2026-08-01" },
    ];
    const gaps = detectWorkHistoryGaps(history, today);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.days).toBe(121);
    expect(gaps[0]?.explained).toBe(false);
  });

  it("ignores short breaks between roles", () => {
    const history: WorkHistoryEntry[] = [
      { employer: "A", role: "r", from: "2020-01-01", to: "2022-01-31" },
      { employer: "B", role: "r", from: "2022-02-20", to: "2026-08-01" },
    ];
    expect(detectWorkHistoryGaps(history, today)).toHaveLength(0);
  });

  it("does not call an overlapping role a gap", () => {
    // Moonlighting during fellowship is a legitimate overlap, not a gap — and a
    // naive adjacent-pair scan reports it as one.
    const history: WorkHistoryEntry[] = [
      { employer: "Fellowship", role: "fellow", from: "2020-01-01", to: "2026-08-01" },
      { employer: "Moonlighting", role: "hospitalist", from: "2021-01-01", to: "2021-06-30" },
    ];
    expect(detectWorkHistoryGaps(history, today)).toHaveLength(0);
  });

  it("treats time since the last position as a gap requiring explanation", () => {
    const history: WorkHistoryEntry[] = [{ employer: "A", role: "r", from: "2020-01-01", to: "2026-01-01" }];
    const gaps = detectWorkHistoryGaps(history, today);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.beforeEmployer).toBe("(present)");
  });

  it("accepts a written explanation", () => {
    const history: WorkHistoryEntry[] = [
      { employer: "A", role: "r", from: "2020-01-01", to: "2022-01-31" },
      { employer: "B", role: "r", from: "2022-06-01", to: "2026-08-01", gapExplanation: "Parental leave." },
    ];
    const gaps = detectWorkHistoryGaps(history, today);
    expect(gaps[0]?.explained).toBe(true);
    expect(gaps[0]?.explanation).toBe("Parental leave.");
  });

  it("returns nothing for an empty history", () => {
    expect(detectWorkHistoryGaps([], today)).toHaveLength(0);
  });
});

describe("disclosures", () => {
  const complete: DisclosureAnswer[] = DISCLOSURE_QUESTIONS.map((q) => ({ questionId: q.id, affirmative: false }));

  it("requires an answer to every question", () => {
    expect(validateDisclosures([])).toHaveLength(DISCLOSURE_QUESTIONS.length);
    expect(validateDisclosures(complete)).toHaveLength(0);
  });

  it("requires an explanation on any affirmative answer", () => {
    const answers = complete.map((a) =>
      a.questionId === "malpractice_claims" ? { ...a, affirmative: true } : a,
    );
    const issues = validateDisclosures(answers);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe("MISSING_EXPLANATION");
    expect(issues[0]?.requiresEnhancedReview).toBe(true);

    const explained = answers.map((a) =>
      a.questionId === "malpractice_claims" ? { ...a, explanation: "Dismissed 2023." } : a,
    );
    expect(validateDisclosures(explained)).toHaveLength(0);
  });

  it("routes an affirmative adverse answer to enhanced review", () => {
    expect(requiresEnhancedReview(complete)).toBe(false);
    expect(
      requiresEnhancedReview([{ questionId: "license_action", affirmative: true, explanation: "x" }]),
    ).toBe(true);
    // A health-condition disclosure is sensitive but is not an adverse action.
    expect(requiresEnhancedReview([{ questionId: "health_condition", affirmative: true, explanation: "x" }])).toBe(false);
  });
});

describe("completeness", () => {
  const practitioner: Practitioner = {
    id: "p1",
    legalFirstName: "Ada",
    legalLastName: "Reyes",
    formerNames: [],
    type: "MD",
    primarySpecialty: "Cardiology",
    subspecialties: [],
    languages: [],
    email: "a@example.org",
    phone: "555",
  };

  const signature = {
    signerId: "p1",
    signerName: "Ada Reyes, MD",
    signedAt: "2026-06-25T17:42:11Z",
    ip: "198.51.100.24",
    documentSha256: "9f2c4b1a7e6d5c3b8a0f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3",
  };

  const kase: OnboardingCase = {
    id: "c1",
    practitionerId: "p1",
    stage: "DATA_COLLECTION",
    initiated: "2026-01-01",
    startDate: "2026-09-01",
    employmentType: "EMPLOYED",
    organizationIds: [],
    facilityIds: [],
    locationIds: [],
    states: ["CA"],
    expectedPayorProductIds: [],
    workHistory: [{ employer: "A", role: "r", from: "2020-01-01" }],
    disclosures: DISCLOSURE_QUESTIONS.map((q) => ({ questionId: q.id, affirmative: false })),
    attestation: signature,
    releaseOfInformation: signature,
    npdbConsent: signature,
  };

  it("passes a complete file", () => {
    const result = checkCompleteness({
      practitioner,
      onboardingCase: kase,
      hasNpi: true,
      hasActiveOrPendingLicense: true,
      documentTypesOnFile: ["CV"],
      requiredDocumentTypes: ["CV"],
      today,
    });
    expect(result.complete).toBe(true);
    expect(result.percentComplete).toBe(100);
  });

  it("names each deficiency specifically rather than declaring the file incomplete", () => {
    const result = checkCompleteness({
      practitioner,
      onboardingCase: { ...kase, attestation: undefined, npdbConsent: undefined },
      hasNpi: false,
      hasActiveOrPendingLicense: false,
      documentTypesOnFile: [],
      requiredDocumentTypes: ["CV", "W-9"],
      today,
    });
    expect(result.complete).toBe(false);
    const fields = result.deficiencies.map((d) => d.field);
    expect(fields).toContain("npi");
    expect(fields).toContain("license");
    expect(fields).toContain("document.CV");
    expect(fields).toContain("attestation");
    expect(fields).toContain("npdbConsent");
    expect(result.deficiencies.find((d) => d.field === "npi")?.owner).toBe("STAFF");
    expect(result.deficiencies.find((d) => d.field === "document.CV")?.owner).toBe("CLINICIAN");
  });

  it("advises on a visa without an expiration rather than blocking", () => {
    const result = checkCompleteness({
      practitioner: {
        ...practitioner,
        workAuthorization: { status: "VISA", visaType: "H-1B" },
      },
      onboardingCase: kase,
      hasNpi: true,
      hasActiveOrPendingLicense: true,
      documentTypesOnFile: [],
      requiredDocumentTypes: [],
      today,
    });
    const visa = result.deficiencies.find((d) => d.field === "workAuthorization");
    expect(visa?.severity).toBe("ADVISORY");
    expect(result.complete).toBe(true);
  });

  it("surfaces the enhanced review flag from the disclosures", () => {
    const result = checkCompleteness({
      practitioner,
      onboardingCase: {
        ...kase,
        disclosures: kase.disclosures.map((d) =>
          d.questionId === "conviction" ? { ...d, affirmative: true, explanation: "Explained." } : d,
        ),
      },
      hasNpi: true,
      hasActiveOrPendingLicense: true,
      documentTypesOnFile: [],
      requiredDocumentTypes: [],
      today,
    });
    expect(result.enhancedReviewRequired).toBe(true);
  });
});

describe("e-signature evidence", () => {
  it("requires signer identity, timestamp, IP and a document hash", () => {
    expect(validateSignature(undefined)).toEqual(["No signature captured."]);
    const problems = validateSignature({
      signerId: "",
      signerName: "",
      signedAt: "not-a-time",
      ip: "999",
      documentSha256: "short",
    });
    expect(problems).toHaveLength(4);
    expect(
      validateSignature({
        signerId: "p1",
        signerName: "Ada",
        signedAt: "2026-06-25T17:42:11Z",
        ip: "198.51.100.24",
        documentSha256: "a".repeat(64),
      }),
    ).toHaveLength(0);
  });
});

describe("nudges and responsiveness", () => {
  it("escalates reminder → second reminder → manager → start-date-at-risk", () => {
    expect(nudgeLevelFor(-1, false)).toBeNull();
    expect(nudgeLevelFor(0, false)).toBe("REMINDER");
    expect(nudgeLevelFor(8, false)).toBe("SECOND_REMINDER");
    expect(nudgeLevelFor(20, false)).toBe("MANAGER_NOTIFICATION");
    expect(nudgeLevelFor(1, true)).toBe("START_DATE_AT_RISK");
  });

  it("quantifies clinician non-responsiveness rather than complaining about it", () => {
    const metric = measureResponsiveness(
      [
        { ownerRole: "CLINICIAN", created: "2026-07-01", due: "2026-07-15", status: "OPEN" },
        { ownerRole: "CLINICIAN", created: "2026-06-01", due: "2026-06-10", completed: "2026-06-20", status: "DONE" },
        { ownerRole: "CREDENTIALING", created: "2026-07-01", due: "2026-07-15", status: "OPEN" },
      ],
      today,
      false,
    );
    expect(metric.clinicianOwnedTasks).toBe(2);
    expect(metric.overdueTasks).toBe(1);
    expect(metric.totalDaysWaiting).toBe(41);
    expect(metric.averageDaysToRespond).toBe(19);
    expect(metric.nextEscalation).toBe("MANAGER_NOTIFICATION");
  });

  it("reports no escalation when nothing is overdue", () => {
    const metric = measureResponsiveness(
      [{ ownerRole: "CLINICIAN", created: "2026-08-20", due: "2026-09-30", status: "OPEN" }],
      today,
      true,
    );
    expect(metric.nextEscalation).toBeNull();
    expect(metric.averageDaysToRespond).toBeNull();
  });
});

describe("prefill and checklist", () => {
  it("reports how much the clinician does not have to type", () => {
    const result = summarizePrefill(
      [
        { field: "NPI", value: "1", source: "NPPES", requiresConfirmation: false },
        { field: "License", value: "2", source: "CAQH", requiresConfirmation: true },
      ],
      4,
    );
    expect(result.coveragePercent).toBe(50);
    expect(result.sources).toEqual(["NPPES", "CAQH"]);
    expect(summarizePrefill([], 0).coveragePercent).toBe(0);
  });

  it("pulls checklist due dates ahead of the milestone deadline", () => {
    expect(checklistDueDate("2026-09-01")).toBe("2026-08-25");
  });
});
