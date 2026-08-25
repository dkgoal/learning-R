import {
  allRequiredEnrollments,
  enrollmentTracker,
  portfolioBenchmarks,
  today,
} from "@/lib/case-view";
import {
  generateRosterFile,
  labelProgram,
  medicareFormsFor,
  medicareRetroactiveEffective,
  reconcileRoster,
  type RosterRow,
} from "@/domain/payors";
import { PAYORS, PAYOR_CONTRACTS, PAYOR_PRODUCTS, ORGANIZATIONS } from "@/data/reference";
import { formatDate } from "@/domain/dates";
import { Card, CaseLink, Chip, Empty, PageHeader, Ref, Stat, Table, Td } from "@/components/ui";

export const metadata = { title: "Payor enrollment" };

/**
 * Demonstration roster for the one delegated agreement. Row 2 carries a
 * deliberately malformed NPI so the validation gate is visible: a roster with
 * issues is not submittable, because a rejected file costs a whole monthly cycle.
 */
const ROSTER_ROWS: RosterRow[] = [
  { action: "ADD", practitionerId: "prac-osei", lastName: "Osei", firstName: "Amara", npi: "1730984412", tin: "471234567", locationId: "loc-cardio", productId: "prod-healthnet-mcal", effectiveDate: "2026-09-01", specialty: "Cardiovascular Disease", practitionerType: "MD" },
  { action: "ADD", practitionerId: "prac-chandran", lastName: "Chandran", firstName: "Ravi", npi: "199223411", tin: "471234567", locationId: "loc-valley", productId: "prod-healthnet-mcal", effectiveDate: "2026-12-01", specialty: "Hospital Medicine", practitionerType: "MD" },
  { action: "TERM", practitionerId: "prac-legacy-1", lastName: "Nguyen", firstName: "Bao", npi: "1445566778", tin: "471234567", locationId: "loc-valley", productId: "prod-healthnet-mcal", effectiveDate: "2026-08-31", specialty: "Family Medicine", practitionerType: "MD" },
  { action: "CHANGE", practitionerId: "prac-marchetti", lastName: "Marchetti", firstName: "Elena", npi: "1558842203", tin: "471234567", locationId: "loc-valley", productId: "prod-healthnet-mcal", effectiveDate: "2026-09-01", specialty: "Hospital Medicine", practitionerType: "DO" },
];

const ROSTER_RETURN = [
  { npi: "1730984412", productId: "prod-healthnet-mcal", accepted: true, effectiveDate: "2026-09-01" },
  { npi: "1445566778", productId: "prod-healthnet-mcal", accepted: false, rejectionReason: "Provider not found in the payor's active roster" },
  // Marchetti's change row is simply absent from the acknowledgment — the silent
  // failure mode that roster reconciliation exists to catch.
  { npi: "1667723310", productId: "prod-healthnet-mcal", accepted: true, effectiveDate: "2026-09-01" },
];

export default function PayorsPage() {
  const tracker = enrollmentTracker();
  const benchmarks = portfolioBenchmarks();
  const derived = allRequiredEnrollments();
  const roster = generateRosterFile("pay-healthnet", "2026-09-01", ROSTER_ROWS);
  const reconciliation = reconcileRoster(roster, ROSTER_RETURN);

  const blockedCount = derived.reduce(
    (n, d) => n + d.required.filter((r) => r.blockers.length > 0).length,
    0,
  );
  const pending = tracker.filter((t) => t.enrollment.submitted && !t.enrollment.effectiveDate);
  const overdue = pending.filter(
    (t) => t.typicalTurnaround !== null && (t.daysPending ?? 0) > t.typicalTurnaround,
  );

  return (
    <>
      <PageHeader
        eyebrow="Managed care"
        title="Payor enrollment"
        lede="Contracting asks whether the group is in-network under this payor. Credentialing asks whether this clinician is loaded under that contract. A clinician joining an existing contracted group needs only the second; a new TIN needs both, and the timeline roughly doubles."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Enrollments tracked" value={tracker.length} />
        <Stat label="Pending" value={pending.length} hint={`${overdue.length} past the payor's stated turnaround`} tone={overdue.length ? "warn" : "muted"} />
        <Stat label="Requirements blocked" value={blockedCount} hint="Contract, parent program, licensure or APP-type" tone={blockedCount ? "risk" : "ok"} />
        <Stat label="Delegated agreements" value={PAYOR_CONTRACTS.filter((c) => c.delegated).length} hint="Roster generation rather than per-clinician submission" tone="info" />
      </div>

      <div className="mt-6 space-y-6">
        <Card
          title="Enrollment tracker"
          subtitle="Each payor enrollment is an independent sub-case with its own status, submission date, follow-up log and effective date."
          action={<Ref>§7.1</Ref>}
        >
          <Table head={["Clinician", "Payor / product", "TIN / location", "Status", "Submitted", "Days", "Effective"]}>
            {tracker.map((t) => (
              <tr key={t.enrollment.id}>
                <Td>
                  <CaseLink id={t.caseId}>{t.clinician}</CaseLink>
                </Td>
                <Td>
                  <span className="font-medium">{t.payorName}</span>
                  <div className="text-xs text-slate-500">{t.productName}</div>
                  {t.delegated && <Chip tone="info">delegated roster</Chip>}
                </Td>
                <Td className="text-xs text-slate-600">
                  {t.organizationName}
                  <div>{t.locationName}</div>
                </Td>
                <Td>
                  <Chip
                    tone={
                      t.enrollment.status === "APPROVED"
                        ? "ok"
                        : t.enrollment.status === "ADDITIONAL_INFO_REQUESTED"
                          ? "warn"
                          : t.enrollment.status === "DENIED"
                            ? "risk"
                            : "muted"
                    }
                  >
                    {t.enrollment.status.replaceAll("_", " ").toLowerCase()}
                  </Chip>
                  {t.enrollment.resubmittedFrom && (
                    <div className="mt-1 text-xs text-slate-500">
                      resubmitted; original history retained
                    </div>
                  )}
                </Td>
                <Td className="nums whitespace-nowrap text-xs">{formatDate(t.enrollment.submitted)}</Td>
                <Td className="nums text-xs">
                  {t.daysPending ?? "—"}
                  {t.typicalTurnaround !== null && (
                    <div
                      className={
                        (t.daysPending ?? 0) > t.typicalTurnaround ? "text-risk" : "text-slate-500"
                      }
                    >
                      typ. {t.typicalTurnaround}
                    </div>
                  )}
                </Td>
                <Td className="nums whitespace-nowrap text-xs">
                  {formatDate(t.enrollment.effectiveDate)}
                  {t.enrollment.retroactiveTo && (
                    <div className="text-ok">retro {formatDate(t.enrollment.retroactiveTo)}</div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="Derived requirements and blockers"
          subtitle="Auto-determined from each clinician's locations, TINs and specialty against active contracts. Blockers name the remedy, not just the problem."
          action={<Ref>§7.1, §7.5</Ref>}
        >
          {derived.map((d) => {
            const blocked = d.required.filter((r) => r.blockers.length > 0);
            return (
              <div key={d.caseId} className="mb-4 last:mb-0">
                <h3 className="text-sm font-medium">
                  <CaseLink id={d.caseId}>{d.name}</CaseLink>{" "}
                  <span className="text-xs font-normal text-slate-500">
                    — {d.required.length} required enrollments, {blocked.length} blocked
                  </span>
                </h3>
                {blocked.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {blocked.map((r) =>
                      r.blockers.map((b, i) => (
                        <li key={`${r.key}-${i}`} className="rounded border border-line px-2 py-1">
                          <Chip tone="risk">{b.kind.replaceAll("_", " ").toLowerCase()}</Chip>{" "}
                          <span className="text-slate-700">{b.detail}</span>{" "}
                          <span className="text-slate-500">{b.remedy}</span>
                        </li>
                      )),
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </Card>

        <Card
          title="Delegated roster — generation and reconciliation"
          subtitle="Validation runs before submission, and the payor's acknowledgment is reconciled back. A row we sent that never appears in the return is the silent failure this catches."
          action={<Ref>§7.4</Ref>}
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Chip tone={roster.submittable ? "ok" : "risk"}>
              {roster.submittable ? "submittable" : `${roster.issues.length} validation issue(s)`}
            </Chip>
            <span className="text-xs text-slate-600">
              Health Net Medi-Cal · monthly cadence · effective {formatDate(roster.generatedFor)}
            </span>
          </div>

          <Table head={["Action", "Clinician", "NPI", "TIN", "Effective", "Validation"]}>
            {roster.rows.map((r, i) => {
              const issues = roster.issues.filter((x) => x.rowIndex === i);
              return (
                <tr key={i}>
                  <Td>
                    <Chip tone={r.action === "TERM" ? "warn" : "muted"}>{r.action.toLowerCase()}</Chip>
                  </Td>
                  <Td className="text-xs">
                    {r.lastName}, {r.firstName}
                    <div className="text-slate-500">{r.specialty}</div>
                  </Td>
                  <Td className="nums text-xs">{r.npi}</Td>
                  <Td className="nums text-xs">{r.tin}</Td>
                  <Td className="nums text-xs">{formatDate(r.effectiveDate)}</Td>
                  <Td className="text-xs">
                    {issues.length === 0 ? (
                      <span className="text-ok">ok</span>
                    ) : (
                      issues.map((x, j) => (
                        <div key={j} className="text-risk">
                          {x.field}: {x.message}
                        </div>
                      ))
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reconciliation exceptions
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Accepted" value={reconciliation.matched.length} tone="ok" />
            <Stat label="Rejected" value={reconciliation.rejected.length} tone={reconciliation.rejected.length ? "warn" : "ok"} />
            <Stat
              label="Missing from return"
              value={reconciliation.missingFromReturn.length}
              tone={reconciliation.missingFromReturn.length ? "risk" : "ok"}
            />
          </div>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {reconciliation.rejected.map((r, i) => (
              <li key={`rej-${i}`}>
                <Chip tone="warn">rejected</Chip> {r.row.lastName}, {r.row.firstName} — {r.reason}
              </li>
            ))}
            {reconciliation.missingFromReturn.map((r, i) => (
              <li key={`miss-${i}`}>
                <Chip tone="risk">no acknowledgment</Chip> {r.lastName}, {r.firstName} — sent on the
                roster but absent from the payor&apos;s return file.
              </li>
            ))}
            {reconciliation.unexpectedInReturn.map((r, i) => (
              <li key={`unexp-${i}`}>
                <Chip tone="warn">roster drift</Chip> NPI {r.npi} appears in the payor&apos;s return but was
                never sent by us.
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Payor turnaround benchmarking"
          subtitle="Days from submission to effective date, by payor — to hold payors accountable and to plan start dates on evidence rather than on hope."
          action={<Ref>§7.6, §13</Ref>}
        >
          {benchmarks.length === 0 ? (
            <Empty>No completed enrollments yet.</Empty>
          ) : (
            <Table head={["Payor", "Completed", "Median days", "Worst", "Pending", "Overdue"]}>
              {benchmarks.map((b) => (
                <tr key={b.payorId}>
                  <Td className="font-medium">{b.payorName}</Td>
                  <Td className="nums">{b.completed}</Td>
                  <Td className="nums">{b.medianDaysToEffective ?? "—"}</Td>
                  <Td className="nums">{b.worstDaysToEffective ?? "—"}</Td>
                  <Td className="nums">{b.pending}</Td>
                  <Td className="nums">
                    {b.overdueCount > 0 ? <span className="text-risk">{b.overdueCount}</span> : 0}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card
          title="Payor matrix"
          subtitle="Payor → product → contract → submission channel. Medicare Advantage and Medicaid MCO are modeled separately from the parent programs they depend on."
          action={<Ref>§7.1, §7.2</Ref>}
        >
          <Table head={["Payor", "Program", "Products", "Channel", "Typical turnaround", "Credentials APPs", "Contracts"]}>
            {PAYORS.map((p) => {
              const products = PAYOR_PRODUCTS.filter((x) => x.payorId === p.id);
              const contracts = PAYOR_CONTRACTS.filter((c) => c.payorId === p.id);
              return (
                <tr key={p.id}>
                  <Td className="font-medium">{p.name}</Td>
                  <Td>
                    <Chip tone={p.parentProgram ? "warn" : "muted"}>{labelProgram(p.program)}</Chip>
                    {p.parentProgram && (
                      <div className="text-xs text-slate-500">
                        requires {labelProgram(p.parentProgram)} first
                      </div>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-600">{products.map((x) => x.name).join(", ")}</Td>
                  <Td className="text-xs">{p.submissionChannel.toLowerCase()}</Td>
                  <Td className="nums text-xs">{p.typicalTurnaroundDays}d</Td>
                  <Td className="text-xs text-slate-600">
                    {["NP", "PA", "CRNA", "CNM"].filter((t) => p.credentialsAppTypes.includes(t as never)).join(", ") || (
                      <span className="text-risk">none — bill under the supervising physician</span>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {contracts.length === 0
                      ? "—"
                      : contracts.map((c) => (
                          <div key={c.id}>
                            {ORGANIZATIONS.find((o) => o.id === c.organizationId)?.name}
                            {c.delegated && " (delegated)"}
                          </div>
                        ))}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>

        <Card
          title="Medicare form set"
          subtitle="Derived from the employment and TIN relationship rather than remembered. Getting the set wrong costs a full submission cycle."
          action={<Ref>§7.2</Ref>}
        >
          <Table head={["Scenario", "Forms", "Notes"]}>
            <tr>
              <Td>Employed physician reassigning benefits to an existing TIN</Td>
              <Td className="nums text-xs">
                {medicareFormsFor({ reassignsBenefits: true, newTin: false, wantsEft: true }).join(", ")}
              </Td>
              <Td className="text-xs text-slate-600">
                PECOS submission; capture the PTAN and set the 5-year revalidation date on approval.
              </Td>
            </tr>
            <tr>
              <Td>New legal entity enrolling for the first time</Td>
              <Td className="nums text-xs">
                {medicareFormsFor({ reassignsBenefits: true, newTin: true, wantsEft: true }).join(", ")}
              </Td>
              <Td className="text-xs text-slate-600">
                Group enrollment precedes the individual reassignment; expect the longer path.
              </Td>
            </tr>
            <tr>
              <Td>Locum billing under a reciprocal arrangement</Td>
              <Td className="nums text-xs">
                {medicareFormsFor({ reassignsBenefits: false, newTin: false, wantsEft: false }).join(", ")}
              </Td>
              <Td className="text-xs text-slate-600">
                Interim bridge only; modifier and continuous-period limits apply (see Billing).
              </Td>
            </tr>
          </Table>
          <p className="mt-3 text-xs text-slate-500">
            Effective dates may generally be set up to 30 days prior to the filing date — as of{" "}
            {formatDate(today)}, a submission filed today could reach back to{" "}
            {formatDate(medicareRetroactiveEffective(today))}.
          </p>
        </Card>
      </div>
    </>
  );
}
