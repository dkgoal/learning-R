import { AUDIT_LOG } from "@/data/audit-log";
import { reconstructFile, sensitiveReads, verifyIntegrity } from "@/domain/audit";
import { formatDate } from "@/domain/dates";
import { Card, Chip, Empty, PageHeader, Ref, Stat, Table, Td } from "@/components/ui";

export const metadata = { title: "Audit" };

/**
 * Point-in-time reconstruction is demonstrated against a real decision date: the
 * department chair's deferral on Osei's privilege request. The question a survey
 * or a plaintiff asks is not "what does the file say now" but "what did it say on
 * the day you decided" — which only an append-only log can answer.
 */
const DECISION_DATE = "2026-08-22";

export default function AuditPage() {
  const integrity = verifyIntegrity(AUDIT_LOG);
  const reads = sensitiveReads(AUDIT_LOG);
  const snapshot = reconstructFile(AUDIT_LOG, "prac-osei", DECISION_DATE);
  const today = reconstructFile(AUDIT_LOG, "prac-osei", "2026-12-31");

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Audit trail"
        lede="Append-only, hash-chained, and able to reconstruct the complete file as it existed on the date of any credentialing decision. Retrofitting point-in-time reconstruction later is expensive, so it is the storage model rather than a report."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Chain integrity"
          value={integrity.intact ? "intact" : `broken at ${integrity.brokenAt}`}
          hint={`${integrity.entriesChecked} entries verified`}
          tone={integrity.intact ? "ok" : "risk"}
        />
        <Stat label="Entries" value={AUDIT_LOG.length} />
        <Stat label="Sensitive reads" value={reads.length} hint="Logged individually, not as record views" tone="info" />
        <Stat
          label="Entities in the 2026-08-22 snapshot"
          value={snapshot.entities.length}
          hint={`${snapshot.entryCount} entries on or before that date`}
        />
      </div>

      <div className="mt-6 space-y-6">
        <Card
          title={`Point-in-time reconstruction — Amara Osei as of ${formatDate(DECISION_DATE)}`}
          subtitle="The state the file was in when the department chair deferred the privilege request, folded from the log rather than read from a current-state table."
          action={<Ref>§14</Ref>}
        >
          <Table head={["Entity", "Id", "State on the decision date"]}>
            {snapshot.entities.map((e) => (
              <tr key={`${e.entity}-${e.entityId}`}>
                <Td className="font-medium">{e.entity}</Td>
                <Td className="nums text-xs">{e.entityId}</Td>
                <Td className="text-xs text-slate-700">
                  {Object.keys(e.state).length === 0 ? (
                    <span className="text-slate-400">no recorded state as of this date</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {Object.entries(e.state).map(([k, v]) => (
                        <li key={k}>
                          <span className="text-slate-500">{k}:</span> {JSON.stringify(v)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-slate-500">
            The same fold run to 2026-12-31 returns {today.entities.length} entities and{" "}
            {today.entryCount} entries — the difference between the two is exactly what changed after
            the decision.
          </p>
        </Card>

        <Card
          title="Sensitive field reads"
          subtitle="Who looked at restricted data, and why. Reads are audited separately from writes because a file can be misused without ever being changed."
          action={<Ref>§2, §14</Ref>}
        >
          {reads.length === 0 ? (
            <Empty>No sensitive reads recorded.</Empty>
          ) : (
            <Table head={["When", "Actor", "Role", "Field", "Entity", "Reason"]}>
              {reads.map((r) => (
                <tr key={r.id}>
                  <Td className="nums text-xs">{r.at.replace("T", " ").replace("Z", "")}</Td>
                  <Td className="text-xs">{r.actorId}</Td>
                  <Td className="text-xs">{r.actorRole.replaceAll("_", " ").toLowerCase()}</Td>
                  <Td className="nums text-xs font-medium">{r.field}</Td>
                  <Td className="text-xs text-slate-600">
                    {r.entity}/{r.entityId}
                  </Td>
                  <Td className="text-xs text-slate-600">{r.reason ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card
          title="Full log"
          subtitle="Every create, read, update and delete, with the chain hash committing each entry to its predecessor. A production deployment signs entries and writes to WORM storage; the chain shape is the same."
          action={<Ref>§14</Ref>}
        >
          <Table head={["When", "Actor", "Action", "Entity", "Field", "Value", "Hash"]}>
            {[...AUDIT_LOG].reverse().map((e) => (
              <tr key={e.id}>
                <Td className="nums whitespace-nowrap text-xs">{e.at.slice(0, 16).replace("T", " ")}</Td>
                <Td className="text-xs">
                  {e.actorId}
                  <div className="text-slate-500">{e.actorRole.replaceAll("_", " ").toLowerCase()}</div>
                </Td>
                <Td>
                  <Chip
                    tone={
                      e.action === "DELETE"
                        ? "risk"
                        : e.action === "READ"
                          ? e.sensitive
                            ? "warn"
                            : "muted"
                          : "info"
                    }
                  >
                    {e.action.toLowerCase()}
                  </Chip>
                </Td>
                <Td className="text-xs">
                  {e.entity}
                  <div className="nums text-slate-500">{e.entityId}</div>
                </Td>
                <Td className="nums text-xs">{e.field ?? "—"}</Td>
                <Td className="max-w-sm text-xs text-slate-600">
                  {e.after !== undefined ? JSON.stringify(e.after) : "—"}
                  {e.reason && <div className="text-slate-500">{e.reason}</div>}
                </Td>
                <Td className="nums text-xs text-slate-400">{e.hash.slice(0, 8)}…</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
