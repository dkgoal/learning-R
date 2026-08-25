import Link from "next/link";
import {
  caseSummaries,
  portfolioExpirables,
  portfolioFollowUps,
  portfolioRevenue,
  today,
} from "@/lib/case-view";
import { ENROLLMENTS, CASES, TASKS } from "@/data/practitioners";
import { portfolioKpis, queueAging } from "@/domain/kpi";
import { formatDate, relativeDays } from "@/domain/dates";
import {
  Bar,
  Card,
  CaseLink,
  Chip,
  Empty,
  PageHeader,
  Ref,
  Stat,
  Table,
  Td,
  money,
  riskTone,
} from "@/components/ui";

export default function DashboardPage() {
  const summaries = caseSummaries();
  const revenue = portfolioRevenue();
  const expirables = portfolioExpirables();
  const followUps = portfolioFollowUps();
  const queues = queueAging(TASKS, today);

  const enrollmentsByCase = Object.fromEntries(
    CASES.map((c) => [c.id, ENROLLMENTS.filter((e) => e.caseId === c.id)]),
  );
  const kpis = portfolioKpis(
    CASES,
    enrollmentsByCase,
    summaries.filter((s) => s.riskLevel === "RED").map((s) => s.id),
    today,
  );

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Onboarding dashboard"
        lede="Five active cases across two legal entities and two hospitals. Start-date risk and revenue risk are reported separately: payor effective dates trail a start date on nearly every case, and folding that into one status would paint everything red."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active cases" value={kpis.activeCases} hint={`${kpis.casesAtRisk} with an unachievable start date`} tone={kpis.casesAtRisk > 0 ? "risk" : "ok"} />
        <Stat
          label="Revenue held"
          value={money(revenue.totalHeld)}
          hint={`${money(revenue.imminentLoss)} within 30 days of a filing limit`}
          tone={revenue.imminentLoss > 0 ? "warn" : "muted"}
        />
        <Stat
          label="Already unrecoverable"
          value={money(revenue.unrecoverable)}
          hint="Held past the payor filing limit"
          tone={revenue.unrecoverable > 0 ? "risk" : "ok"}
        />
        <Stat
          label="Enrollments pending"
          value={kpis.enrollmentsPending}
          hint={`${kpis.enrollmentsOverdue} past the payor's own typical turnaround`}
          tone={kpis.enrollmentsOverdue > 0 ? "warn" : "muted"}
        />
      </div>

      <div className="mt-6 space-y-6">
        <Card
          title="Cases"
          subtitle="Backward-planned from each start date. Slippage is the gap between the projected readiness date and the committed date — visible on day one, not in month three."
          action={<Ref>§4.1</Ref>}
        >
          <Table
            head={[
              "Clinician",
              "Start date",
              "Start risk",
              "Billing risk",
              "PSV file",
              "Payors effective",
              "Open work",
            ]}
          >
            {summaries.map((s) => (
              <tr key={s.id} className="align-top">
                <Td>
                  <CaseLink id={s.id}>
                    {s.name}, {s.credential}
                  </CaseLink>
                  <div className="text-xs text-slate-500">{s.specialty}</div>
                  <div className="mt-1 text-xs text-slate-500">{s.riskSummary}</div>
                </Td>
                <Td className="nums whitespace-nowrap">
                  {formatDate(s.startDate)}
                  <div className="text-xs text-slate-500">{relativeDays(today, s.startDate)}</div>
                </Td>
                <Td>
                  <Chip tone={riskTone(s.riskLevel)}>
                    {s.startSlippage > 0 ? `${s.startSlippage}d late` : "achievable"}
                  </Chip>
                </Td>
                <Td>
                  <Chip tone={s.firstBillableSlippage > 30 ? "risk" : s.firstBillableSlippage > 0 ? "warn" : "ok"}>
                    {s.firstBillableSlippage > 0 ? `+${s.firstBillableSlippage}d to bill` : "billable at start"}
                  </Chip>
                </Td>
                <Td className="w-32">
                  <div className="nums text-xs text-slate-600">{s.psvPercent}%</div>
                  <Bar percent={s.psvPercent} tone={s.psvPercent >= 90 ? "ok" : s.psvPercent >= 50 ? "warn" : "risk"} />
                </Td>
                <Td className="nums whitespace-nowrap">
                  {s.enrollmentsEffective} / {s.enrollmentsTotal}
                </Td>
                <Td className="nums whitespace-nowrap">
                  {s.openTasks} open
                  {s.overdueTasks > 0 && (
                    <div className="text-xs text-risk">{s.overdueTasks} overdue</div>
                  )}
                  {s.blockers > 0 && <div className="text-xs text-slate-500">{s.blockers} blockers</div>}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card
            title="Expirables horizon"
            subtitle="Every dated credential generates its renewal ladder at 120/90/60/30/14/7/0 days, with the suspension action defined at expiration."
            action={<Ref>§10, §11</Ref>}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Lapsed" value={expirables.lapsed.length} tone={expirables.lapsed.length ? "risk" : "ok"} />
              <Stat label="≤30 days" value={expirables.within30.length} tone={expirables.within30.length ? "warn" : "ok"} />
              <Stat label="31–60" value={expirables.within60.length} />
              <Stat label="61–90" value={expirables.within90.length} />
            </div>
            <div className="mt-4">
              <Link href="/expirables" className="text-sm font-medium text-info hover:underline">
                Open the expirables dashboard →
              </Link>
            </div>
          </Card>

          <Card
            title="Payor follow-ups due"
            subtitle="Submissions with no contact inside the cadence, or already past the payor's own stated turnaround."
            action={<Ref>§7.1, §7.6</Ref>}
          >
            {followUps.length === 0 ? (
              <Empty>Nothing is waiting on a chase today.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {followUps.map((f) => (
                  <li key={f.enrollment.id} className="flex items-start justify-between gap-3 border-b border-line pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{f.enrollment.trackingNumber ?? f.enrollment.id}</div>
                      <div className="text-xs text-slate-500">
                        Submitted {formatDate(f.enrollment.submitted)} · {f.enrollment.status.replaceAll("_", " ").toLowerCase()}
                      </div>
                    </div>
                    <Chip tone={f.overdueVsTurnaround ? "risk" : "warn"}>
                      {f.daysSinceContact}d since contact
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card
          title="Queue aging by owner"
          subtitle="Clinician non-responsiveness is the most common cause of delay, so it is measured here rather than complained about."
          action={<Ref>§10, §13</Ref>}
        >
          <Table head={["Owner", "Open", "Overdue", "Oldest", "Avg age", "SLA breaches"]}>
            {queues.map((q) => (
              <tr key={q.ownerRole}>
                <Td className="font-medium">{q.ownerRole.replaceAll("_", " ").toLowerCase()}</Td>
                <Td className="nums">{q.open}</Td>
                <Td className="nums">
                  {q.overdue > 0 ? <span className="text-risk">{q.overdue}</span> : 0}
                </Td>
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
