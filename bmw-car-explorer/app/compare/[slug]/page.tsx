import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ComparisonGrid } from "@/components/ComparisonGrid";
import { getFamily } from "@/data/families";
import type { CompareOptions } from "@/domain/comparison";
import { serializePublic } from "@/domain/units";
import {
  canonicalCompareSlug,
  isCurated,
  parseCompareSlug,
} from "@/lib/compare-slug";
import type { RawSearchParams } from "@/lib/query";
import { absoluteUrl } from "@/lib/site";

// SSR + cache (URL table). Fully server-rendered so shared links work for
// crawlers and JS-disabled users (FR-311).
export const dynamic = "force-dynamic";

function title(slug: string): string {
  const vehicles = parseCompareSlug(slug);
  if (!vehicles) return "Compare BMWs";
  return vehicles
    .map((v) => `${getFamily(v.familySlug)?.name ?? ""} ${v.trimName}`.trim())
    .join(" vs ");
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const vehicles = parseCompareSlug(slug);
  if (!vehicles) return {};
  const canonical = canonicalCompareSlug(vehicles);
  return {
    title: title(slug),
    description: `Side-by-side comparison of ${title(slug)} across 15 spec categories with best-in-row highlighting.`,
    alternates: { canonical: `/compare/${canonical}` },
    // SEO-02: only curated comparisons are indexable.
    robots: isCurated(canonical)
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: { title: title(slug), url: absoluteUrl(`/compare/${canonical}`) },
  };
}

export default async function ComparePage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { slug } = await props.params;
  const sp = await props.searchParams;

  const vehicles = parseCompareSlug(slug);
  if (!vehicles) notFound();

  // SEO-01: canonicalize alphabetical order with a 301.
  const canonical = canonicalCompareSlug(vehicles);
  if (canonical !== slug) permanentRedirect(`/compare/${canonical}`);

  const publicVehicles = vehicles.map(serializePublic);

  const options: CompareOptions = {};
  if (sp["diff"] === "1") options.differencesOnly = true;
  const base = Array.isArray(sp["base"]) ? sp["base"][0] : sp["base"];
  if (base) {
    const baseId = Number.parseInt(base, 10);
    if (publicVehicles.some((v) => v.id === baseId))
      options.baselineVehicleId = baseId;
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm opacity-70">
        <Link href="/compare" className="hover:underline">Compare</Link> /{" "}
        <span aria-current="page">{title(slug)}</span>
      </nav>

      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">{title(slug)}</h1>
        <div className="flex gap-3 text-sm">
          {/* FR-309: export with attribution & generation date. */}
          <a href={`/api/compare/${canonical}`} className="underline">
            Export CSV
          </a>
        </div>
      </header>

      <ComparisonGrid
        vehicles={publicVehicles}
        options={options}
        baseHref={`/compare/${canonical}`}
      />

      <p className="text-xs opacity-60">
        Generated {new Date().toISOString().slice(0, 10)} · Data last updated
        2026-07-01 ·{" "}
        <Link href="/sources" className="underline">Sources &amp; methodology</Link>.
        BEV and ICE vehicles show “—” where a metric does not apply.
      </p>
    </div>
  );
}
