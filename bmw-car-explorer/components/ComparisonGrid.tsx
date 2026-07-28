import { Fragment } from "react";
import Link from "next/link";
import {
  buildComparison,
  buildRadar,
  type CompareOptions,
  type RadarAxis,
} from "@/domain/comparison";
import type { Vehicle } from "@/domain/types";
import { formatValue } from "@/domain/units";
import { getFamily } from "@/data/families";
import { totalPrice, usd } from "@/lib/format";

// FR-311: fully server-rendered — a shared link shows complete content to a
// crawler and to a user with JS disabled. The differences-only toggle and
// baseline selector are plain links that change the query string.

const RADAR_LABELS: Record<RadarAxis, string> = {
  performance: "Performance",
  efficiency: "Efficiency",
  safety: "Safety",
  tech: "Technology",
  utility: "Utility",
  value: "Value",
};

function shortName(v: Vehicle): string {
  const fam = getFamily(v.familySlug)?.name ?? v.familySlug;
  return `${fam} ${v.trimName}`;
}

export function ComparisonGrid({
  vehicles,
  options,
  baseHref,
}: {
  vehicles: Vehicle[];
  options: CompareOptions;
  baseHref: string;
}) {
  const groups = buildComparison(vehicles, options);
  const radar = buildRadar(vehicles);

  const toggleHref = (params: Record<string, string | undefined>): string => {
    const usp = new URLSearchParams();
    if (options.differencesOnly) usp.set("diff", "1");
    if (options.baselineVehicleId !== undefined)
      usp.set("base", String(options.baselineVehicleId));
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) usp.delete(k);
      else usp.set(k, v);
    }
    const qs = usp.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  return (
    <div className="space-y-6">
      {/* Controls (FR-304/305) as links so they work without JS. */}
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={toggleHref({ diff: options.differencesOnly ? undefined : "1" })}
          className="rounded border border-black/20 dark:border-white/20 px-3 py-1"
        >
          {options.differencesOnly ? "Show all rows" : "Differences only"}
        </Link>
        <span className="self-center opacity-70">Baseline for deltas:</span>
        {vehicles.map((v) => (
          <Link
            key={v.id}
            href={toggleHref({
              base:
                options.baselineVehicleId === v.id ? undefined : String(v.id),
            })}
            className={`rounded border px-3 py-1 ${
              options.baselineVehicleId === v.id
                ? "bg-ink text-white dark:bg-white dark:text-ink"
                : "border-black/20 dark:border-white/20"
            }`}
          >
            {shortName(v)}
          </Link>
        ))}
      </div>

      {/* FR-302: horizontal scroll with the attribute column pinned. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[40rem]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white dark:bg-ink text-left p-2 z-10 min-w-[10rem]">
                Attribute
              </th>
              {vehicles.map((v) => (
                <th key={v.id} className="p-2 text-left align-bottom min-w-[9rem]">
                  <Link
                    href={`/bmw/${v.familySlug}/${v.modelYear}/${v.slug}`}
                    className="font-semibold hover:underline"
                  >
                    {v.modelYear} {shortName(v)}
                  </Link>
                  <div className="opacity-70 font-normal">{usd(totalPrice(v))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.category}>
                <tr className="bg-black/5 dark:bg-white/5">
                  <th
                    colSpan={vehicles.length + 1}
                    className="sticky left-0 text-left p-2 font-semibold"
                  >
                    {group.label}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.key} className="border-b border-black/5 dark:border-white/5">
                    <th className="sticky left-0 bg-white dark:bg-ink text-left p-2 font-normal opacity-80 z-10">
                      {row.label}
                    </th>
                    {row.cells.map((cell) => {
                      const v = vehicles.find((x) => x.id === cell.vehicleId)!;
                      const display = cell.present
                        ? formatValue(v.attributes[row.key])
                        : "—"; // FR-310: inapplicable rows never coerce equivalence
                      return (
                        <td
                          key={cell.vehicleId}
                          className={`p-2 ${
                            cell.isBest
                              ? "font-semibold text-emerald-700 dark:text-emerald-400"
                              : ""
                          }`}
                        >
                          {display}
                          {cell.isBest && (
                            <span className="sr-only"> (best in row)</span>
                          )}
                          {cell.deltaAbs !== undefined &&
                            cell.deltaPct !== undefined &&
                            cell.deltaAbs !== 0 && (
                              <span className="block text-[11px] opacity-60">
                                {cell.deltaAbs > 0 ? "+" : ""}
                                {Number(cell.deltaAbs.toFixed(1))} (
                                {cell.deltaPct > 0 ? "+" : ""}
                                {Number(cell.deltaPct.toFixed(1))}%)
                              </span>
                            )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* FR-308: relative spec radar, min-max normalized within this set. */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Relative strengths</h2>
        <p className="text-xs opacity-60 mb-3">
          Scores are normalized <strong>relative to the vehicles compared here</strong>,
          not absolute ratings.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[30rem]">
            <thead>
              <tr>
                <th className="text-left p-2">Axis</th>
                {vehicles.map((v) => (
                  <th key={v.id} className="text-left p-2">{shortName(v)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(RADAR_LABELS) as RadarAxis[]).map((axis) => (
                <tr key={axis} className="border-b border-black/5 dark:border-white/5">
                  <th className="text-left p-2 font-normal opacity-80">
                    {RADAR_LABELS[axis]}
                  </th>
                  {radar.map((r) => (
                    <td key={r.vehicleId} className="p-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 rounded bg-ink dark:bg-white"
                          style={{ width: `${Math.round(r.axes[axis] * 60)}px` }}
                          aria-hidden
                        />
                        <span>{Math.round(r.axes[axis] * 100)}</span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
