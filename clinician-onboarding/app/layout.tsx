import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Clinician Onboarding Platform",
    template: "%s · Clinician Onboarding",
  },
  description:
    "Unified clinician onboarding: one intake, one verification set, reused across HR, payor enrollment, and medical staff privileging.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/verifications", label: "Verification" },
  { href: "/payors", label: "Payor enrollment" },
  { href: "/privileges", label: "Privileging" },
  { href: "/billing", label: "Billing release" },
  { href: "/expirables", label: "Expirables" },
  { href: "/reports", label: "Reports" },
  { href: "/admin", label: "Configuration" },
  { href: "/audit", label: "Audit" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>
        <div className="border-b border-line bg-white">
          <div className="mx-auto max-w-content px-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <Link href="/" className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-sm font-bold text-white"
                >
                  NS
                </span>
                <span className="text-sm font-semibold tracking-tight">
                  Northstar Health · Clinician Onboarding
                </span>
              </Link>
              <span className="text-xs text-slate-500">
                Joint Commission · hybrid CVO · demo clock 2026-08-25
              </span>
            </div>
            <nav aria-label="Primary" className="-mb-px flex gap-1 overflow-x-auto">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-t-lg border-b-2 border-transparent px-3 py-2 text-sm text-slate-600 hover:border-slate-300 hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
        <main id="main" className="mx-auto max-w-content px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="mx-auto max-w-content px-4 pb-12 text-xs leading-relaxed text-slate-500 sm:px-6">
          Demonstration build with synthetic data. Cycle lengths, verification
          windows and scope-of-practice rules are configuration, not constants —
          validate them against current accreditor manuals, state law and payor
          contracts before encoding them as system rules.
        </footer>
      </body>
    </html>
  );
}
