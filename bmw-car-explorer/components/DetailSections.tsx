import {
  attributesInCategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@/domain/attribute-registry";
import type { Vehicle } from "@/domain/types";
import { formatValue } from "@/domain/units";
import { SOURCES } from "@/data/sources";

// FR-201: all 15 category sections render server-side even when collapsed —
// <details> keeps the content in the HTML for indexing while collapsing it
// visually. Reads entirely from the attribute registry (AC-01).
export function DetailSections({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="space-y-3">
      {CATEGORY_ORDER.map((category) => {
        const defs = attributesInCategory(category).filter(
          (d) => d.public && vehicle.attributes[d.key] !== undefined,
        );
        if (defs.length === 0) return null;

        return (
          <details
            key={category}
            open
            className="rounded-lg border border-black/10 dark:border-white/10"
          >
            <summary className="cursor-pointer px-4 py-3 font-semibold">
              {CATEGORY_LABELS[category]}
            </summary>
            <dl className="px-4 pb-4 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {defs.map((d) => {
                const val = vehicle.attributes[d.key]!;
                const src = SOURCES[val.sourceId];
                const title = `Source: ${src?.name ?? val.sourceId} · verified ${val.lastVerifiedAt}`;
                return (
                  <div
                    key={d.key}
                    className="flex justify-between gap-3 border-b border-black/5 dark:border-white/5 py-1"
                  >
                    <dt className="opacity-70">{d.label}</dt>
                    <dd className="font-medium text-right">
                      <span title={title} className="cursor-help underline decoration-dotted">
                        {formatValue(val)}
                      </span>
                      {/* FR-203: confidence flag when value is not high-confidence. */}
                      {val.confidence !== "high" && (
                        <span
                          className="ml-1 text-[10px] rounded bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5"
                          title="Estimated / lower-confidence value"
                        >
                          {val.confidence === "estimated" ? "est." : "med."}
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </details>
        );
      })}
    </div>
  );
}
