import { allViews, portfolioClaims, portfolioRevenue, today } from "@/lib/case-view";
import { PAYORS } from "@/data/reference";
import { formatDate } from "@/domain/dates";
import { Card, CaseLink, Chip, Empty, PageHeader, Ref, Stat, Table, Td, money } from "@/components/ui";

export const metadata = { title: "Billing release" };

export default function BillingPage() {
  const views = allViews();
  const revenue = portfolioRevenue();
  const claims = portfolioClaims();
  const payorName = (id: string) => PAYORS.find((p) => p.id === id)?.name ?? id;

  const expired = claims.filter((c) => c.disposition === "FILING_LIMIT_EXPIRED");
  const imminent = claims
    .filter((c) => c.disposition === "HELD_NOT_YET_EFFECTIVE" && c.daysToFilingDeadline <= 30)
    .sort((a, b) => a.daysToFilingDeadline - b.daysToFilingDeadline);
  const releasable = claims.filter(
    (c) => c.disposition === "RELEASABLE" || c.disposition === "RELEASABLE_URGENT",
  );

  return (
    <>
      <PageHeader
        eyebrow="Revenue cycle"
        title="Billing hold and claim release"
        lede="The billing hold releases per payor as each written effective date is confirmed — never on the employment start date. Claims held during credentialing must still be filed inside the payor's filing limit; losing that window is the single largest financial leak in clinician onboarding."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Held, awaiting effective date" value={money(revenue.totalHeld)} tone={revenue.totalHeld ? "warn" : "ok"} />
        <Stat
          label="Within 30 days of the limit"
          value={money(revenue.imminentLoss)}
          hint={`${imminent.length} claim(s)`}
          tone={revenue.imminentLoss ? "risk" : "ok"}
        />
        <Stat
          label="Already unrecoverable"
          value={money(revenue.unrecoverable)}
          hint={`${expired.length} claim(s) filed too late`}
          tone={revenue.unrecoverable ? "risk" : "ok"}
        />
        <Stat label="Releasable now" value={money(revenue.releasableNow)} tone="ok" hint={`${releasable.length} claim(s)`} />
      </div>

      <div className="mt-6 space-y-6">
        {imminent.length > 0 && (
          <Card
            title="Act this week"
            subtitle="Held claims whose filing limit expires within 30 days. Either the effective date lands or this revenue is gone."
            action={<Ref>§4.7, §15.16</Ref>}
          >
            <Table head={["Claim", "Payor", "Service date", "Amount", "Deadline", "Days left"]}>
              {imminent.map((c) => (
                <tr key={c.claim.id}>
                  <Td className="text-xs font-medium">{c.claim.id}</Td>
                  <Td className="text-xs">{payorName(c.claim.payorId)}</Td>
                  <Td className="nums text-xs">{formatDate(c.claim.serviceDate)}</Td>
                  <Td className="nums text-xs">{money(c.claim.amount)}</Td>
                  <Td className="nums text-xs">{formatDate(c.filingDeadline)}</Td>
                  <Td>
                    <Chip tone="risk">{c.daysToFilingDeadline}d</Chip>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}

        <Card
          title="First billable date by payor, TIN and location"
          subtitle="One row per enrollment, because that is the grain at which billing actually becomes possible."
          action={<Ref>§4.7</Ref>}
        >
          {views.map((v) => (
            <div key={v.onboardingCase.id} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-sm font-medium">
                <CaseLink id={v.onboardingCase.id}>
                  {v.practitioner.legalFirstName} {v.practitioner.legalLastName}
                </CaseLink>{" "}
                <span className="text-xs font-normal text-slate-500">
                  start {formatDate(v.onboardingCase.startDate)} ·{" "}
                  {v.billingHold.releasedPercent}% of payors released
                  {v.fullyBillableOn ? ` · fully billable ${formatDate(v.fullyBillableOn)}` : ""}
                </span>
              </h3>
              {v.billingRows.length === 0 ? (
                <Empty>No enrollments submitted yet.</Empty>
              ) : (
                <Table head={["Payor / product", "TIN", "Location", "Effective", "First billable", "Days unbillable", "Hold"]}>
                  {v.billingRows.map((r) => (
                    <tr key={r.enrollmentId}>
                      <Td>
                        <span className="font-medium">{r.payorName}</span>
                        <div className="text-xs text-slate-500">{r.productName}</div>
                      </Td>
                      <Td className="nums text-xs">{r.tin}</Td>
                      <Td className="text-xs">{r.locationName}</Td>
                      <Td className="nums text-xs">{formatDate(r.effectiveDate)}</Td>
                      <Td className="nums text-xs">
                        {formatDate(r.firstBillableDate)}
                        {r.retroactiveTo && <div className="text-ok">retro applied</div>}
                      </Td>
                      <Td className="nums text-xs">
                        {r.unbillableDaysFromStart === null ? "—" : `${r.unbillableDaysFromStart}d`}
                      </Td>
                      <Td>
                        <Chip tone={r.billingHold ? "risk" : "ok"}>
                          {r.billingHold ? "hold" : "released"}
                        </Chip>
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
              {v.bridge && (
                <p className="mt-2 text-xs text-slate-600">
                  Interim bridge: {v.bridge.arrangement.kind.replaceAll("_", " ").toLowerCase()},
                  modifier {v.bridge.arrangement.modifier}, day {v.bridge.daysUsed} of{" "}
                  {v.bridge.arrangement.maxContinuousDays}. {v.bridge.warning ?? ""}
                </p>
              )}
            </div>
          ))}
        </Card>

        <Card
          title="Revenue at risk by payor"
          subtitle="Held claims, releasable claims and claims already past the filing limit."
          action={<Ref>§7.6, §13</Ref>}
        >
          <Table head={["Payor", "Held", "Releasable", "Unrecoverable"]}>
            {revenue.byPayor.map((r) => (
              <tr key={r.payorId}>
                <Td className="font-medium">{payorName(r.payorId)}</Td>
                <Td className="nums">{money(r.held)}</Td>
                <Td className="nums text-ok">{money(r.releasable)}</Td>
                <Td className="nums">
                  {r.unrecoverable > 0 ? (
                    <span className="text-risk">{money(r.unrecoverable)}</span>
                  ) : (
                    money(0)
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="All held claims"
          subtitle="Assessed as of the demo clock against each payor's filing limit."
          action={<Ref>§4.7</Ref>}
        >
          <Table head={["Claim", "Payor", "Service date", "Amount", "Deadline", "Days", "Disposition"]}>
            {claims.map((c) => (
              <tr key={c.claim.id}>
                <Td className="text-xs font-medium">{c.claim.id}</Td>
                <Td className="text-xs">{payorName(c.claim.payorId)}</Td>
                <Td className="nums text-xs">{formatDate(c.claim.serviceDate)}</Td>
                <Td className="nums text-xs">{money(c.claim.amount)}</Td>
                <Td className="nums text-xs">{formatDate(c.filingDeadline)}</Td>
                <Td className="nums text-xs">{c.daysToFilingDeadline}</Td>
                <Td>
                  <Chip
                    tone={
                      c.disposition === "FILING_LIMIT_EXPIRED"
                        ? "risk"
                        : c.disposition.startsWith("RELEASABLE")
                          ? "ok"
                          : "warn"
                    }
                  >
                    {c.disposition.replaceAll("_", " ").toLowerCase()}
                  </Chip>
                  <div className="mt-1 max-w-md text-xs text-slate-600">{c.reason}</div>
                </Td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-slate-500">Assessed {formatDate(today)}.</p>
        </Card>
      </div>
    </>
  );
}
