import Link from "next/link";
import type { Vehicle } from "@/domain/types";
import {
  AVAILABILITY_LABEL,
  POWERTRAIN_LABEL,
  headlineSpecs,
  usd,
  totalPrice,
} from "@/lib/format";

// Server component (default). No client JS shipped for the card (NFR-04).
export function VehicleCard({
  vehicle,
  familyName,
}: {
  vehicle: Vehicle;
  familyName: string;
}) {
  const href = `/bmw/${vehicle.familySlug}/${vehicle.modelYear}/${vehicle.slug}`;
  const specs = headlineSpecs(vehicle);

  return (
    <article className="rounded-lg border border-black/10 dark:border-white/10 p-4 flex flex-col gap-3">
      <div
        className="aspect-[16/9] rounded-md bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 grid place-items-center text-xs opacity-70"
        role="img"
        aria-label={vehicle.imageAlt}
      >
        {familyName} {vehicle.trimName}
      </div>

      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-tight">
          <Link href={href} className="hover:underline">
            {vehicle.modelYear} BMW {familyName} {vehicle.trimName}
          </Link>
        </h3>
        <span className="shrink-0 text-[11px] rounded-full px-2 py-0.5 bg-black/5 dark:bg-white/10">
          {POWERTRAIN_LABEL[vehicle.powertrainType]}
        </span>
      </div>

      <p className="text-sm">
        <span className="font-medium">{usd(totalPrice(vehicle))}</span>{" "}
        <span className="opacity-70">incl. destination</span>
      </p>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        {specs.map((s) => (
          <div key={s.label}>
            <dt className="opacity-60 text-xs">{s.label}</dt>
            <dd className="font-medium">{s.value}</dd>
          </div>
        ))}
      </dl>

      {vehicle.availabilityStatus !== "on_sale" && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          {AVAILABILITY_LABEL[vehicle.availabilityStatus]}
        </p>
      )}

      <div className="mt-auto flex gap-3 text-sm">
        <Link href={href} className="underline">
          View specs
        </Link>
      </div>
    </article>
  );
}
