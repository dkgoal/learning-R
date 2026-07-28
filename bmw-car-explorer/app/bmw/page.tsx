import type { Metadata } from "next";
import Link from "next/link";
import { VehicleCard } from "@/components/VehicleCard";
import { applyFilter, sortVehicles, type SortKey } from "@/domain/filters";
import {
  familyMetaLookup,
  families,
  publicCatalog,
} from "@/lib/catalog-view";
import { getFamily } from "@/data/families";
import { parseFilter, parsePage, parseSort, type RawSearchParams } from "@/lib/query";

export const metadata: Metadata = {
  title: "Browse the BMW lineup",
  description:
    "Filter every BMW sold new in the US by body style, powertrain, price, seating, and drivetrain. Sort by price, horsepower, 0–60, range, cargo, and safety.",
  alternates: { canonical: "/bmw" },
};

const PAGE_SIZE = 9;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "price_asc", label: "Price (low to high)" },
  { value: "price_desc", label: "Price (high to low)" },
  { value: "hp_desc", label: "Horsepower" },
  { value: "zero_to_sixty_asc", label: "0–60 mph" },
  { value: "range_desc", label: "EPA range" },
  { value: "mpg_desc", label: "Combined mpg" },
  { value: "cargo_desc", label: "Max cargo" },
  { value: "safety_desc", label: "Safety rating" },
  { value: "reliability_desc", label: "Reliability index" },
];

const BODY_STYLES = ["Sedan", "Gran Coupe", "SAV", "Roadster"];
const POWERTRAINS: { value: string; label: string }[] = [
  { value: "ICE", label: "Gas" },
  { value: "MHEV", label: "Mild Hybrid" },
  { value: "PHEV", label: "Plug-in Hybrid" },
  { value: "BEV", label: "Electric" },
];

function buildQuery(base: RawSearchParams, overrides: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.set(k, v);
  }
  for (const [k, v] of Object.entries(overrides)) params.set(k, v);
  return `?${params.toString()}`;
}

export default async function BrowsePage(props: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await props.searchParams;
  const filter = parseFilter(sp);
  const sort = parseSort(sp);
  const page = parsePage(sp);

  const lookup = familyMetaLookup();
  const filtered = sortVehicles(applyFilter(publicCatalog(), filter, lookup), sort);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const selected = (name: keyof RawSearchParams, val: string): boolean => {
    const raw = sp[name];
    const list = Array.isArray(raw) ? raw : raw ? raw.split(",") : [];
    return list.includes(val);
  };

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      {/* Filters — a plain GET form so it works with JS disabled (FR-105/NFR-11). */}
      <aside>
        <form method="get" className="space-y-5 text-sm" aria-label="Filter lineup">
          <fieldset>
            <legend className="font-semibold mb-1">Body style</legend>
            {BODY_STYLES.map((b) => (
              <label key={b} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" name="body" value={b} defaultChecked={selected("body", b)} />
                {b}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend className="font-semibold mb-1">Powertrain</legend>
            {POWERTRAINS.map((p) => (
              <label key={p.value} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" name="pt" value={p.value} defaultChecked={selected("pt", p.value)} />
                {p.label}
              </label>
            ))}
          </fieldset>

          <div>
            <label className="font-semibold block mb-1" htmlFor="max">
              Max price (USD)
            </label>
            <input
              id="max"
              name="max"
              type="number"
              min={0}
              step={1000}
              defaultValue={filter.maxPriceUsd ?? ""}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1" htmlFor="seats">
              Min seats
            </label>
            <select
              id="seats"
              name="seats"
              defaultValue={filter.minSeats?.toString() ?? ""}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
            >
              <option value="">Any</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
              <option value="6">6+</option>
              <option value="7">7</option>
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="m" value="1" defaultChecked={filter.mDivisionOnly ?? false} />
            M Division only
          </label>

          <div>
            <label className="font-semibold block mb-1" htmlFor="sort">
              Sort by
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-ink text-white px-3 py-1.5 dark:bg-white dark:text-ink"
            >
              Apply
            </button>
            <Link href="/bmw" className="px-3 py-1.5 underline self-center">
              Reset
            </Link>
          </div>
        </form>
      </aside>

      <section aria-label="Vehicles">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-2xl font-bold">BMW lineup (US)</h1>
          <p className="text-sm opacity-70">{filtered.length} vehicles</p>
        </div>

        {pageItems.length === 0 ? (
          // FR-106: empty state offers one-click relaxation.
          <div className="rounded-lg border border-black/10 dark:border-white/10 p-6">
            <p className="mb-2">No vehicles match these filters.</p>
            <Link href="/bmw" className="underline">
              Clear all filters
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((v) => (
              <VehicleCard
                key={v.id}
                vehicle={v}
                familyName={getFamily(v.familySlug)?.name ?? v.familySlug}
              />
            ))}
          </div>
        )}

        {/* FR-107: crawlable pagination via real links. */}
        {totalPages > 1 && (
          <nav className="mt-6 flex gap-2" aria-label="Pagination">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={`/bmw${buildQuery(sp, { page: String(n) })}`}
                aria-current={n === clampedPage ? "page" : undefined}
                className={`px-3 py-1 rounded border ${
                  n === clampedPage
                    ? "bg-ink text-white dark:bg-white dark:text-ink"
                    : "border-black/20 dark:border-white/20"
                }`}
              >
                {n}
              </Link>
            ))}
          </nav>
        )}

        <p className="mt-6 text-xs opacity-60">
          Data last updated 2026-07-01.{" "}
          <Link href="/sources" className="underline">
            Sources &amp; methodology
          </Link>
          .
        </p>
      </section>

      <p className="sr-only">
        Family index:{" "}
        {families()
          .map((f) => f.name)
          .join(", ")}
      </p>
    </div>
  );
}
