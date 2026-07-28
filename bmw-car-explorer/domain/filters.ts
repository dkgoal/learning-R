import type { AvailabilityStatus, PowertrainType, Vehicle } from "./types";
import { numericValue } from "./units";

// Faceted filtering + sorting (FR-102/103). Filter state is expressed as a
// plain object parsed from the query string (FR-105) so it is shareable,
// back-button-safe, and server-renderable.

export interface CatalogFilter {
  bodyStyles?: string[];
  powertrains?: PowertrainType[];
  minPriceUsd?: number;
  maxPriceUsd?: number;
  minSeats?: number;
  drivetrains?: string[];
  modelYears?: number[];
  availability?: AvailabilityStatus[];
  mDivisionOnly?: boolean;
}

export type SortKey =
  | "price_asc"
  | "price_desc"
  | "hp_desc"
  | "zero_to_sixty_asc"
  | "range_desc"
  | "mpg_desc"
  | "cargo_desc"
  | "safety_desc"
  | "reliability_desc";

export interface FamilyMeta {
  bodyStyle: string;
  isMDivision: boolean;
}

export function applyFilter(
  vehicles: Vehicle[],
  filter: CatalogFilter,
  familyMeta: (familySlug: string) => FamilyMeta | undefined,
): Vehicle[] {
  return vehicles.filter((v) => {
    const fam = familyMeta(v.familySlug);
    const price = v.baseMsrpUsd + v.destinationUsd;

    if (filter.bodyStyles?.length && (!fam || !filter.bodyStyles.includes(fam.bodyStyle)))
      return false;
    if (filter.powertrains?.length && !filter.powertrains.includes(v.powertrainType))
      return false;
    if (filter.minPriceUsd !== undefined && price < filter.minPriceUsd) return false;
    if (filter.maxPriceUsd !== undefined && price > filter.maxPriceUsd) return false;
    if (filter.minSeats !== undefined) {
      const seats = numericValue(v.attributes["seating_capacity"]) ?? 0;
      if (seats < filter.minSeats) return false;
    }
    if (filter.drivetrains?.length && !filter.drivetrains.includes(v.drivetrain))
      return false;
    if (filter.modelYears?.length && !filter.modelYears.includes(v.modelYear))
      return false;
    if (filter.availability?.length && !filter.availability.includes(v.availabilityStatus))
      return false;
    if (filter.mDivisionOnly && !(fam?.isMDivision ?? false)) return false;

    return true;
  });
}

/** Number of active facet groups — used for the mobile applied-count badge (FR-102). */
export function activeFilterCount(filter: CatalogFilter): number {
  let n = 0;
  if (filter.bodyStyles?.length) n++;
  if (filter.powertrains?.length) n++;
  if (filter.minPriceUsd !== undefined || filter.maxPriceUsd !== undefined) n++;
  if (filter.minSeats !== undefined) n++;
  if (filter.drivetrains?.length) n++;
  if (filter.modelYears?.length) n++;
  if (filter.availability?.length) n++;
  if (filter.mDivisionOnly) n++;
  return n;
}

function metric(v: Vehicle, key: string): number | undefined {
  return numericValue(v.attributes[key]);
}

export function sortVehicles(vehicles: Vehicle[], sort: SortKey): Vehicle[] {
  const copy = [...vehicles];
  const cmp = (av: number | undefined, bv: number | undefined, dir: 1 | -1): number => {
    // Missing values always sink to the bottom, regardless of direction.
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return (av - bv) * dir;
  };
  const price = (v: Vehicle) => v.baseMsrpUsd + v.destinationUsd;

  copy.sort((a, b) => {
    let primary = 0;
    switch (sort) {
      case "price_asc":
        primary = cmp(price(a), price(b), 1);
        break;
      case "price_desc":
        primary = cmp(price(a), price(b), -1);
        break;
      case "hp_desc":
        primary = cmp(metric(a, "horsepower_hp"), metric(b, "horsepower_hp"), -1);
        break;
      case "zero_to_sixty_asc":
        primary = cmp(metric(a, "zero_to_sixty_s"), metric(b, "zero_to_sixty_s"), 1);
        break;
      case "range_desc":
        primary = cmp(metric(a, "epa_range_mi"), metric(b, "epa_range_mi"), -1);
        break;
      case "mpg_desc":
        primary = cmp(metric(a, "epa_combined_mpg"), metric(b, "epa_combined_mpg"), -1);
        break;
      case "cargo_desc":
        primary = cmp(metric(a, "max_cargo_cuft"), metric(b, "max_cargo_cuft"), -1);
        break;
      case "safety_desc":
        primary = cmp(metric(a, "nhtsa_overall_stars"), metric(b, "nhtsa_overall_stars"), -1);
        break;
      case "reliability_desc":
        primary = cmp(metric(a, "reliability_index"), metric(b, "reliability_index"), -1);
        break;
    }
    // Stable, deterministic tie-break: price asc then id.
    if (primary !== 0) return primary;
    if (price(a) !== price(b)) return price(a) - price(b);
    return a.id - b.id;
  });
  return copy;
}
