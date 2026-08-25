import { allViews, today } from "@/lib/case-view";
import { PSV_MATRIX } from "@/domain/psv";
import { VERIFICATIONS } from "@/data/practitioners";
import { monthlyScreeningStatus } from "@/domain/psv";
import { formatDate } from "@/domain/dates";
import { Card, CaseLink, Chip, Empty, PageHeader, Ref, Stat, Table, Td } from "@/components/ui";

export const metadata = { title: "Verification" };

export default function VerificationsPage() {
  const views = allViews();

  const queue = views.flatMap((v) =>
    v.psv.items
      .filter((i) => i.status !== "VERIFIED")
      .map((i) => ({
        caseId: v.onboardingCase.id,
        clinician: `${v.practitioner.legalFirstName} ${v.practitioner.legalLastName}`,
        item: i,
      })),
  );

  const adjudication = queue.filter(
    (q) =>
      q.item.status === "DISCREPANCY" ||
      q.item.status === "ADVERSE" ||
      q.item.status === "UNABLE_TO_VERIFY",
  );
  const manualOutstanding = queue.filter(
    (q) => q.item.status === "MISSING" && q.item.required.entry.automation === "MANUAL",
  );

  // Exclusion screening runs monthly for every active clinician, and the clean
  // result is itself the audit artifact — so it is reported, not discarded.
  const screens = views.map((v) => ({
    caseId: v.onboardingCase.id,
    clinician: `${v.practitioner.legalFirstName} ${v.practitioner.legalLastName}`,
    screens: monthlyScreeningStatus(
      today,
      VERIFICATIONS.filter((x) => x.practitionerId === v.practitioner.id),
    ),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Credentialing"
        title="Primary source verification"
        lede="Every element verified from its primary source, with the source, method, date, verifier, result and stored artifact. Verifications are judged against the projected decision date, not against today — a file that was current in March is not current for a September committee."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open verification items" value={queue.length} tone={queue.length ? "warn" : "ok"} />
        <Stat
          label="Awaiting adjudication"
          value={adjudication.length}
          hint="Discrepancies and adverse findings"
          tone={adjudication.length ? "risk" : "ok"}
        />
        <Stat
          label="Manual sources outstanding"
          value={manualOutstanding.length}
          hint="Typically 2–4 follow-ups each"
        />
        <Stat
          label="Automatable elements"
          value={PSV_MATRIX.filter((e) => e.automation === "API").length}
          hint={`of ${PSV_MATRIX.length} in the matrix`}
          tone="info"
        />
      </div>

      <div className="mt-6 space-y-6">
        <Card
          title="Adjudication queue"
          subtitle="Where verified data differs from what the clinician reported, the system flags it for a human. It never silently overwrites — the difference is the evidence."
          action={<Ref>§4.3</Ref>}
        >
          {adjudication.length === 0 ? (
            <Empty>No findings awaiting adjudication.</Empty>
          ) : (
            <Table head={["Clinician", "Element", "Source", "Finding", "Status"]}>
              {adjudication.map((q, i) => (
                <tr key={i}>
                  <Td>
                    <CaseLink id={q.caseId}>{q.clinician}</CaseLink>
                  </Td>
                  <Td className="text-xs">
                    {q.item.required.entry.label}
                    <div className="text-slate-500">{q.item.required.subject ?? "—"}</div>
                  </Td>
                  <Td className="text-xs text-slate-600">{q.item.verification?.source ?? "—"}</Td>
                  <Td className="max-w-md text-xs text-slate-700">
                    {q.item.verification?.selfReported && (
                      <div>
                        Self-reported <strong>{q.item.verification.selfReported}</strong>; verified{" "}
                        <strong>{q.item.verification.verified}</strong>.
                      </div>
                    )}
                    {q.item.verification?.notes}
                  </Td>
                  <Td>
                    <Chip tone={q.item.status === "ADVERSE" ? "risk" : "warn"}>
                      {q.item.status.replaceAll("_", " ").toLowerCase()}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card
          title="Work queue — outstanding verifications"
          subtitle="Grouped by automation posture. The automatable elements clear themselves; the manual remainder is what needs a follow-up cadence."
          action={<Ref>§4.3, §6</Ref>}
        >
          {queue.length === 0 ? (
            <Empty>Every required verification is complete and current.</Empty>
          ) : (
            <Table head={["Clinician", "Element", "Subject", "Primary source", "Automation", "Status"]}>
              {queue.map((q, i) => (
                <tr key={i}>
                  <Td>
                    <CaseLink id={q.caseId}>{q.clinician}</CaseLink>
                  </Td>
                  <Td className="text-xs font-medium">{q.item.required.entry.label}</Td>
                  <Td className="text-xs text-slate-600">
                    {q.item.required.subject ?? q.item.required.state ?? "—"}
                  </Td>
                  <Td className="text-xs text-slate-600">{q.item.required.entry.primarySource}</Td>
                  <Td>
                    <Chip tone={q.item.required.entry.automation === "MANUAL" ? "warn" : "info"}>
                      {q.item.required.entry.automation.replaceAll("_", " ").toLowerCase()}
                    </Chip>
                    {q.item.required.entry.highFollowUp && (
                      <div className="text-xs text-slate-500">high follow-up</div>
                    )}
                  </Td>
                  <Td>
                    <Chip tone={q.item.status === "MISSING" ? "risk" : "warn"}>
                      {q.item.status.replaceAll("_", " ").toLowerCase()}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card
          title="Monthly exclusion and sanction screening"
          subtitle="OIG LEIE, SAM.gov, state Medicaid exclusion lists and the CMS preclusion list, for every active clinician. Evidence of a clean screen is stored — the negative result is the audit artifact."
          action={<Ref>§11</Ref>}
        >
          <Table head={["Clinician", "Screen", "Last screened", "Due", "Result", "Status"]}>
            {screens.flatMap((s) =>
              s.screens.map((screen) => (
                <tr key={`${s.caseId}-${screen.element}`}>
                  <Td>
                    <CaseLink id={s.caseId}>{s.clinician}</CaseLink>
                  </Td>
                  <Td className="text-xs">{screen.label}</Td>
                  <Td className="nums text-xs">{formatDate(screen.lastScreened)}</Td>
                  <Td className="nums text-xs">{formatDate(screen.dueOn)}</Td>
                  <Td className="text-xs">{screen.lastResult?.toLowerCase() ?? "never screened"}</Td>
                  <Td>
                    <Chip tone={screen.overdue ? "risk" : "ok"}>
                      {screen.overdue ? "overdue" : "current"}
                    </Chip>
                  </Td>
                </tr>
              )),
            )}
          </Table>
        </Card>

        <Card
          title="Verification matrix"
          subtitle="The configured source and automation posture per element. Which standard set was applied to a given file, and when, is recoverable from the file itself."
          action={<Ref>§6</Ref>}
        >
          <Table head={["Element", "Primary source", "Automation", "Cadence"]}>
            {PSV_MATRIX.map((e) => (
              <tr key={e.element}>
                <Td className="font-medium">{e.label}</Td>
                <Td className="text-xs text-slate-600">{e.primarySource}</Td>
                <Td>
                  <Chip
                    tone={
                      e.automation === "API"
                        ? "ok"
                        : e.automation === "SEMI_AUTO" || e.automation === "INTEGRATION"
                          ? "info"
                          : "warn"
                    }
                  >
                    {e.automation.replaceAll("_", " ").toLowerCase()}
                  </Chip>
                </Td>
                <Td className="text-xs text-slate-600">
                  {e.monthlyRecheck ? "monthly re-check" : e.highFollowUp ? "2–4 follow-ups typical" : "one-time"}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
