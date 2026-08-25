/**
 * Shared presentation primitives.
 *
 * Server components with no client JS — every page in this application is a
 * read of computed state, so nothing here needs to be interactive, and the
 * portal stays fast on a phone (§14 usability).
 */

import Link from "next/link";
import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "risk" | "info" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-emerald-50 text-ok border-emerald-200",
  warn: "bg-amber-50 text-warn border-amber-200",
  risk: "bg-rose-50 text-risk border-rose-200",
  info: "bg-sky-50 text-info border-sky-200",
  muted: "bg-slate-100 text-slate-600 border-slate-200",
};

export function Chip({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  id,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="rounded-xl border border-line bg-white shadow-sm">
      {title && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 max-w-3xl text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  const accent: Record<Tone, string> = {
    ok: "text-ok",
    warn: "text-warn",
    risk: "text-risk",
    info: "text-info",
    muted: "text-ink",
  };
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`nums mt-1 text-2xl font-semibold ${accent[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Table({
  head,
  children,
}: {
  head: readonly (string | ReactNode)[];
  children: ReactNode;
}) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={`px-3 py-2 align-top ${className}`} colSpan={colSpan}>
      {children}
    </td>
  );
}

export function Bar({ percent, tone = "info" }: { percent: number; tone?: Tone }) {
  const fill: Record<Tone, string> = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    risk: "bg-rose-500",
    info: "bg-sky-500",
    muted: "bg-slate-400",
  };
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      role="img"
      aria-label={`${clamped} percent`}
    >
      <div className={`h-full rounded-full ${fill[tone]}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {eyebrow && (
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{eyebrow}</div>
      )}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {lede && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{lede}</p>}
      {children}
    </header>
  );
}

export function CaseLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Link href={`/cases/${id}`} className="font-medium text-info underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

/** Requirement provenance. Every screen states which section it implements. */
export function Ref({ children }: { children: ReactNode }) {
  return <span className="text-xs font-normal text-slate-400">{children}</span>;
}

export function riskTone(level: "GREEN" | "AMBER" | "RED"): Tone {
  return level === "RED" ? "risk" : level === "AMBER" ? "warn" : "ok";
}

export function money(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
