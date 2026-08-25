import { CONFIG } from "@/lib/case-view";
import { DEFAULT_MILESTONES, LOCUM_MILESTONES } from "@/domain/milestones";
import { minimumLeadDays } from "@/domain/timeline";
import { DEFAULT_RULES } from "@/domain/rules";
import { FIELD_POLICIES, ROLE_LABELS, packetSections, type Role } from "@/domain/rbac";
import { Card, Chip, PageHeader, Ref, Stat, Table, Td } from "@/components/ui";

export const metadata = { title: "Configuration" };

const PACKET_ROLES: Role[] = ["DEPARTMENT_CHAIR", "PAYOR_ENROLLMENT", "COMMITTEE", "AUDITOR"];

export default function AdminPage() {
  const startLead = minimumLeadDays("START_DATE");
  const billableLead = minimumLeadDays("FIRST_BILLABLE");
  const locumLead = minimumLeadDays("START_DATE", LOCUM_MILESTONES);

  return (
    <>
      <PageHeader
        eyebrow="System administration"
        title="Configuration"
        lede="None of this is hardcoded. Cycle lengths, the accreditor, delegation posture, scope-of-practice rules and the gating logic are tenant configuration — which is also what lets a file prove which rule set was applied to it, and when."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Minimum lead — start date"
          value={`${startLead}d`}
          hint="Critical path through the default milestone graph"
          tone="info"
        />
        <Stat
          label="Minimum lead — first billable"
          value={`${billableLead}d`}
          hint="Why a 60-day start date is flagged on day one"
          tone="warn"
        />
        <Stat label="Locum track" value={`${locumLead}d`} hint="Abbreviated graph, temporary privileges" />
        <Stat label="Configured rules" value={DEFAULT_RULES.length} hint="Editable without a deploy" />
      </div>

      <div className="mt-6 space-y-6">
        <Card title="Tenant configuration" action={<Ref>§1</Ref>}>
          <Table head={["Setting", "Value", "Why it is configuration"]}>
            <tr>
              <Td className="font-medium">Organization type</Td>
              <Td>{CONFIG.organizationType.replaceAll("_", " ").toLowerCase()}</Td>
              <Td className="text-xs text-slate-600">
                Drives which tracks apply — a telehealth-only group and an ASC do not onboard alike.
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Accreditor</Td>
              <Td>{CONFIG.accreditor.replaceAll("_", " ")}</Td>
              <Td className="text-xs text-slate-600">
                Determines the privileging and recredentialing standard set encoded in the rules.
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">CVO model</Td>
              <Td>{CONFIG.cvoModel.toLowerCase()}</Td>
              <Td className="text-xs text-slate-600">
                An outsourced CVO makes this an orchestration layer rather than an execution layer.
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Recredentialing cycle</Td>
              <Td className="nums">{CONFIG.cycles.recredentialingMonths} months</Td>
              <Td className="text-xs text-slate-600">Commonly 36; validate against payor contracts.</Td>
            </tr>
            <tr>
              <Td className="font-medium">Reappointment cycle</Td>
              <Td className="nums">{CONFIG.cycles.reappointmentMonths} months</Td>
              <Td className="text-xs text-slate-600">
                Commonly 24; some accreditors and states permit up to 36.
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">PSV validity window</Td>
              <Td className="nums">{CONFIG.cycles.psvValidityDays} days</Td>
              <Td className="text-xs text-slate-600">
                Verifications must be no older than this at the moment of the decision.
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">CAQH attestation</Td>
              <Td className="nums">{CONFIG.cycles.caqhAttestationDays} days</Td>
              <Td className="text-xs text-slate-600">Monitored with auto-reminders.</Td>
            </tr>
            <tr>
              <Td className="font-medium">Medicare revalidation</Td>
              <Td className="nums">{CONFIG.cycles.medicareRevalidationMonths} months</Td>
              <Td className="text-xs text-slate-600">Calendar-managed alongside Medicaid revalidation.</Td>
            </tr>
            <tr>
              <Td className="font-medium">Expirable lead times</Td>
              <Td className="nums">{CONFIG.expirableLeadDays.join(" / ")} days</Td>
              <Td className="text-xs text-slate-600">The renewal ladder generated per credential.</Td>
            </tr>
            <tr>
              <Td className="font-medium">Peer references</Td>
              <Td className="nums">{CONFIG.peerReferences.minimum} minimum</Td>
              <Td className="text-xs text-slate-600">
                Same specialty{CONFIG.peerReferences.sameSpecialtyRequired ? " required" : " optional"}; relatives and
                partners excluded per policy.
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Quiet hours</Td>
              <Td className="nums">
                {CONFIG.quietHours.start}–{CONFIG.quietHours.end}
              </Td>
              <Td className="text-xs text-slate-600">Respected by SMS and push nudges.</Td>
            </tr>
          </Table>
        </Card>

        <Card
          title="APP supervision caps and scope of practice"
          subtitle="Per state and APP type. The cap is enforced at assignment time, not discovered at audit."
          action={<Ref>§9</Ref>}
        >
          <p className="mb-3 text-sm text-slate-700">
            Supervision caps:{" "}
            {Object.entries(CONFIG.appSupervisionCaps)
              .map(([state, cap]) => `${state} ${cap}`)
              .join(" · ")}
          </p>
          <Table head={["State", "Type", "Authority", "Agreement", "Schedules", "Transition hours"]}>
            {CONFIG.scopeOfPractice.map((r, i) => (
              <tr key={i}>
                <Td className="font-medium">{r.state}</Td>
                <Td>{r.appType}</Td>
                <Td>
                  <Chip tone={r.authority === "FULL" ? "ok" : r.authority === "REDUCED" ? "warn" : "risk"}>
                    {r.authority.toLowerCase()}
                  </Chip>
                </Td>
                <Td className="text-xs">{r.agreementRequired ? "required" : "not required"}</Td>
                <Td className="nums text-xs">{r.controlledSubstanceSchedules.join(", ")}</Td>
                <Td className="nums text-xs">{r.transitionHours ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="Gating rules"
          subtitle="Declarative conditions over a fact bag. Admins edit these; nothing here requires a code change."
          action={<Ref>§10</Ref>}
        >
          {DEFAULT_RULES.map((rule) => (
            <div key={rule.id} className="mb-4 rounded-lg border border-line p-3 last:mb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={rule.severity === "BLOCKING" ? "risk" : "warn"}>
                  {rule.severity.toLowerCase()}
                </Chip>
                <span className="text-sm font-medium">{rule.name}</span>
                <span className="text-xs text-slate-500">gates {rule.gates.toLowerCase()}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{rule.description}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
                {rule.all.map((c, i) => (
                  <li key={i}>
                    <span className="nums text-slate-400">{c.fact}</span> {c.operator.replaceAll("_", " ").toLowerCase()}
                    {c.value !== undefined ? ` ${String(c.value)}` : ""} — {c.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>

        <Card
          title="Milestone graph"
          subtitle="Durations and dependency edges are planning configuration. The payor track and the privileging track run in parallel off a shared verification layer, and they end at different gates."
          action={<Ref>§4</Ref>}
        >
          <Table head={["Milestone", "Track", "Duration", "Depends on", "Gate", "Waiting on"]}>
            {DEFAULT_MILESTONES.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium">{m.label}</Td>
                <Td className="text-xs uppercase text-slate-500">{m.track.toLowerCase()}</Td>
                <Td className="nums text-xs">{m.durationDays}d</Td>
                <Td className="text-xs text-slate-600">{m.dependsOn.join(", ") || "—"}</Td>
                <Td className="text-xs">{m.gate ? m.gate.replaceAll("_", " ").toLowerCase() : "inherited"}</Td>
                <Td className="text-xs text-slate-600">{m.waitingOn.replaceAll("_", " ").toLowerCase()}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="Field-level access control"
          subtitle="Screen-level RBAC is not enough: the same case screen is used by a recruiter, a credentialing specialist and an auditor, and they may not see the same fields on it."
          action={<Ref>§2, §14</Ref>}
        >
          <Table head={["Field", "Sensitivity", "Read", "Write", "Audited on read"]}>
            {FIELD_POLICIES.map((p) => (
              <tr key={p.field}>
                <Td className="nums text-xs font-medium">{p.field}</Td>
                <Td>
                  <Chip tone={p.sensitivity === "RESTRICTED" ? "risk" : "warn"}>
                    {p.sensitivity.toLowerCase()}
                  </Chip>
                </Td>
                <Td className="text-xs text-slate-600">{p.read.join(", ").toLowerCase()}</Td>
                <Td className="text-xs text-slate-600">{p.write.join(", ").toLowerCase()}</Td>
                <Td className="text-xs">{p.auditOnRead ? "yes" : "no"}</Td>
              </tr>
            ))}
          </Table>

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Committee packet redaction by role
          </h3>
          <Table head={["Section", ...PACKET_ROLES.map((r) => ROLE_LABELS[r])]}>
            {packetSections("COMMITTEE").map((section, i) => (
              <tr key={section.section}>
                <Td className="font-medium">{section.section}</Td>
                {PACKET_ROLES.map((role) => {
                  const included = packetSections(role)[i]?.included ?? false;
                  return (
                    <Td key={role}>
                      <Chip tone={included ? "ok" : "muted"}>{included ? "included" : "redacted"}</Chip>
                    </Td>
                  );
                })}
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
