import { allVehicles } from "@/data/catalog";
import { canonicalCompareSlug, vehicleSlugToken } from "@/domain/comparison";
import type { Vehicle } from "@/domain/types";

// Token <-> vehicle resolution for comparison URLs. Tokens are generated
// deterministically (bmw-<family>-<trim>-<year>), so we resolve by exact match
// against the catalog rather than parsing hyphens ambiguously.
const TOKEN_TO_VEHICLE = new Map(
  allVehicles().map((v) => [vehicleSlugToken(v), v]),
);

export function parseCompareSlug(slug: string): Vehicle[] | null {
  const tokens = slug.split("-vs-");
  if (tokens.length < 2 || tokens.length > 4) return null;
  const vehicles: Vehicle[] = [];
  for (const token of tokens) {
    const v = TOKEN_TO_VEHICLE.get(token);
    if (!v) return null;
    vehicles.push(v);
  }
  // De-duplicate.
  const ids = new Set(vehicles.map((v) => v.id));
  if (ids.size !== vehicles.length) return null;
  return vehicles;
}

export { canonicalCompareSlug };

// SEO-02: only a curated set of comparisons is indexable. Everything else is
// rendered but marked noindex,follow to avoid duplicate-content penalties.
export const CURATED_COMPARISONS: string[] = [
  "bmw-x3-xdrive30-2026-vs-bmw-x5-xdrive40i-2026",
  "bmw-i4-edrive40-2026-vs-bmw-i5-edrive40-2026",
  "bmw-3-series-m340i-xdrive-2026-vs-bmw-m3-competition-xdrive-2026",
  "bmw-x5-xdrive40i-2026-vs-bmw-x5-xdrive50e-2026",
].map((s) => {
  // Normalize curated entries to canonical order so lookups are exact.
  const vehicles = parseCompareSlug(s);
  return vehicles ? canonicalCompareSlug(vehicles) : s;
});

export function isCurated(canonicalSlug: string): boolean {
  return CURATED_COMPARISONS.includes(canonicalSlug);
}
