import Link from "next/link";
import { notFound } from "next/navigation";
import { CASES, DOCUMENTS } from "@/data/practitioners";
import { REQUIRED_DOCUMENT_TYPES } from "@/data/reference";
import { buildCaseView, today } from "@/lib/case-view";
import { checklistDueDate, summarizePrefill, type PrefillField } from "@/domain/intake";
import { formatDate, relativeDays } from "@/domain/dates";
import { Bar, Card, Chip, Empty, PageHeader, Ref, Table, Td } from "@/components/ui";

export function generateStaticParams() {
  return CASES.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = buildCaseView(id);
  return { title: view ? `Portal — ${view.practitioner.legalFirstName} ${view.practitioner.legalLastName}` : "Portal" };
}

/**
 * The clinician-facing view.
 *
 * §14 sets the bar: under 90 minutes of total clinician time, mobile-completable,
 * zero re-entry of data already known. So this page leads with what the
 * organization already has — pre-filled from CAQH, NPPES, HRIS and prior
 * applications — and asks only for what is genuinely outstanding. It shows status
 * without making the clinician ask for it, and it never shows internal work.
 */
export default async function PortalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = buildCaseView(id);
  if (!view) notFound();

  const { practitioner: p, onboardingCase: kase } = view;
  const identifiers = view.identifiers;

  const prefilled: PrefillField[] = [
    { field: "Legal name", value: `${p.legalFirstName} ${p.legalLastName}`, source: "HRIS", requiresConfirmation: true },
    ...(identifiers.some((i) => i.kind === "NPI_TYPE_1")
      ? [
          {
            field: "NPI (Type 1)",
            value: identifiers.find((i) => i.kind === "NPI_TYPE_1")?.value ?? "",
            source: "NPPES" as const,
            requiresConfirmation: false,
          },
        ]
      : []),
    ...(identifiers.some((i) => i.kind === "CAQH")
      ? [
          {
            field: "CAQH profile",
            value: identifiers.find((i) => i.kind === "CAQH")?.value ?? "",
            source: "CAQH" as const,
            requiresConfirmation: false,
          },
        ]
      : []),
    ...identifiers
      .filter((i) => i.kind === "STATE_LICENSE")
      .map((i) => ({
        field: `${i.state} license`,
        value: `${i.value} (${i.status.toLowerCase()})`,
        source: "CAQH" as const,
        requiresConfirmation: true,
      })),
    ...identifiers
      .filter((i) => i.kind === "DEA")
      .map((i) => ({
        field: `DEA — ${i.state}`,
        value: i.value,
        source: "CAQH" as const,
        requiresConfirmation: true,
      })),
    { field: "Specialty", value: p.primarySpecialty, source: "HRIS", requiresConfirmation: true },
    { field: "Start date", value: formatDate(kase.startDate), source: "HRIS", requiresConfirmation: false },
    ...kase.workHistory.map((w) => ({
      field: `Work history — ${w.employer}`,
      value: `${formatDate(w.from)} – ${w.to ? formatDate(w.to) : "present"}`,
      source: (p.priorFileId ? "PRIOR_APPLICATION" : "CAQH") as PrefillField["source"],
      requiresConfirmation: true,
    })),
  ];

  const prefill = summarizePrefill(prefilled, prefilled.length + view.completeness.deficiencies.length);
  const myDeficiencies = view.completeness.deficiencies.filter((d) => d.owner === "CLINICIAN");
  const myTasks = view.tasks.filter(
    (t) => t.ownerRole === "CLINICIAN" && t.status !== "DONE" && t.status !== "CANCELLED",
  );
  const uploaded = DOCUMENTS.filter((d) => d.practitionerId === p.id);
  const nextMilestone = view.plan.milestones.find((m) => m.status !== "DONE");

  return (
    <>
      <PageHeader
        eyebrow="Clinician portal"
        title={`Welcome, ${p.legalFirstName}`}
        lede={`Your onboarding at ${view.facilityNames.join(" and ")} — starting ${formatDate(kase.startDate)}, ${relativeDays(today, kase.startDate)}.`}
      >
        <Link
          href={`/cases/${kase.id}`}
          className="mt-3 inline-block text-xs text-slate-500 underline-offset-2 hover:underline"
        >
          ← back to the staff view of this case
        </Link>
      </PageHeader>

      <div className="space-y-6">
        <Card title="Your progress">
          <div className="flex items-center gap-3">
            <Bar
              percent={view.completeness.percentComplete}
              tone={view.completeness.complete ? "ok" : "info"}
            />
            <span className="nums text-sm font-semibold">{view.completeness.percentComplete}%</span>
          </div>
          <p className="mt-3 text-sm text-slate-700">
            {view.completeness.complete
              ? "Your application is complete. Nothing is waiting on you — we will keep you posted as verification and enrollment progress."
              : `${myTasks.length + myDeficiencies.length} item${myTasks.length + myDeficiencies.length === 1 ? "" : "s"} still need you. Everything else is ours.`}
          </p>
          {nextMilestone && (
            // Only quote the date while it is still ahead. Telling a clinician
            // something is "needed by" a date that has already passed reads as a
            // system error, not as information.
            <p className="mt-2 text-xs text-slate-500">
              Next step in the process: {nextMilestone.label}
              {nextMilestone.requiredBy > today
                ? ` — needed by ${formatDate(nextMilestone.requiredBy)}.`
                : " — running behind the original plan; we are on it."}
            </p>
          )}
        </Card>

        <Card
          title="What we already have"
          subtitle="Pulled from CAQH ProView, NPPES, HR and your prior applications. Please confirm rather than re-type — you should never enter the same fact twice."
          action={<Ref>§4.2, §14</Ref>}
        >
          <p className="mb-3 text-sm text-slate-700">
            <strong className="nums">{prefill.coveragePercent}%</strong> of your application is
            already filled in from {prefill.sources.map((s) => s.replaceAll("_", " ").toLowerCase()).join(", ")}.
          </p>
          <Table head={["Field", "Value", "Source", "Action"]}>
            {prefill.fields.map((f, i) => (
              <tr key={i}>
                <Td className="font-medium">{f.field}</Td>
                <Td className="nums text-sm">{f.value}</Td>
                <Td className="text-xs text-slate-500">{f.source.replaceAll("_", " ").toLowerCase()}</Td>
                <Td>
                  <Chip tone={f.requiresConfirmation ? "info" : "ok"}>
                    {f.requiresConfirmation ? "confirm" : "verified"}
                  </Chip>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="What we still need from you"
          subtitle="Specific items, not a generic 'your application is incomplete'."
          action={<Ref>§4.2</Ref>}
        >
          {myDeficiencies.length === 0 && myTasks.length === 0 ? (
            <Empty>Nothing outstanding. Thank you.</Empty>
          ) : (
            <ul className="space-y-2">
              {myTasks.map((t) => (
                <li key={t.id} className="rounded-lg border border-line px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t.title}</span>
                    <Chip tone={t.due < today ? "risk" : "warn"}>
                      due {formatDate(t.due)}
                      {t.due < today ? " · overdue" : ""}
                    </Chip>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Please complete by {formatDate(checklistDueDate(t.due))} to stay ahead of the
                    schedule. {t.remindersSent > 0 && `${t.remindersSent} reminder(s) sent.`}
                  </p>
                </li>
              ))}
              {myDeficiencies.map((d, i) => (
                <li key={i} className="rounded-lg border border-line px-3 py-2 text-sm text-slate-700">
                  {d.message}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Your documents" subtitle="Versioned; nothing is ever overwritten.">
          <Table head={["Document", "Status", "Version", "Uploaded", "Expires"]}>
            {REQUIRED_DOCUMENT_TYPES.map((type) => {
              const doc = uploaded.find((d) => d.type === type);
              return (
                <tr key={type}>
                  <Td className="font-medium">{type}</Td>
                  <Td>
                    <Chip tone={doc ? "ok" : "warn"}>{doc ? "on file" : "needed"}</Chip>
                  </Td>
                  <Td className="nums text-xs">{doc ? `v${doc.version}` : "—"}</Td>
                  <Td className="nums text-xs">{doc ? formatDate(doc.uploaded) : "—"}</Td>
                  <Td className="nums text-xs">{doc?.expires ? formatDate(doc.expires) : "—"}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>

        <Card
          title="Where things stand"
          subtitle="Status visibility without having to ask anyone."
          action={<Ref>§2, §7.4</Ref>}
        >
          <Table head={["Stage", "Status"]}>
            <tr>
              <Td className="font-medium">Application</Td>
              <Td>
                <Chip tone={view.completeness.complete ? "ok" : "warn"}>
                  {view.completeness.complete ? "complete" : "awaiting items from you"}
                </Chip>
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Verification</Td>
              <Td>
                <Chip tone={view.psv.decisionReady ? "ok" : "info"}>
                  {view.psv.completenessPercent}% complete — {view.psv.missing} outstanding
                </Chip>
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Medical staff appointment</Td>
              <Td>
                <Chip tone="info">
                  {view.nextApproval
                    ? `at ${view.nextApproval.replaceAll("_", " ").toLowerCase()}`
                    : "not yet submitted"}
                </Chip>
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Insurance enrollment</Td>
              <Td>
                <Chip tone="info">
                  {view.enrollments.filter((e) => e.effectiveDate).length} of{" "}
                  {view.enrollments.length} plans effective
                </Chip>
              </Td>
            </tr>
          </Table>
          <p className="mt-3 text-xs text-slate-500">
            You have the right to review your credentialing file, to correct erroneous information,
            and to be informed of your application status on request.
          </p>
        </Card>
      </div>
    </>
  );
}
