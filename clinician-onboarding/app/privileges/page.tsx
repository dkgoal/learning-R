import { allViews, today } from "@/lib/case-view";
import { PRIVILEGES, PRIVILEGE_SETS } from "@/data/reference";
import { COMMITTEE_REVIEWS } from "@/data/practitioners";
import { committeeThroughput } from "@/domain/kpi";
import { oppeDueDates, validateVote } from "@/domain/privileges";
import { formatDate } from "@/domain/dates";
import { Bar, Card, CaseLink, Chip, Empty, PageHeader, Ref, Stat, Table, Td } from "@/components/ui";

export const metadata = { title: "Privileging" };

export default function PrivilegesPage() {
  const views = allViews().filter((v) => v.privilege);
  const throughput = committeeThroughput(COMMITTEE_REVIEWS);
  const unsupported = views.flatMap((v) =>
    (v.privilege?.evaluations ?? [])
      .filter((e) => !e.supported || e.volumeDiscrepancy)
      .map((e) => ({ caseId: v.onboardingCase.id, clinician: `${v.practitioner.legalFirstName} ${v.practitioner.legalLastName}`, evaluation: e })),
  );
  const fppes = allViews().flatMap((v) =>
    v.fppe.map((f) => ({ caseId: v.onboardingCase.id, clinician: `${v.practitioner.legalFirstName} ${v.practitioner.legalLastName}`, status: f })),
  );
  const voteProblems = COMMITTEE_REVIEWS.filter((r) => r.decided).flatMap((r) => {
    const validation = validateVote(r);
    return validation.valid ? [] : [{ review: r, validation }];
  });

  return (
    <>
      <PageHeader
        eyebrow="Medical staff office"
        title="Appointment and clinical privileges"
        lede="Privileges are criteria-based. Requests are validated against verified credentials and evidenced case volume before a packet is assembled, because privileges granted without supporting evidence is the most common survey finding."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open requests" value={views.length} />
        <Stat
          label="Unsupported items"
          value={unsupported.length}
          hint="Criteria unmet or volume unevidenced"
          tone={unsupported.length ? "risk" : "ok"}
        />
        <Stat
          label="FPPE in flight"
          value={fppes.filter((f) => !f.status.complete).length}
          hint={`${fppes.filter((f) => f.status.overdue).length} overdue`}
          tone={fppes.some((f) => f.status.overdue) ? "risk" : "warn"}
        />
        <Stat label="DOP forms" value={PRIVILEGE_SETS.length} hint={`${PRIVILEGES.length} privileges defined`} tone="info" />
      </div>

      <div className="mt-6 space-y-6">
        <Card
          title="Requests unsupported by evidence"
          subtitle="The finding a surveyor looks for. Each row names the failing criterion and the evidence actually on file."
          action={<Ref>§8.2</Ref>}
        >
          {unsupported.length === 0 ? (
            <Empty>Every requested privilege is supported by verified evidence.</Empty>
          ) : (
            <Table head={["Clinician", "Privilege", "Failing criteria", "Volume", "Recommendation"]}>
              {unsupported.map((u, i) => (
                <tr key={i}>
                  <Td>
                    <CaseLink id={u.caseId}>{u.clinician}</CaseLink>
                  </Td>
                  <Td className="font-medium">{u.evaluation.privilege.name}</Td>
                  <Td className="max-w-md text-xs text-slate-700">
                    <ul className="space-y-1">
                      {u.evaluation.findings.map((f, j) => (
                        <li key={j}>{f}</li>
                      ))}
                    </ul>
                  </Td>
                  <Td className="nums text-xs">
                    {u.evaluation.item.claimedVolume !== undefined
                      ? `${u.evaluation.item.claimedVolume} claimed / ${u.evaluation.item.evidencedVolume ?? 0} evidenced`
                      : "—"}
                  </Td>
                  <Td>
                    <Chip tone={u.evaluation.supported ? "warn" : "risk"}>
                      {u.evaluation.recommendation.replaceAll("_", " ").toLowerCase()}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card
          title="Requests in the approval chain"
          action={<Ref>§8.1, §8.3</Ref>}
          subtitle="Department chair → credentials committee → MEC → governing board, with quorum, recusal and vote recording at each step."
        >
          <Table head={["Clinician", "Staff category", "DOP form", "Supported", "Next step", "Packet"]}>
            {views.map((v) => (
              <tr key={v.onboardingCase.id}>
                <Td>
                  <CaseLink id={v.onboardingCase.id}>
                    {v.practitioner.legalFirstName} {v.practitioner.legalLastName}
                  </CaseLink>
                  <div className="text-xs text-slate-500">{v.facilityNames.join(", ")}</div>
                </Td>
                <Td className="text-xs">
                  {v.privilegeRequest?.staffCategory.replaceAll("_", " ").toLowerCase()}
                  {v.temporary && (
                    <div className="text-warn">
                      temporary — expires {formatDate(v.temporary.expires)}
                    </div>
                  )}
                </Td>
                <Td className="text-xs text-slate-600">{v.privilegeSetName}</Td>
                <Td className="nums text-xs">
                  {v.privilege?.supportedCount} / {(v.privilege?.supportedCount ?? 0) + (v.privilege?.unsupportedCount ?? 0)}
                </Td>
                <Td className="text-xs">
                  {v.nextApproval ? v.nextApproval.replaceAll("_", " ").toLowerCase() : "complete"}
                </Td>
                <Td>
                  <Chip tone={v.privilege?.packetReady ? "ok" : "risk"}>
                    {v.privilege?.packetReady ? "ready" : `${v.privilege?.blockers.length} blocker(s)`}
                  </Chip>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="FPPE — focused professional practice evaluation"
          subtitle="Triggered automatically for every newly granted privilege. The transition to routine status is blocked until it is complete and documented."
          action={<Ref>§8.4</Ref>}
        >
          {fppes.length === 0 ? (
            <Empty>No FPPE in progress.</Empty>
          ) : (
            <Table head={["Clinician", "Privilege", "Method", "Trigger", "Progress", "Due", "Status"]}>
              {fppes.map((f, i) => (
                <tr key={i}>
                  <Td>
                    <CaseLink id={f.caseId}>{f.clinician}</CaseLink>
                  </Td>
                  <Td className="text-xs">{f.status.fppe.privilegeId}</Td>
                  <Td className="text-xs">{f.status.fppe.method.replaceAll("_", " ").toLowerCase()}</Td>
                  <Td className="text-xs">{f.status.fppe.trigger.replaceAll("_", " ").toLowerCase()}</Td>
                  <Td className="w-40">
                    <div className="nums text-xs">
                      {f.status.fppe.completedVolume}/{f.status.fppe.volumeThreshold}
                    </div>
                    <Bar percent={f.status.progressPercent} tone={f.status.overdue ? "risk" : "info"} />
                  </Td>
                  <Td className="nums text-xs">{formatDate(f.status.fppe.due)}</Td>
                  <Td>
                    <Chip tone={f.status.complete ? "ok" : f.status.overdue ? "risk" : "warn"}>
                      {f.status.complete ? "complete" : f.status.overdue ? "overdue" : `${f.status.daysRemaining}d left`}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-3 text-xs text-slate-500">
            OPPE for a 24-month appointment term beginning 2026-06-01 falls due{" "}
            {oppeDueDates("2026-06-01", 24).map(formatDate).join(", ")} — more frequently than
            annually, feeding back into reappointment and privilege continuation.
          </p>
        </Card>

        <Card
          title="Committee throughput"
          subtitle="Decisions, deferral rate and the reasons behind deferrals — the numbers that tell you whether the bottleneck is the committee calendar or the files reaching it."
          action={<Ref>§13</Ref>}
        >
          <Table head={["Body", "Decided", "Deferred", "Deferral rate", "Avg days", "Reasons"]}>
            {throughput.map((t) => (
              <tr key={t.body}>
                <Td className="font-medium">{t.body.replaceAll("_", " ").toLowerCase()}</Td>
                <Td className="nums">{t.decided}</Td>
                <Td className="nums">{t.deferred}</Td>
                <Td className="nums">{t.deferralRate}%</Td>
                <Td className="nums">{t.averageDaysToDecision ?? "—"}</Td>
                <Td className="max-w-md text-xs text-slate-600">
                  {t.topDeferralReasons.map((r) => `${r.reason} (${r.count})`).join("; ") || "—"}
                </Td>
              </tr>
            ))}
          </Table>

          {voteProblems.length > 0 && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-risk">
                Recorded decisions failing validation
              </h3>
              <ul className="mt-1 space-y-1 text-sm text-slate-700">
                {voteProblems.map((v, i) => (
                  <li key={i}>
                    {v.review.body.replaceAll("_", " ").toLowerCase()} on {formatDate(v.review.decided)}:{" "}
                    {v.validation.problems.join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card
          title="Delineation of privileges library"
          subtitle="Versioned per department, with effective dates. Core privileges bundle by specialty; special privileges carry their own criteria."
          action={<Ref>§8.2</Ref>}
        >
          {PRIVILEGE_SETS.map((set) => (
            <div key={set.id} className="mb-6 last:mb-0">
              <h3 className="text-sm font-medium">
                {set.name}{" "}
                <span className="text-xs font-normal text-slate-500">
                  v{set.version} · effective {formatDate(set.effective)} · {set.department} ·{" "}
                  {set.appliesTo.join(", ")}
                </span>
              </h3>
              <div className="mt-2">
                <Table head={["Privilege", "Kind", "Criteria"]}>
                  {PRIVILEGES.filter((p) => p.privilegeSetId === set.id).map((p) => (
                    <tr key={p.id}>
                      <Td className="font-medium">{p.name}</Td>
                      <Td>
                        <Chip tone={p.kind === "SPECIAL" ? "warn" : "muted"}>{p.kind.toLowerCase()}</Chip>
                      </Td>
                      <Td className="text-xs text-slate-600">
                        {p.criteria.map((c) => c.label).join(" · ")}
                      </Td>
                    </tr>
                  ))}
                </Table>
              </div>
            </div>
          ))}
        </Card>

        <p className="text-xs text-slate-500">
          Evaluated as of {formatDate(today)} against Joint Commission standards, with a 24-month
          reappointment cycle and a 36-month recredentialing cycle — all tenant configuration.
        </p>
      </div>
    </>
  );
}
