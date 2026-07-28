import type { ModelFamily } from "@/domain/types";

// DS-02: model families are data rows, never enums in code.
export const FAMILIES: ModelFamily[] = [
  { slug: "3-series", name: "3 Series", bodyStyle: "Sedan", segment: "Compact Executive", isMDivision: false },
  { slug: "5-series", name: "5 Series", bodyStyle: "Sedan", segment: "Executive", isMDivision: false },
  { slug: "i4", name: "i4", bodyStyle: "Gran Coupe", segment: "Compact Executive EV", isMDivision: false },
  { slug: "i5", name: "i5", bodyStyle: "Sedan", segment: "Executive EV", isMDivision: false },
  { slug: "x3", name: "X3", bodyStyle: "SAV", segment: "Compact Luxury SUV", isMDivision: false },
  { slug: "x5", name: "X5", bodyStyle: "SAV", segment: "Mid-size Luxury SUV", isMDivision: false },
  { slug: "x7", name: "X7", bodyStyle: "SAV", segment: "Full-size Luxury SUV", isMDivision: false },
  { slug: "ix", name: "iX", bodyStyle: "SAV", segment: "Mid-size Luxury EV SUV", isMDivision: false },
  { slug: "z4", name: "Z4", bodyStyle: "Roadster", segment: "Roadster", isMDivision: false },
  { slug: "m3", name: "M3", bodyStyle: "Sedan", segment: "High-Performance Sedan", isMDivision: true },
  { slug: "m5", name: "M5", bodyStyle: "Sedan", segment: "High-Performance Sedan", isMDivision: true },
  { slug: "xm", name: "XM", bodyStyle: "SAV", segment: "High-Performance SUV", isMDivision: true },
];

const BY_SLUG = new Map(FAMILIES.map((f) => [f.slug, f]));

export function getFamily(slug: string): ModelFamily | undefined {
  return BY_SLUG.get(slug);
}
