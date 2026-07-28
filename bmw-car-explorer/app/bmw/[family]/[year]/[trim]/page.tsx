import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddToCompareButton,
  SaveButton,
} from "@/components/ClientActions";
import { DetailSections } from "@/components/DetailSections";
import { allVehicles, getVehicleById } from "@/data/catalog";
import { getFamily } from "@/data/families";
import { SOURCES } from "@/data/sources";
import { vehicleSlugToken } from "@/domain/comparison";
import { numericValue } from "@/domain/units";
import type { Vehicle } from "@/domain/types";
import { publicCatalog, publicVehicle } from "@/lib/catalog-view";
import {
  AVAILABILITY_LABEL,
  POWERTRAIN_LABEL,
  headlineSpecs,
  totalPrice,
  usd,
  vehicleTitle,
} from "@/lib/format";
import { absoluteUrl } from "@/lib/site";

export function generateStaticParams() {
  return allVehicles().map((v) => ({
    family: v.familySlug,
    year: String(v.modelYear),
    trim: v.slug,
  }));
}

export async function generateMetadata(props: {
  params: Promise<{ family: string; year: string; trim: string }>;
}): Promise<Metadata> {
  const { family, year, trim } = await props.params;
  const fam = getFamily(family);
  const v = publicVehicle(family, Number.parseInt(year, 10), trim);
  if (!fam || !v) return {};
  const title = vehicleTitle(v, fam.name);
  const path = `/bmw/${family}/${year}/${trim}`;
  return {
    title: `${title} — specs & price`,
    description: `${title}: full specifications across 15 categories including performance, efficiency, safety, dimensions, and pricing. Every value sourced and dated.`,
    alternates: { canonical: path },
    openGraph: { title, url: absoluteUrl(path), type: "website" },
  };
}

// FR-205: nearest-neighbour "Similar BMWs" for internal linking (SEO).
function similarVehicles(target: Vehicle): Vehicle[] {
  const price = totalPrice(target);
  return publicCatalog()
    .filter((v) => v.id !== target.id)
    .map((v) => {
      let distance = Math.abs(totalPrice(v) - price) / 1000;
      const tFam = getFamily(target.familySlug);
      const vFam = getFamily(v.familySlug);
      if (vFam?.bodyStyle !== tFam?.bodyStyle) distance += 30;
      if (v.powertrainType !== target.powertrainType) distance += 15;
      return { v, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((x) => x.v);
}

export default async function TrimDetailPage(props: {
  params: Promise<{ family: string; year: string; trim: string }>;
}) {
  const { family, year, trim } = await props.params;
  const fam = getFamily(family);
  const modelYear = Number.parseInt(year, 10);
  const vehicle = publicVehicle(family, modelYear, trim);
  if (!fam || !vehicle) notFound();

  const title = vehicleTitle(vehicle, fam.name);
  const specs = headlineSpecs(vehicle);
  const token = vehicleSlugToken(vehicle);
  const path = `/bmw/${family}/${year}/${trim}`;
  const recalls = numericValue(vehicle.attributes["open_recall_count"]) ?? 0;
  const complaints = numericValue(vehicle.attributes["nhtsa_complaint_count"]) ?? 0;
  const similar = similarVehicles(vehicle);

  const successor = vehicle.successorId ? getVehicleById(vehicle.successorId) : undefined;

  // SEO-03: Vehicle + Product + Offer JSON-LD. No AggregateRating — the
  // underlying ratings are not licensed for publication (§14.1 / R-01).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["Product", "Vehicle"],
    name: title,
    brand: { "@type": "Brand", name: "BMW" },
    vehicleModelDate: String(vehicle.modelYear),
    vehicleConfiguration: vehicle.trimName,
    fuelType: POWERTRAIN_LABEL[vehicle.powertrainType],
    driveWheelConfiguration: vehicle.drivetrain,
    url: absoluteUrl(path),
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: totalPrice(vehicle),
      availability:
        vehicle.availabilityStatus === "on_sale"
          ? "https://schema.org/InStock"
          : "https://schema.org/PreOrder",
    },
  };

  // SEO-05: breadcrumb schema mirroring the URL hierarchy.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Lineup", item: absoluteUrl("/bmw") },
      { "@type": "ListItem", position: 2, name: fam.name, item: absoluteUrl(`/bmw/${family}`) },
      { "@type": "ListItem", position: 3, name: String(modelYear), item: absoluteUrl(`/bmw/${family}/${year}`) },
      { "@type": "ListItem", position: 4, name: vehicle.trimName, item: absoluteUrl(path) },
    ],
  };

  return (
    <article className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <nav aria-label="Breadcrumb" className="text-sm opacity-70">
        <Link href="/bmw" className="hover:underline">Lineup</Link> /{" "}
        <Link href={`/bmw/${family}`} className="hover:underline">{fam.name}</Link> /{" "}
        <Link href={`/bmw/${family}/${year}`} className="hover:underline">{modelYear}</Link> /{" "}
        <span aria-current="page">{vehicle.trimName}</span>
      </nav>

      {/* FR-207: lifecycle banner for discontinued / non-on-sale vehicles. */}
      {vehicle.availabilityStatus !== "on_sale" && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm">
          <strong>{AVAILABILITY_LABEL[vehicle.availabilityStatus]}.</strong>{" "}
          {vehicle.availabilityStatus === "discontinued"
            ? "This model year is no longer sold new. Specs are retained for reference."
            : "Availability is limited — confirm with a dealer."}
          {successor && (
            <>
              {" "}Successor:{" "}
              <Link
                className="underline"
                href={`/bmw/${successor.familySlug}/${successor.modelYear}/${successor.slug}`}
              >
                {successor.modelYear} {getFamily(successor.familySlug)?.name} {successor.trimName}
              </Link>
              .
            </>
          )}
        </div>
      )}

      <header className="grid gap-6 md:grid-cols-2">
        <div
          className="aspect-[16/9] rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 grid place-items-center opacity-70"
          role="img"
          aria-label={vehicle.imageAlt}
        >
          {fam.name} {vehicle.trimName}
        </div>
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="opacity-80">
              {POWERTRAIN_LABEL[vehicle.powertrainType]} · {vehicle.drivetrain}
              {vehicle.generationCode ? ` · ${vehicle.generationCode}` : ""}
            </p>
          </div>

          {/* FR-202: price ladder. */}
          <dl className="text-sm">
            <div className="flex justify-between border-b border-black/5 dark:border-white/5 py-1">
              <dt className="opacity-70">Base MSRP</dt>
              <dd>{usd(vehicle.baseMsrpUsd)}</dd>
            </div>
            <div className="flex justify-between border-b border-black/5 dark:border-white/5 py-1">
              <dt className="opacity-70">Destination</dt>
              <dd>{usd(vehicle.destinationUsd)}</dd>
            </div>
            <div className="flex justify-between py-1 font-semibold">
              <dt>Starting price</dt>
              <dd>{usd(totalPrice(vehicle))}</dd>
            </div>
          </dl>

          <dl className="grid grid-cols-2 gap-3">
            {specs.map((s) => (
              <div key={s.label} className="rounded border border-black/10 dark:border-white/10 p-2">
                <dt className="opacity-60 text-xs">{s.label}</dt>
                <dd className="font-semibold">{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2">
            <AddToCompareButton token={token} />
            <SaveButton token={token} />
          </div>
        </div>
      </header>

      <section aria-label="Full specifications">
        <h2 className="text-xl font-semibold mb-3">Full specifications</h2>
        <DetailSections vehicle={vehicle} />
      </section>

      {/* FR-206: recalls & complaints. */}
      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <h2 className="text-lg font-semibold mb-1">Recalls &amp; complaints</h2>
        <p className="text-sm opacity-80">
          {recalls} open recall{recalls === 1 ? "" : "s"} and {complaints} NHTSA
          complaint{complaints === 1 ? "" : "s"} on record. Source:{" "}
          <a className="underline" href={SOURCES["s_nhtsa_recalls"]?.url}>
            NHTSA
          </a>
          . Our Reliability Index is derived from these public figures — see{" "}
          <Link href="/methodology" className="underline">methodology</Link>.
        </p>
      </section>

      {/* FR-205: internal-linking similar vehicles. */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Similar BMWs</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {similar.map((v) => {
            const vf = getFamily(v.familySlug);
            return (
              <li key={v.id}>
                <Link
                  href={`/bmw/${v.familySlug}/${v.modelYear}/${v.slug}`}
                  className="block rounded-lg border border-black/10 dark:border-white/10 p-3 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="font-medium">
                    {v.modelYear} {vf?.name} {v.trimName}
                  </span>
                  <span className="block text-sm opacity-70">{usd(totalPrice(v))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* FR-208: data freshness + sources. */}
      <p className="text-xs opacity-60">
        Data last updated 2026-07-01.{" "}
        <Link href="/sources" className="underline">Sources &amp; methodology</Link>. Pricing and
        specifications are subject to change — confirm with an authorized dealer.
      </p>
    </article>
  );
}
