import { CONFIG, portfolioExpirables, today } from "@/lib/case-view";
import { CASES, EXPIRABLES, PRACTITIONERS } from "@/data/practitioners";
import { caqhAttestationDue, reappointmentInitiationDate, reconcileCycles, renewalTasks } from "@/domain/expirables";
import { formatDate } from "@/domain/dates";
import { Card, CaseLink, Chip, Empty, PageHeader, Ref, Stat, Table, Td, type Tone } from "@/components/ui";

export const metadata = { title: "Expirables" };

const STATUS_TONE: Record<string, Tone> = {
  LAPSED: "risk",
  DUE_TODAY: "risk",
  URGENT: "warn",
  UPCOMING: "info",
  CURRENT: "ok",
};

export default function ExpirablesPage() {
  const dash = portfolioExpirables();
  const caseFor = (practitionerId: string) =>
    CASES.find((c) => c.practitionerId === practitionerId)?.id ?? null;
  const nameFor = (practitionerId: string) => {
    const p = PRACTITIONERS.find((x) => x.id === practitionerId);
    return p ? `${p.legalFirstName} ${p.legalLastName}` : practitionerId;
  };

  const all = [
    ...dash.lapsed,
    ...dash.within30,
    ...dash.within60,
    ...dash.within90,
    ...dash.beyond90,
  ];

  // The renewal ladder for the nearest expirable, shown so the schedule is
  // inspectable before it fires rather than only in hindsight.
  const sample = all[0];
  const ladder = sample
    ? renewalTasks(CONFIG, sample.expirable, caseFor(sample.expirable.practitionerId) ?? "—")
    : [];

  const reconciliation = reconcileCycles(CONFIG, "prac-marchetti", "2026-05-14", "2026-05-14");

  return (
    <>
      <PageHeader
        eyebrow="Ongoing maintenance"
        title="Expirables"
        lede={`Every dated credential generates renewal tasks at ${CONFIG.expirableLeadDays.join("/")} days, with the suspension action defined at expiration. Lapses are the failure mode that turns a compliant file into a survey finding overnight.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Lapsed" value={dash.lapsed.length} tone={dash.lapsed.length ? "risk" : "ok"} />
        <Stat label="≤30 days" value={dash.within30.length} tone={dash.within30.length ? "warn" : "ok"} />
        <Stat label="31–60 days" value={dash.within60.length} />
        <Stat label="61–90 days" value={dash.within90.length} />
        <Stat
          label="Suspensions fired"
          value={dash.activeSuspensions.length}
          tone={dash.activeSuspensions.length ? "risk" : "ok"}
        />
      </div>

      <div className="mt-6 space-y-6">
        {dash.activeSuspensions.length > 0 && (
          <Card
            title="Automatic suspensions in effect"
            subtitle="These actions have already fired. Privileges, prescribing or billing are suspended until the credential is renewed."
            action={<Ref>§10, §11</Ref>}
          >
            <ul className="space-y-2 text-sm">
              {dash.activeSuspensions.map((e) => (
                <li key={e.expirable.id} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <Chip tone="risk">{e.action.replaceAll("_", " ").toLowerCase()}</Chip>{" "}
                  <strong>{nameFor(e.expirable.practitionerId)}</strong> — {e.expirable.label} expired{" "}
                  {formatDate(e.expirable.expires)} ({-e.daysRemaining} days ago).
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card
          title="All tracked expirables"
          subtitle="Sorted by urgency across the whole portfolio."
          action={<Ref>§11</Ref>}
        >
          {all.length === 0 ? (
            <Empty>Nothing tracked.</Empty>
          ) : (
            <Table head={["Clinician", "Credential", "Kind", "Expires", "Days", "Notice", "At expiration", "Status"]}>
              {all.map((e) => {
                const caseId = caseFor(e.expirable.practitionerId);
                return (
                  <tr key={e.expirable.id}>
                    <Td>
                      {caseId ? (
                        <CaseLink id={caseId}>{nameFor(e.expirable.practitionerId)}</CaseLink>
                      ) : (
                        nameFor(e.expirable.practitionerId)
                      )}
                    </Td>
                    <Td className="font-medium">{e.expirable.label}</Td>
                    <Td className="text-xs text-slate-600">
                      {e.expirable.kind.replaceAll("_", " ").toLowerCase()}
                    </Td>
                    <Td className="nums text-xs">{formatDate(e.expirable.expires)}</Td>
                    <Td className="nums text-xs">{e.daysRemaining}</Td>
                    <Td className="nums text-xs">
                      {e.leadThreshold === null ? "—" : `${e.leadThreshold}d`}
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {e.action.replaceAll("_", " ").toLowerCase()}
                    </Td>
                    <Td>
                      <Chip tone={STATUS_TONE[e.status] ?? "muted"}>
                        {e.status.replaceAll("_", " ").toLowerCase()}
                      </Chip>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        {sample && (
          <Card
            title={`Renewal ladder — ${sample.expirable.label}`}
            subtitle="Generated up front rather than one reminder at a time, so a specialist can see the whole schedule before any of it fires."
            action={<Ref>§10</Ref>}
          >
            <Table head={["Notice", "Fires on", "Task", "SLA"]}>
              {ladder.map((t) => (
                <tr key={t.id}>
                  <Td className="nums text-xs">{t.id.split("-").pop()}d</Td>
                  <Td className="nums text-xs">{formatDate(t.due)}</Td>
                  <Td className="text-sm">{t.title}</Td>
                  <Td className="nums text-xs">{t.slaDays}d</Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}

        <Card
          title="Cycle reconciliation"
          subtitle="Recredentialing and reappointment are separate cycles for the same person. When they land close together, one verification pass serves both — sharing the effort rather than duplicating it."
          action={<Ref>§11</Ref>}
        >
          <Table head={["Cycle", "Due", "Detail"]}>
            <tr>
              <Td className="font-medium">Recredentialing</Td>
              <Td className="nums text-xs">{formatDate(reconciliation.recredentialingDue)}</Td>
              <Td className="text-xs text-slate-600">
                {CONFIG.cycles.recredentialingMonths}-month cycle from the last credentialing decision.
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Reappointment</Td>
              <Td className="nums text-xs">{formatDate(reconciliation.reappointmentDue)}</Td>
              <Td className="text-xs text-slate-600">
                {CONFIG.cycles.reappointmentMonths}-month term; the cycle opens{" "}
                {formatDate(reappointmentInitiationDate(reconciliation.reappointmentDue))} with a
                pre-populated application and OPPE/FPPE data attached.
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Shared verification</Td>
              <Td className="nums text-xs">{formatDate(reconciliation.sharedVerificationBy)}</Td>
              <Td className="text-xs text-slate-600">
                {reconciliation.canShareVerification
                  ? `The two cycles are ${reconciliation.gapDays} days apart — inside the reconciliation window, so one verification pass covers both.`
                  : `The two cycles are ${reconciliation.gapDays} days apart — too far to share a single verification pass.`}
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">CAQH attestation</Td>
              <Td className="nums text-xs">{formatDate(caqhAttestationDue(CONFIG, "2026-05-11"))}</Td>
              <Td className="text-xs text-slate-600">
                {CONFIG.cycles.caqhAttestationDays}-day cycle, monitored with auto-reminders and a
                watch on CAQH-flagged expired documents.
              </Td>
            </tr>
          </Table>
        </Card>

        <p className="text-xs text-slate-500">
          {EXPIRABLES.length} expirables tracked, evaluated as of {formatDate(today)}.
        </p>
      </div>
    </>
  );
}
