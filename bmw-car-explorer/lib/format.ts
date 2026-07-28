import type { Vehicle } from "@/domain/types";
import { formatValue, numericValue } from "@/domain/units";

export function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export function vehicleTitle(v: Vehicle, familyName: string): string {
  return `${v.modelYear} BMW ${familyName} ${v.trimName}`;
}

export function totalPrice(v: Vehicle): number {
  return v.baseMsrpUsd + v.destinationUsd;
}

/** Headline specs for cards/hero (FR-101/202), read via the registry. */
export function headlineSpecs(v: Vehicle): { label: string; value: string }[] {
  const specs: { label: string; value: string }[] = [];
  const push = (label: string, key: string) => {
    const val = v.attributes[key];
    if (val) specs.push({ label, value: formatValue(val) });
  };
  push("0–60 mph", "zero_to_sixty_s");
  push("Horsepower", "horsepower_hp");
  if (numericValue(v.attributes["epa_range_mi"]) !== undefined) {
    push("EPA Range", "epa_range_mi");
  } else {
    push("Combined", "epa_combined_mpg");
  }
  push("Safety", "nhtsa_overall_stars");
  return specs;
}

export const POWERTRAIN_LABEL: Record<string, string> = {
  ICE: "Gas",
  MHEV: "Mild Hybrid",
  PHEV: "Plug-in Hybrid",
  BEV: "Electric",
};

export const AVAILABILITY_LABEL: Record<string, string> = {
  on_sale: "On sale",
  announced: "Announced",
  order_only: "Order only",
  discontinued: "Discontinued",
};
