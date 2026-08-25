import Link from "next/link";
import { notFound } from "next/navigation";
import { CASES } from "@/data/practitioners";
import { buildCaseView, today } from "@/lib/case-view";
import { formatDate, relativeDays } from "@/domain/dates";
import { labelProgram } from "@/domain/payors";
import {
  Bar,
  Card,
  Chip,
  Empty,
  PageHeader,
  Ref,
  Stat,
  Table,
  Td,
  money,
  riskTone,
  type Tone,
} from "@/components/ui";

export function generateStaticParams() {
  return CASES.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = buildCaseView(id);
  if (!view) return { title: "Case not found" };
  return {
    title: `${view.practitioner.legalFirstName} ${view.practitioner.legalLastName}`,
  };
}

const MILESTONE_TONE: Record<string, Tone> = {
  DONE: "ok",
  ON_TRACK: "ok",
  TIGHT: "warn",
  AT_RISK: "risk",
};

const PSV_TONE: Record<string, Tone> = {
  VERIFIED: "ok",
  EXPIRING_BEFORE_DECISION: "warn",
  STALE: "risk",
  MISSING: "risk",
  IN_PROGRESS: "warn",
  DISCREPANCY: "warn",
  ADVERSE: "risk",
  UNABLE_TO_VERIFY: "risk",
};

const SECTIONS = [
  ["timeline", "Timeline"],
  ["application", "Application"],
  ["psv", "Verification"],
  ["payors", "Payor enrollment"],
  ["privileges", "Privileging"],
  ["app", "Scope & supervision"],
  ["billing", "Billing"],
  ["gates", "Gates"],
  ["expirables", "Expirables"],
  ["tasks", "Work"],
] as const;

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = buildCaseView(id);
  if (!view) notFound();

  const { practitioner: p, onboardingCase: kase, plan } = view;
  const name = `${p.legalFirstName} ${p.legalLastName}, ${p.type}`;

  return (
    <>
      <PageHeader
        eyebrow={`Case ${kase.id} · ${kase.stage.replaceAll("_", " ").toLowerCase()}`}
        title={name}
        lede={`${p.primarySpecialty} · ${kase.employmentType.replaceAll("_", " ").toLowerCase()} · start date ${formatDate(kase.startDate)} (${relativeDays(today, kase.startDate)}) · ${view.facilityNames.join(", ")}`}
      >
        <nav aria-label="Case sections" className="mt-4 flex flex-wrap gap-2">
          {SECTIONS.filter(([key]) => key !== "app" || view.app).map(([key, label]) => (
            <a
              key={key}
              href={`#${key}`}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-ink"
            >
              {label}
            </a>
          ))}
          <Link
            href={`/portal/${kase.id}`}
            className="rounded-full border border-info bg-sky-50 px-3 py-1 text-xs font-medium text-info hover:bg-sky-100"
          >
            View clinician portal →
          </Link>
        </nav>
      </PageHeader>

      <div
        className={`mb-6 rounded-xl border p-4 ${
          plan.riskLevel === "RED"
            ? "border-rose-200 bg-rose-50"
            : plan.riskLevel === "AMBER"
              ? "border-amber-200 bg-amber-50"
              : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={riskTone(plan.riskLevel)}>Start date {plan.riskLevel.toLowerCase()}</Chip>
          <Chip tone={riskTone(plan.billingRiskLevel)}>Revenue {plan.billingRiskLevel.toLowerCase()}</Chip>
          <span className="text-sm text-slate-700">{plan.riskSummary}</span>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Projected ready to start {formatDate(plan.projectedStartReadiness)} · projected first
          billable {formatDate(plan.projectedFirstBillable)} · critical path:{" "}
          {plan.criticalPath.join(" → ")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="File completeness"
          value={`${view.psv.completenessPercent}%`}
          hint={`${view.psv.verified} of ${view.psv.total} verified`}
          tone={view.psv.decisionReady ? "ok" : "warn"}
        />
        <Stat
          label="Application"
          value={`${view.completeness.percentComplete}%`}
          hint={`${view.completeness.deficiencies.filter((d) => d.severity === "BLOCKING").length} blocking deficiencies`}
          tone={view.completeness.complete ? "ok" : "warn"}
        />
        <Stat
          label="Payors effective"
          value={`${view.enrollments.filter((e) => e.effectiveDate).length}/${view.enrollments.length}`}
          hint={view.fullyBillableOn ? `Fully billable ${formatDate(view.fullyBillableOn)}` : "Not fully billable yet"}
          tone={view.billingHold.anyHold ? "warn" : "ok"}
        />
        <Stat
          label="Revenue held"
          value={money(view.revenue.totalHeld + view.revenue.unrecoverable)}
          hint={view.revenue.unrecoverable > 0 ? `${money(view.revenue.unrecoverable)} already unrecoverable` : "None past a filing limit"}
          tone={view.revenue.unrecoverable > 0 ? "risk" : view.revenue.totalHeld > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="mt-6 space-y-6">
        {/* ---------------------------------------------------------------- */}
        <Card
          id="timeline"
          title="Backward-planned timeline"
          subtitle="Required-by dates are derived from the start date and the first-billable target, then compared against the earliest realistic finish. Negative slack is the flag."
          action={<Ref>§4.1</Ref>}
        >
          <Table head={["Milestone", "Track", "Waiting on", "Earliest finish", "Required by", "Slack", "Gate"]}>
            {plan.milestones.map((m) => (
              <tr key={m.id}>
                <Td>
                  <span className="font-medium">{m.label}</span>
                  {m.actualFinish && (
                    <div className="text-xs text-ok">completed {formatDate(m.actualFinish)}</div>
                  )}
                </Td>
                <Td className="text-xs uppercase text-slate-500">{m.track.toLowerCase()}</Td>
                <Td className="text-xs text-slate-600">{m.waitingOn.replaceAll("_", " ").toLowerCase()}</Td>
                <Td className="nums whitespace-nowrap">{formatDate(m.earliestFinish)}</Td>
                <Td className="nums whitespace-nowrap">{formatDate(m.requiredBy)}</Td>
                <Td>
                  <Chip tone={MILESTONE_TONE[m.status] ?? "muted"}>
                    {m.status === "DONE" ? "done" : `${m.slackDays}d`}
                  </Chip>
                </Td>
                <Td className="text-xs text-slate-500">
                  {m.gate === "FIRST_BILLABLE" ? "first billable" : "start date"}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card
          id="application"
          title="Application completeness"
          subtitle="One combined application serves medical staff, payor and HR needs. The return-to-applicant loop names the specific deficiency rather than declaring the file incomplete."
          action={<Ref>§4.2</Ref>}
        >
          <div className="mb-4 flex items-center gap-3">
            <Bar percent={view.completeness.percentComplete} tone={view.completeness.complete ? "ok" : "warn"} />
            <span className="nums text-sm font-medium">{view.completeness.percentComplete}%</span>
          </div>

          {view.completeness.enhancedReviewRequired && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-warn">
              Affirmative adverse disclosure — routed to the enhanced review path with careful NPDB
              handling (§15.7).
            </p>
          )}

          {view.completeness.deficiencies.length === 0 ? (
            <Empty>No outstanding deficiencies.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {view.completeness.deficiencies.map((d, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2">
                  <Chip tone={d.severity === "BLOCKING" ? "risk" : "warn"}>
                    {d.owner.toLowerCase()}
                  </Chip>
                  <span className="text-slate-700">{d.message}</span>
                </li>
              ))}
            </ul>
          )}

          {view.completeness.gaps.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Work history gaps over 30 days
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {view.completeness.gaps.map((g, i) => (
                  <li key={i}>
                    {g.days} days between {g.afterEmployer} and {g.beforeEmployer} —{" "}
                    {g.explained ? (
                      <span className="text-ok">explained</span>
                    ) : (
                      <span className="text-risk">explanation required</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card
          id="psv"
          title="Primary source verification"
          subtitle={`Evaluated against a projected decision date of ${formatDate(view.psvDecisionDate)} using the ${view.psv.psvValidityDaysApplied}-day validity window under ${view.psv.accreditorApplied.replaceAll("_", " ").toLowerCase()} standards. A file complete in March is not complete for a September committee.`}
          action={<Ref>§4.3, §6</Ref>}
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Verified" value={view.psv.verified} tone="ok" />
            <Stat label="Missing" value={view.psv.missing} tone={view.psv.missing ? "risk" : "ok"} />
            <Stat label="Stale at decision" value={view.psv.stale} tone={view.psv.stale ? "risk" : "ok"} />
            <Stat
              label="Needs adjudication"
              value={view.psv.needsAdjudication}
              tone={view.psv.needsAdjudication ? "warn" : "ok"}
            />
          </div>

          {view.delta && (
            <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-info">
              Prior file found. {view.delta.reusedCount} verifications are reusable inside the
              validity window — including {view.delta.savedManualTouches} high-follow-up manual
              sources — so only {view.delta.mustReverify.length} elements need re-running (§15.8).
            </p>
          )}

          <Table head={["Element", "Subject", "Source", "Method", "Verified", "Stale on", "Status"]}>
            {view.psv.items.map((item, i) => (
              <tr key={i}>
                <Td className="font-medium">{item.required.entry.label}</Td>
                <Td className="text-xs text-slate-600">
                  {item.required.subject ?? item.required.state ?? "—"}
                </Td>
                <Td className="text-xs text-slate-600">
                  {item.verification?.source ?? item.required.entry.primarySource}
                  {item.required.entry.highFollowUp && !item.verification && (
                    <div className="text-xs text-slate-400">high follow-up source</div>
                  )}
                </Td>
                <Td className="text-xs text-slate-600">{item.verification?.method ?? item.required.entry.automation}</Td>
                <Td className="nums whitespace-nowrap text-xs">
                  {item.verification ? formatDate(item.verification.verifiedOn) : "—"}
                </Td>
                <Td className="nums whitespace-nowrap text-xs">{item.staleOn ? formatDate(item.staleOn) : "—"}</Td>
                <Td>
                  <Chip tone={PSV_TONE[item.status] ?? "muted"}>
                    {item.status.replaceAll("_", " ").toLowerCase()}
                  </Chip>
                  {item.verification?.result === "DISCREPANCY" && (
                    <div className="mt-1 max-w-xs text-xs text-slate-600">
                      Self-reported {item.verification.selfReported}; verified{" "}
                      {item.verification.verified}. Flagged for adjudication — not overwritten.
                    </div>
                  )}
                  {item.verification?.notes && item.verification.result === "ADVERSE" && (
                    <div className="mt-1 max-w-xs text-xs text-slate-600">{item.verification.notes}</div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card
          id="payors"
          title="Payor enrollment"
          subtitle="The required set is derived from this clinician's locations, TINs and specialty against the organization's active contracts — not from a specialist's memory."
          action={<Ref>§7</Ref>}
        >
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Derived requirement ({view.requiredEnrollments.length} rows)
          </h3>
          <Table head={["Payor / product", "TIN", "Location", "Channel", "Delegated", "Blockers"]}>
            {view.requiredEnrollments.map((r) => (
              <tr key={r.key}>
                <Td>
                  <span className="font-medium">{r.payor.name}</span>
                  <div className="text-xs text-slate-500">
                    {r.product.name} · {labelProgram(r.payor.program)}
                  </div>
                </Td>
                <Td className="nums text-xs">{r.organization.tin}</Td>
                <Td className="text-xs">{r.location.name}</Td>
                <Td className="text-xs">{r.submissionChannel.toLowerCase()}</Td>
                <Td>{r.delegated ? <Chip tone="info">roster</Chip> : <Chip tone="muted">application</Chip>}</Td>
                <Td>
                  {r.blockers.length === 0 ? (
                    <Chip tone="ok">clear</Chip>
                  ) : (
                    <ul className="space-y-1">
                      {r.blockers.map((b, i) => (
                        <li key={i} className="max-w-sm text-xs">
                          <Chip tone="risk">{b.kind.replaceAll("_", " ").toLowerCase()}</Chip>
                          <div className="mt-1 text-slate-600">{b.detail}</div>
                          <div className="text-slate-500">{b.remedy}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
              </tr>
            ))}
          </Table>

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Submissions in flight
          </h3>
          {view.enrollments.length === 0 ? (
            <Empty>No submissions yet.</Empty>
          ) : (
            <Table head={["Enrollment", "Status", "Submitted", "Effective", "Follow-ups", "Notes"]}>
              {view.enrollments.map((e) => (
                <tr key={e.id}>
                  <Td className="text-xs">
                    <span className="font-medium">{e.trackingNumber ?? e.id}</span>
                    <div className="text-slate-500">{e.analystContact ?? "no analyst contact"}</div>
                  </Td>
                  <Td>
                    <Chip
                      tone={
                        e.status === "APPROVED"
                          ? "ok"
                          : e.status === "DENIED" || e.status === "ADDITIONAL_INFO_REQUESTED"
                            ? "warn"
                            : "muted"
                      }
                    >
                      {e.status.replaceAll("_", " ").toLowerCase()}
                    </Chip>
                  </Td>
                  <Td className="nums whitespace-nowrap text-xs">{formatDate(e.submitted)}</Td>
                  <Td className="nums whitespace-nowrap text-xs">
                    {formatDate(e.effectiveDate)}
                    {e.retroactiveTo && (
                      <div className="text-ok">retro to {formatDate(e.retroactiveTo)}</div>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {e.followUps.length === 0
                      ? "—"
                      : e.followUps.map((f, i) => (
                          <div key={i}>
                            {formatDate(f.date)} · {f.channel.toLowerCase()} — {f.outcome}
                          </div>
                        ))}
                  </Td>
                  <Td className="max-w-xs text-xs text-slate-600">{e.notes ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card
          id="privileges"
          title="Clinical privileges"
          subtitle={
            view.privilegeSetName
              ? `${view.privilegeSetName}. Requests are validated against verified credentials and evidenced case volume; unsupported requests are the most common survey finding.`
              : "No privilege request on this case."
          }
          action={<Ref>§8.2–8.4</Ref>}
        >
          {!view.privilege ? (
            <Empty>No privilege request has been filed.</Empty>
          ) : (
            <>
              {view.temporary && (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-warn">
                  Temporary privileges ({view.temporary.reason}) granted{" "}
                  {formatDate(view.temporary.granted)}, expiring {formatDate(view.temporary.expires)} —{" "}
                  {view.temporary.daysRemaining} days remaining. Duration limits are strict and may not
                  be extended.
                </p>
              )}

              <Table head={["Privilege", "Criteria", "Volume", "Recommendation"]}>
                {view.privilege.evaluations.map((e) => (
                  <tr key={e.privilege.id}>
                    <Td>
                      <span className="font-medium">{e.privilege.name}</span>
                      <div className="text-xs text-slate-500">{e.privilege.kind.toLowerCase()}</div>
                    </Td>
                    <Td>
                      <ul className="space-y-1 text-xs">
                        {e.results.map((r, i) => (
                          <li key={i} className={r.met ? "text-slate-600" : "text-risk"}>
                            {r.met ? "✓" : "✕"} {r.criterion.label} — {r.evidence}
                          </li>
                        ))}
                      </ul>
                    </Td>
                    <Td className="nums text-xs">
                      {e.item.claimedVolume !== undefined ? (
                        <>
                          claimed {e.item.claimedVolume}
                          <div className={e.volumeDiscrepancy ? "text-risk" : "text-slate-500"}>
                            evidenced {e.item.evidencedVolume ?? 0}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <Chip
                        tone={
                          e.recommendation === "GRANT"
                            ? "ok"
                            : e.recommendation === "GRANT_WITH_PROCTORING"
                              ? "warn"
                              : "risk"
                        }
                      >
                        {e.recommendation.replaceAll("_", " ").toLowerCase()}
                      </Chip>
                    </Td>
                  </tr>
                ))}
              </Table>

              <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Approval chain
              </h3>
              <Table head={["Body", "Scheduled", "Decided", "Outcome", "Quorum", "Vote"]}>
                {view.reviews.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-medium">{r.body.replaceAll("_", " ").toLowerCase()}</Td>
                    <Td className="nums text-xs">{formatDate(r.scheduled)}</Td>
                    <Td className="nums text-xs">{formatDate(r.decided)}</Td>
                    <Td>
                      {r.outcome ? (
                        <Chip
                          tone={
                            r.outcome.startsWith("APPROVED")
                              ? "ok"
                              : r.outcome === "DEFERRED"
                                ? "warn"
                                : "risk"
                          }
                        >
                          {r.outcome.replaceAll("_", " ").toLowerCase()}
                        </Chip>
                      ) : (
                        <Chip tone="muted">pending</Chip>
                      )}
                      {r.deferralReason && (
                        <div className="mt-1 max-w-sm text-xs text-slate-600">{r.deferralReason}</div>
                      )}
                    </Td>
                    <Td className="nums text-xs">
                      {r.membersPresent ?? "—"} / {r.quorumRequired ?? "—"}
                    </Td>
                    <Td className="nums text-xs">
                      {r.votesFor ?? 0}–{r.votesAgainst ?? 0}
                    </Td>
                  </tr>
                ))}
              </Table>
              {view.nextApproval && (
                <p className="mt-3 text-sm text-slate-600">
                  Next step: <strong>{view.nextApproval.replaceAll("_", " ").toLowerCase()}</strong>
                </p>
              )}

              {view.privilege.blockers.length > 0 && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-risk">
                    Blocking the committee packet
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {view.privilege.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {view.fppe.length > 0 && (
                <>
                  <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    FPPE — every newly granted privilege
                  </h3>
                  <Table head={["Privilege", "Method", "Progress", "Due", "Status"]}>
                    {view.fppe.map((f) => (
                      <tr key={f.fppe.id}>
                        <Td className="text-xs">{f.fppe.privilegeId}</Td>
                        <Td className="text-xs">{f.fppe.method.replaceAll("_", " ").toLowerCase()}</Td>
                        <Td className="w-40">
                          <div className="nums text-xs">
                            {f.fppe.completedVolume}/{f.fppe.volumeThreshold}
                          </div>
                          <Bar percent={f.progressPercent} tone={f.overdue ? "risk" : "info"} />
                        </Td>
                        <Td className="nums text-xs">{formatDate(f.fppe.due)}</Td>
                        <Td>
                          <Chip tone={f.complete ? "ok" : f.overdue ? "risk" : "warn"}>
                            {f.complete ? "complete" : f.overdue ? "overdue" : "in progress"}
                          </Chip>
                          {f.blocksRoutineStatus && (
                            <div className="mt-1 text-xs text-slate-600">
                              Blocks transition to routine status
                            </div>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </Table>
                </>
              )}
            </>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {view.app && (
          <Card
            id="app"
            title="Scope of practice, supervision and APP billing"
            subtitle="An APP is not a physician with fewer fields: the agreement, the state scope rules, the supervisor's capacity and the billing model all change what is permitted."
            action={<Ref>§9</Ref>}
          >
            {view.app.supervision && (
              <p
                className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                  view.app.supervision.overCapacity
                    ? "border-rose-200 bg-rose-50 text-risk"
                    : "border-line bg-slate-50 text-slate-700"
                }`}
              >
                {view.app.supervision.message}
              </p>
            )}

            {view.app.agreementProblems.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Collaborative practice agreement
                </h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-risk">
                  {view.app.agreementProblems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <Table head={["State", "Authority", "Agreement", "Permitted schedules", "Findings"]}>
              {view.app.scope.map((s) => (
                <tr key={s.state}>
                  <Td className="font-medium">{s.state}</Td>
                  <Td>
                    <Chip tone={s.rule?.authority === "FULL" ? "ok" : "warn"}>
                      {s.rule?.authority.toLowerCase() ?? "unconfigured"}
                    </Chip>
                  </Td>
                  <Td>
                    {s.agreementRequired ? (
                      <Chip tone={s.agreementSatisfied ? "ok" : "risk"}>
                        {s.agreementSatisfied ? "satisfied" : "required"}
                      </Chip>
                    ) : (
                      <Chip tone="muted">not required</Chip>
                    )}
                  </Td>
                  <Td className="nums text-xs">{s.permittedSchedules.join(", ") || "none"}</Td>
                  <Td className="max-w-sm text-xs text-risk">
                    {s.problems.length === 0 ? <span className="text-ok">clear</span> : s.problems.join(" ")}
                  </Td>
                </tr>
              ))}
            </Table>

            <p className="mt-4 text-sm text-slate-700">
              <strong>Co-signature routing:</strong> {view.app.coSignature.ehrRule}
            </p>

            <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Billing model by payor
            </h3>
            <Table head={["Payor", "Model", "Why", "Documentation"]}>
              {view.app.billingModels.map((b) => (
                <tr key={b.payorName}>
                  <Td className="font-medium">{b.payorName}</Td>
                  <Td>
                    <Chip tone={b.assessment.forcedBySupervisorRequirement ? "warn" : "muted"}>
                      {b.assessment.model.replaceAll("_", " ").toLowerCase()}
                    </Chip>
                  </Td>
                  <Td className="max-w-xs text-xs text-slate-600">{b.assessment.rationale}</Td>
                  <Td className="max-w-xs text-xs text-slate-600">
                    {b.assessment.documentationRequirements.join("; ") || "—"}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        <Card
          id="billing"
          title="First billable date and claim release"
          subtitle="Tracked per payor per TIN per location, derived from each payor's effective date — never from the employment start date."
          action={<Ref>§4.7</Ref>}
        >
          {view.bridge && (
            <p
              className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                view.bridge.expired ? "border-rose-200 bg-rose-50 text-risk" : "border-amber-200 bg-amber-50 text-warn"
              }`}
            >
              {view.bridge.arrangement.kind.replaceAll("_", " ").toLowerCase()} bridge, modifier{" "}
              {view.bridge.arrangement.modifier}: day {view.bridge.daysUsed} of{" "}
              {view.bridge.arrangement.maxContinuousDays}.{" "}
              {view.bridge.warning ?? "Within the continuous period limit."}
            </p>
          )}

          <Table head={["Payor / product", "TIN", "Location", "Effective", "First billable", "Unbillable days", "Hold"]}>
            {view.billingRows.map((r) => (
              <tr key={r.enrollmentId}>
                <Td>
                  <span className="font-medium">{r.payorName}</span>
                  <div className="text-xs text-slate-500">{r.productName}</div>
                </Td>
                <Td className="nums text-xs">{r.tin}</Td>
                <Td className="text-xs">{r.locationName}</Td>
                <Td className="nums whitespace-nowrap text-xs">{formatDate(r.effectiveDate)}</Td>
                <Td className="nums whitespace-nowrap text-xs">{formatDate(r.firstBillableDate)}</Td>
                <Td className="nums text-xs">
                  {r.unbillableDaysFromStart === null ? "—" : `${r.unbillableDaysFromStart}d`}
                </Td>
                <Td>
                  <Chip tone={r.billingHold ? "risk" : "ok"}>{r.billingHold ? "hold" : "released"}</Chip>
                </Td>
              </tr>
            ))}
          </Table>

          {view.claims.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Held claims and filing limits
              </h3>
              <Table head={["Claim", "Service date", "Amount", "Filing deadline", "Days left", "Disposition"]}>
                {view.claims.map((c) => (
                  <tr key={c.claim.id}>
                    <Td className="text-xs font-medium">{c.claim.id}</Td>
                    <Td className="nums text-xs">{formatDate(c.claim.serviceDate)}</Td>
                    <Td className="nums text-xs">{money(c.claim.amount)}</Td>
                    <Td className="nums text-xs">{formatDate(c.filingDeadline)}</Td>
                    <Td className="nums text-xs">{c.daysToFilingDeadline}</Td>
                    <Td>
                      <Chip
                        tone={
                          c.disposition === "FILING_LIMIT_EXPIRED"
                            ? "risk"
                            : c.disposition === "RELEASABLE" || c.disposition === "RELEASABLE_URGENT"
                              ? "ok"
                              : "warn"
                        }
                      >
                        {c.disposition.replaceAll("_", " ").toLowerCase()}
                      </Chip>
                      <div className="mt-1 max-w-sm text-xs text-slate-600">{c.reason}</div>
                    </Td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card
          id="gates"
          title="Provisioning and release gates"
          subtitle="Declarative rules an administrator edits without code. A closed gate names the condition that failed and its current value."
          action={<Ref>§10, §4.6</Ref>}
        >
          <ul className="space-y-3">
            {view.gates.map((g) => (
              <li key={g.rule.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={g.satisfied ? "ok" : g.rule.severity === "BLOCKING" ? "risk" : "warn"}>
                    {g.satisfied ? "open" : g.rule.severity === "BLOCKING" ? "blocked" : "warning"}
                  </Chip>
                  <span className="text-sm font-medium">{g.rule.name}</span>
                  <span className="text-xs text-slate-500">gates {g.rule.gates.toLowerCase()}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{g.rule.description}</p>
                {!g.satisfied && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {g.unmet.map((u, i) => (
                      <li key={i}>✕ {u.explanation}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card
          id="expirables"
          title="Expirables"
          action={<Ref>§10, §11</Ref>}
          subtitle="Each dated credential with the action that fires at expiration."
        >
          <Table head={["Credential", "Expires", "Days", "At expiration", "Status"]}>
            {[
              ...view.expirables.lapsed,
              ...view.expirables.within30,
              ...view.expirables.within60,
              ...view.expirables.within90,
              ...view.expirables.beyond90,
            ].map((e) => (
              <tr key={e.expirable.id}>
                <Td className="font-medium">{e.expirable.label}</Td>
                <Td className="nums text-xs">{formatDate(e.expirable.expires)}</Td>
                <Td className="nums text-xs">{e.daysRemaining}</Td>
                <Td className="text-xs text-slate-600">
                  {e.action.replaceAll("_", " ").toLowerCase()}
                </Td>
                <Td>
                  <Chip
                    tone={
                      e.status === "LAPSED" || e.status === "DUE_TODAY"
                        ? "risk"
                        : e.status === "URGENT"
                          ? "warn"
                          : e.status === "UPCOMING"
                            ? "info"
                            : "ok"
                    }
                  >
                    {e.status.replaceAll("_", " ").toLowerCase()}
                  </Chip>
                  {e.leadThreshold !== null && e.status !== "CURRENT" && (
                    <div className="text-xs text-slate-500">{e.leadThreshold}-day notice active</div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card
          id="tasks"
          title="Work and bottleneck attribution"
          subtitle="Where the days are going, split between the clinician, internal staff, external sources, payors and committees."
          action={<Ref>§13</Ref>}
        >
          <div className="mb-5 space-y-2">
            {view.bottlenecks
              .filter((b) => b.days > 0)
              .map((b) => (
                <div key={b.owner} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs text-slate-600">
                    {b.owner.replaceAll("_", " ").toLowerCase()}
                  </span>
                  <Bar percent={b.percent} tone={b.owner === "CLINICIAN" ? "warn" : "info"} />
                  <span className="nums w-24 shrink-0 text-right text-xs text-slate-600">
                    {b.days}d · {b.percent}%
                  </span>
                </div>
              ))}
          </div>

          {view.responsiveness.nextEscalation && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-warn">
              Clinician has {view.responsiveness.overdueTasks} overdue task(s), {view.responsiveness.totalDaysWaiting}{" "}
              cumulative days waiting. Next escalation:{" "}
              {view.responsiveness.nextEscalation.replaceAll("_", " ").toLowerCase()}.
            </p>
          )}

          <Table head={["Task", "Owner", "Due", "Status", "Reminders"]}>
            {view.tasks.map((t) => (
              <tr key={t.id}>
                <Td className="font-medium">{t.title}</Td>
                <Td className="text-xs">{t.ownerRole.replaceAll("_", " ").toLowerCase()}</Td>
                <Td className="nums text-xs">{formatDate(t.due)}</Td>
                <Td>
                  <Chip
                    tone={
                      t.status === "DONE"
                        ? "ok"
                        : t.status === "BLOCKED"
                          ? "risk"
                          : t.due < today
                            ? "warn"
                            : "muted"
                    }
                  >
                    {t.status.replaceAll("_", " ").toLowerCase()}
                  </Chip>
                </Td>
                <Td className="nums text-xs">{t.remindersSent}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
