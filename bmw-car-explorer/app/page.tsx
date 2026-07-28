import Link from "next/link";
import { VehicleCard } from "@/components/VehicleCard";
import { getFamily } from "@/data/families";
import { publicCatalog } from "@/lib/catalog-view";
import { SITE } from "@/lib/site";

// SSG home page (URL design table). Hero + finder entry + featured content.
export default function HomePage() {
  const catalog = publicCatalog();
  const featured = catalog.filter((v) => [4, 8, 12].includes(v.id));

  const featuredComparisons = [
    {
      label: "X3 vs X5",
      slug: "bmw-x3-xdrive30-2026-vs-bmw-x5-xdrive40i-2026",
    },
    {
      label: "i4 vs i5",
      slug: "bmw-i4-edrive40-2026-vs-bmw-i5-edrive40-2026",
    },
    {
      label: "M340i vs M3",
      slug: "bmw-3-series-m340i-xdrive-2026-vs-bmw-m3-competition-xdrive-2026",
    },
  ];

  return (
    <div className="space-y-12">
      <section className="text-center py-10">
        <h1 className="text-4xl font-bold tracking-tight">
          Find your BMW, backed by the specs.
        </h1>
        <p className="mt-3 text-lg opacity-80 max-w-2xl mx-auto">
          {SITE.tagline}. Complete specifications across 15 categories,
          side-by-side comparison, and an explainable car finder — free, no
          account required.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Link
            href="/finder"
            className="rounded-lg bg-ink text-white px-5 py-2.5 font-medium dark:bg-white dark:text-ink"
          >
            Start the Car Finder
          </Link>
          <Link
            href="/bmw"
            className="rounded-lg border border-black/20 dark:border-white/20 px-5 py-2.5 font-medium"
          >
            Browse the lineup
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Featured comparisons</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {featuredComparisons.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/compare/${c.slug}`}
                className="block rounded-lg border border-black/10 dark:border-white/10 p-4 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="font-medium">{c.label}</span>
                <span className="block text-sm opacity-70">
                  Side-by-side specs
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Popular models</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {featured.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              familyName={getFamily(v.familySlug)?.name ?? v.familySlug}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
