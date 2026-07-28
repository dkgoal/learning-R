import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VehicleCard } from "@/components/VehicleCard";
import { FAMILIES, getFamily } from "@/data/families";
import { publicVehiclesInFamily } from "@/lib/catalog-view";
import { absoluteUrl } from "@/lib/site";

export function generateStaticParams() {
  return FAMILIES.map((f) => ({ family: f.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ family: string }>;
}): Promise<Metadata> {
  const { family } = await props.params;
  const fam = getFamily(family);
  if (!fam) return {};
  return {
    title: `BMW ${fam.name} — specs, trims & prices`,
    description: `Every BMW ${fam.name} trim sold new in the US, with full specifications, pricing, and model-year detail.`,
    alternates: { canonical: `/bmw/${fam.slug}` },
    openGraph: { title: `BMW ${fam.name}`, url: absoluteUrl(`/bmw/${fam.slug}`) },
  };
}

export default async function FamilyPage(props: {
  params: Promise<{ family: string }>;
}) {
  const { family } = await props.params;
  const fam = getFamily(family);
  if (!fam) notFound();

  const vehicles = publicVehiclesInFamily(family).sort(
    (a, b) => b.modelYear - a.modelYear || a.baseMsrpUsd - b.baseMsrpUsd,
  );

  const years = [...new Set(vehicles.map((v) => v.modelYear))].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm opacity-70">
        <Link href="/bmw" className="hover:underline">
          Lineup
        </Link>{" "}
        / <span aria-current="page">{fam.name}</span>
      </nav>

      <header>
        <h1 className="text-3xl font-bold">BMW {fam.name}</h1>
        <p className="opacity-80">
          {fam.bodyStyle} · {fam.segment}
          {fam.isMDivision ? " · M Division" : ""}
        </p>
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        {years.map((y) => (
          <Link
            key={y}
            href={`/bmw/${fam.slug}/${y}`}
            className="rounded-full border border-black/20 dark:border-white/20 px-3 py-1"
          >
            {y}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {vehicles.map((v) => (
          <VehicleCard key={v.id} vehicle={v} familyName={fam.name} />
        ))}
      </div>
    </div>
  );
}
