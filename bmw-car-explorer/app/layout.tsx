import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CompareTrayBar } from "@/components/ClientActions";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.baseUrl),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description:
    "Research, compare, and choose a BMW sold new in the US. Full specs across 15 categories, side-by-side comparison, and an explainable car finder.",
  applicationName: SITE.name,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
  },
  twitter: { card: "summary_large_image" },
};

const NAV = [
  { href: "/bmw", label: "Browse" },
  { href: "/compare", label: "Compare" },
  { href: "/finder", label: "Finder" },
  { href: "/methodology", label: "Methodology" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="mx-auto max-w-content px-4 py-3 flex items-center justify-between gap-4">
            <Link href="/" className="font-semibold text-lg">
              {SITE.name}
            </Link>
            <nav aria-label="Primary">
              <ul className="flex gap-4 text-sm">
                {NAV.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className="hover:underline">
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        <main id="main" className="flex-1 mx-auto max-w-content w-full px-4 py-6">
          {children}
        </main>

        <CompareTrayBar />

        <footer className="border-t border-black/10 dark:border-white/10 text-sm">
          <div className="mx-auto max-w-content px-4 py-6 space-y-3">
            <p className="opacity-80">{SITE.disclaimer}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 opacity-90">
              <li><Link href="/privacy" className="hover:underline">Privacy</Link></li>
              <li><Link href="/terms" className="hover:underline">Terms</Link></li>
              <li><Link href="/accessibility" className="hover:underline">Accessibility</Link></li>
              <li><Link href="/sources" className="hover:underline">Data Sources</Link></li>
              <li><Link href="/methodology" className="hover:underline">Methodology</Link></li>
            </ul>
          </div>
        </footer>
      </body>
    </html>
  );
}
