import { allVehicles, getVehicle, vehiclesInFamily } from "@/data/catalog";
import { FAMILIES, getFamily } from "@/data/families";
import type { FamilyMeta } from "@/domain/filters";
import type { ModelFamily, Vehicle } from "@/domain/types";
import { serializePublic } from "@/domain/units";

// Read-only catalog access for the web layer. In production this wraps the
// Drizzle repositories against the read-only catalog role (AR-01). Here it
// wraps the seed data. Everything crossing this boundary is public-serialized
// (AR-03): licensing-restricted attributes never leave the server.

export function publicCatalog(): Vehicle[] {
  return allVehicles().map(serializePublic);
}

export function publicVehicle(
  familySlug: string,
  modelYear: number,
  trimSlug: string,
): Vehicle | undefined {
  const v = getVehicle(familySlug, modelYear, trimSlug);
  return v ? serializePublic(v) : undefined;
}

export function publicVehiclesInFamily(familySlug: string): Vehicle[] {
  return vehiclesInFamily(familySlug).map(serializePublic);
}

export function families(): ModelFamily[] {
  return FAMILIES;
}

export function familyMeta(familySlug: string): FamilyMeta | undefined {
  const f = getFamily(familySlug);
  return f ? { bodyStyle: f.bodyStyle, isMDivision: f.isMDivision } : undefined;
}

export function familyMetaLookup() {
  return (slug: string) => familyMeta(slug);
}
