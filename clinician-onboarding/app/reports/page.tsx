import { allViews, portfolioBenchmarks, portfolioRevenue, today } from "@/lib/case-view";
import { CASES, COMMITTEE_REVIEWS, ENROLLMENTS, TASKS } from "@/data/practitioners";
import { committeeThroughput, portfolioKpis, queueAging } from "@/domain/kpi";
import { formatDate } from "@/domain/dates";
import { Bar, Card, CaseLink, Chip, Empty, PageHeader, Ref, Stat, Table, Td, money } from "@/components/ui";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  const views = allViews();
  const revenue = portfolioRevenue();
  const benchmarks = portfolioBenchmarks();
  const throughput = committeeThroughput(COMMITTEE_REVIEWS);
  const queues = queueAging(TASKS, today);
  const kpis = portfolioKpis(
    CASES,
    Object.fromEntries(CASES.map((c) => [c.id, ENROLLMENTS.filter((e) => e.caseId === c.id)])),
    views.filter((v) => !v.plan.startDateAchievable).map((v) => v.onboardingCase.id),
    today,
  );

  // Bottleneck attribution rolled up across the portfolio: the same day is never
  // charged twice, because attribution runs off task ownership and payor clocks
  // rather than off overlapping stage boundaries.
  const rollup = new Map<string, number>();
  for (const v of views) {
    for (const b of v.bottlenecks) {
      rollup.set(b.owner, (rollup.get(b.owner) ?? 0) + b.days);
    }
  }
  const totalDays = [...rollup.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Reports and KPIs"
        lede="The headline metric is time to first billable encounter, not time to credentialing decision. A credentialing team can post an excellent decision time while the organization still cannot bill for the clinician."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Median days to first billable"
          value={kpis.medianDaysToFirstBillable ?? "—"}
          hint="From case initiation"
          tone="info"
        />
        <Stat label="Median days to decision" value={kpis.medianDaysToDecision ?? "—"} hint="Initiation to committee" />
        <Stat
          label="Cases at risk"
          value={kpis.casesAtRisk}
          hint={`of ${kpis.activeCases} active`}
          tone={kpis.casesAtRisk ? "risk" : "ok"}
        />
        <Stat
          label="Revenue at risk"
          value={money(revenue.totalHeld + revenue.unrecoverable)}
          hint={`${money(revenue.unrecoverable)} already unrecoverable`}
          tone={revenue.unrecoverable ? "risk" : "warn"}
        />
      </div>

      <div className="mt-6 space-y-6">
        <Card
          title="Time to first billable encounter, decomposed"
          subtitle="Initiation → application complete → PSV complete → committee decision → first payor effective date."
          action={<Ref>§13</Ref>}
        >
          <Table
            head={[
              "Clinician",
              "→ Application",
              "→ PSV",
              "→ Decision",
              "→ First effective",
              "Total",
              "Start to billable",
            ]}
          >
            {views.map((v) => (
              <tr key={v.onboardingCase.id}>
                <Td>
                  <CaseLink id={v.onboardingCase.id}>
                    {v.practitioner.legalFirstName} {v.practitioner.legalLastName}
                  </CaseLink>
                </Td>
                <Td className="nums">{v.durations.initiationToApplicationComplete ?? "—"}</Td>
                <Td className="nums">{v.durations.applicationCompleteToPsvComplete ?? "—"}</Td>
                <Td className="nums">{v.durations.psvCompleteToCommitteeDecision ?? "—"}</Td>
                <Td className="nums">{v.durations.committeeDecisionToFirstEffective ?? "—"}</Td>
                <Td className="nums font-medium">{v.durations.initiationToFirstBillable ?? "in flight"}</Td>
                <Td className="nums">
                  {v.durations.startDateToFirstBillable === null ? (
                    <span className="text-slate-400">—</span>
                  ) : v.durations.startDateToFirstBillable > 0 ? (
                    <span className="text-risk">+{v.durations.startDateToFirstBillable}d</span>
                  ) : (
                    <span className="text-ok">{v.durations.startDateToFirstBillable}d</span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-slate-500">
            Blank cells are stages the case has not reached. Durations are in calendar days.
          </p>
        </Card>

        <Card
          title="Bottleneck attribution"
          subtitle="Days waiting on the clinician versus internal staff, external sources, payors and committees — because “onboarding took 154 days” is not actionable and “84 of them were waiting on the clinician” is."
          action={<Ref>§13</Ref>}
        >
          <div className="space-y-2">
            {[...rollup.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([owner, days]) => (
                <div key={owner} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs text-slate-600">
                    {owner.replaceAll("_", " ").toLowerCase()}
                  </span>
                  <Bar
                    percent={totalDays === 0 ? 0 : (days / totalDays) * 100}
                    tone={owner === "CLINICIAN" ? "warn" : owner === "PAYOR" ? "risk" : "info"}
                  />
                  <span className="nums w-28 shrink-0 text-right text-xs text-slate-600">
                    {days}d · {totalDays === 0 ? 0 : Math.round((days / totalDays) * 100)}%
                  </span>
                </div>
              ))}
          </div>
        </Card>

        <Card
          title="Applications at risk against the start date"
          subtitle="Projected readiness versus the committed date, with the critical path driving the slip."
          action={<Ref>§4.1, §13</Ref>}
        >
          <Table head={["Clinician", "Start date", "Projected ready", "Slippage", "Critical path"]}>
            {views.map((v) => (
              <tr key={v.onboardingCase.id}>
                <Td>
                  <CaseLink id={v.onboardingCase.id}>
                    {v.practitioner.legalFirstName} {v.practitioner.legalLastName}
                  </CaseLink>
                </Td>
                <Td className="nums text-xs">{formatDate(v.onboardingCase.startDate)}</Td>
                <Td className="nums text-xs">{formatDate(v.plan.projectedStartReadiness)}</Td>
                <Td>
                  <Chip tone={v.plan.startDateSlippageDays > 0 ? "risk" : "ok"}>
                    {v.plan.startDateSlippageDays > 0
                      ? `${v.plan.startDateSlippageDays}d late`
                      : "achievable"}
                  </Chip>
                </Td>
                <Td className="text-xs text-slate-600">{v.plan.criticalPath.join(" → ")}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="Audit readiness — file completeness scoring"
          subtitle="Scored against the standard set actually applied, with the verification validity window in force at the time."
          action={<Ref>§13, §6</Ref>}
        >
          <Table head={["Clinician", "Verified", "Missing", "Stale", "Unadjudicated", "Score", "Decision ready"]}>
            {views.map((v) => (
              <tr key={v.onboardingCase.id}>
                <Td>
                  <CaseLink id={v.onboardingCase.id}>
                    {v.practitioner.legalFirstName} {v.practitioner.legalLastName}
                  </CaseLink>
                </Td>
                <Td className="nums">{v.psv.verified}</Td>
                <Td className="nums">{v.psv.missing}</Td>
                <Td className="nums">{v.psv.stale}</Td>
                <Td className="nums">{v.psv.needsAdjudication}</Td>
                <Td className="w-32">
                  <div className="nums text-xs">{v.psv.completenessPercent}%</div>
                  <Bar
                    percent={v.psv.completenessPercent}
                    tone={v.psv.completenessPercent >= 90 ? "ok" : v.psv.completenessPercent >= 50 ? "warn" : "risk"}
                  />
                </Td>
                <Td>
                  <Chip tone={v.psv.decisionReady ? "ok" : "warn"}>
                    {v.psv.decisionReady ? "ready" : "not ready"}
                  </Chip>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Payor turnaround" action={<Ref>§7.6</Ref>}>
            {benchmarks.length === 0 ? (
              <Empty>No completed enrollments yet.</Empty>
            ) : (
              <Table head={["Payor", "Median", "Pending", "Overdue"]}>
                {benchmarks.map((b) => (
                  <tr key={b.payorId}>
                    <Td className="text-sm font-medium">{b.payorName}</Td>
                    <Td className="nums">{b.medianDaysToEffective ?? "—"}</Td>
                    <Td className="nums">{b.pending}</Td>
                    <Td className="nums">{b.overdueCount}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Committee throughput and deferral rate" action={<Ref>§13</Ref>}>
            <Table head={["Body", "Decided", "Deferral rate", "Avg days"]}>
              {throughput.map((t) => (
                <tr key={t.body}>
                  <Td className="text-sm font-medium">{t.body.replaceAll("_", " ").toLowerCase()}</Td>
                  <Td className="nums">{t.decided}</Td>
                  <Td className="nums">{t.deferralRate}%</Td>
                  <Td className="nums">{t.averageDaysToDecision ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <Card
          title="Staff productivity and queue aging"
          subtitle="Open work by owner, with SLA breaches."
          action={<Ref>§13</Ref>}
        >
          <Table head={["Owner", "Open", "Overdue", "Oldest", "Avg age", "SLA breaches"]}>
            {queues.map((q) => (
              <tr key={q.ownerRole}>
                <Td className="font-medium">{q.ownerRole.replaceAll("_", " ").toLowerCase()}</Td>
                <Td className="nums">{q.open}</Td>
                <Td className="nums">{q.overdue}</Td>
                <Td className="nums">{q.oldestDays}d</Td>
                <Td className="nums">{q.averageAgeDays}d</Td>
                <Td className="nums">{q.slaBreaches}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
