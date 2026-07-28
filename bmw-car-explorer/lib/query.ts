import type { CatalogFilter, SortKey } from "@/domain/filters";
import type { AvailabilityStatus, PowertrainType } from "@/domain/types";

// FR-105: filter state lives in the query string so it is shareable,
// back-button-safe, and server-renderable. This module is the single
// parse/serialize boundary between URLSearchParams and the domain CatalogFilter.

export type RawSearchParams = Record<string, string | string[] | undefined>;

function csv(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const joined = Array.isArray(value) ? value.join(",") : value;
  return joined
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function int(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

const POWERTRAINS: PowertrainType[] = ["ICE", "MHEV", "PHEV", "BEV"];
const AVAILABILITY: AvailabilityStatus[] = [
  "on_sale", "announced", "order_only", "discontinued",
];
const SORT_KEYS: SortKey[] = [
  "price_asc", "price_desc", "hp_desc", "zero_to_sixty_asc",
  "range_desc", "mpg_desc", "cargo_desc", "safety_desc", "reliability_desc",
];

export function parseFilter(params: RawSearchParams): CatalogFilter {
  const filter: CatalogFilter = {};

  const body = csv(params["body"]);
  if (body.length) filter.bodyStyles = body;

  const pt = csv(params["pt"]).filter((p): p is PowertrainType =>
    POWERTRAINS.includes(p as PowertrainType),
  );
  if (pt.length) filter.powertrains = pt;

  const min = int(params["min"]);
  if (min !== undefined) filter.minPriceUsd = min;
  const max = int(params["max"]);
  if (max !== undefined) filter.maxPriceUsd = max;

  const seats = int(params["seats"]);
  if (seats !== undefined) filter.minSeats = seats;

  const dt = csv(params["dt"]);
  if (dt.length) filter.drivetrains = dt;

  const years = csv(params["year"])
    .map((y) => Number.parseInt(y, 10))
    .filter((y) => Number.isFinite(y));
  if (years.length) filter.modelYears = years;

  const avail = csv(params["avail"]).filter((a): a is AvailabilityStatus =>
    AVAILABILITY.includes(a as AvailabilityStatus),
  );
  if (avail.length) filter.availability = avail;

  if (params["m"] === "1") filter.mDivisionOnly = true;

  return filter;
}

export function parseSort(params: RawSearchParams): SortKey {
  const raw = Array.isArray(params["sort"]) ? params["sort"][0] : params["sort"];
  return SORT_KEYS.includes(raw as SortKey) ? (raw as SortKey) : "price_asc";
}

export function parsePage(params: RawSearchParams): number {
  const p = int(params["page"]);
  return p !== undefined && p > 0 ? p : 1;
}
