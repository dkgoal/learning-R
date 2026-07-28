import type { Metadata } from "next";
import Link from "next/link";
import { CompareBuilder, type CompareOption } from "@/components/CompareBuilder";
import { vehicleSlugToken } from "@/domain/comparison";
import { getFamily } from "@/data/families";
import { publicCatalog } from "@/lib/catalog-view";
import { CURATED_COMPARISONS } from "@/lib/compare-slug";
import { totalPrice, usd } from "@/lib/format";

export const metadata: Metadata = {
  title: "Compare BMWs side by side",
  description:
    "Build a 2–4 way BMW comparison across 15 spec categories with best-in-row highlighting and a shareable link.",
  alternates: { canonical: "/compare" },
};

function labelForSlug(slug: string): string {
  return slug
    .split("-vs-")
    .map((t) => t.replace(/^bmw-/, "").replace(/-\d{4}$/, "").replace(/-/g, " "))
    .join(" vs ");
}

export default function CompareIndexPage() {
  const options: CompareOption[] = publicCatalog()
    .sort((a, b) => a.baseMsrpUsd - b.baseMsrpUsd)
    .map((v) => ({
      token: vehicleSlugToken(v),
      label: `${v.modelYear} ${getFamily(v.familySlug)?.name ?? ""} ${v.trimName}`,
      price: usd(totalPrice(v)),
    }));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Compare BMWs</h1>
      </header>

      <CompareBuilder options={options} />

      <section>
        <h2 className="text-xl font-semibold mb-3">Popular comparisons</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CURATED_COMPARISONS.map((slug) => (
            <li key={slug}>
              <Link
                href={`/compare/${slug}`}
                className="block rounded border border-black/10 dark:border-white/10 p-3 hover:bg-black/5 dark:hover:bg-white/5 capitalize"
              >
                {labelForSlug(slug)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
