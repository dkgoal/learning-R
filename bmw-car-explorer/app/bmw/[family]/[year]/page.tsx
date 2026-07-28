import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VehicleCard } from "@/components/VehicleCard";
import { allVehicles } from "@/data/catalog";
import { getFamily } from "@/data/families";
import { publicVehiclesInFamily } from "@/lib/catalog-view";

export function generateStaticParams() {
  return allVehicles().map((v) => ({
    family: v.familySlug,
    year: String(v.modelYear),
  }));
}

export async function generateMetadata(props: {
  params: Promise<{ family: string; year: string }>;
}): Promise<Metadata> {
  const { family, year } = await props.params;
  const fam = getFamily(family);
  if (!fam) return {};
  return {
    title: `${year} BMW ${fam.name} specs & trims`,
    description: `All ${year} BMW ${fam.name} trims with pricing and specifications.`,
    alternates: { canonical: `/bmw/${fam.slug}/${year}` },
  };
}

export default async function ModelYearPage(props: {
  params: Promise<{ family: string; year: string }>;
}) {
  const { family, year } = await props.params;
  const fam = getFamily(family);
  const modelYear = Number.parseInt(year, 10);
  if (!fam || !Number.isFinite(modelYear)) notFound();

  const vehicles = publicVehiclesInFamily(family)
    .filter((v) => v.modelYear === modelYear)
    .sort((a, b) => a.baseMsrpUsd - b.baseMsrpUsd);

  if (vehicles.length === 0) notFound();

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm opacity-70">
        <Link href="/bmw" className="hover:underline">Lineup</Link> /{" "}
        <Link href={`/bmw/${fam.slug}`} className="hover:underline">{fam.name}</Link> /{" "}
        <span aria-current="page">{modelYear}</span>
      </nav>

      <h1 className="text-3xl font-bold">
        {modelYear} BMW {fam.name}
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {vehicles.map((v) => (
          <VehicleCard key={v.id} vehicle={v} familyName={fam.name} />
        ))}
      </div>
    </div>
  );
}
