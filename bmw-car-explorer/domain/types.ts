// Core domain types. These are pure data shapes shared by the server (SEO
// rendering) and the client (instant re-ranking). No DB/DOM/network types here.

export type PowertrainType = "ICE" | "MHEV" | "PHEV" | "BEV";
export type Drivetrain = "RWD" | "xDrive" | "AWD";
export type AvailabilityStatus =
  | "on_sale"
  | "announced"
  | "order_only"
  | "discontinued";

export type AttributeCategory =
  | "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8"
  | "C9" | "C10" | "C11" | "C12" | "C13" | "C14" | "C15";

export type DataType =
  | "numeric"
  | "integer"
  | "boolean"
  | "enum"
  | "text"
  | "array";

export type Confidence = "high" | "medium" | "estimated";

/**
 * AC-01: every attribute is defined exactly once here. UI, comparison,
 * filtering, finder scoring, and the JSON-LD serializer all read from it.
 */
export interface AttributeDef {
  key: string; // snake_case; matches DB attribute_registry.key exactly (§9)
  category: AttributeCategory;
  label: string;
  unit: string | null;
  dataType: DataType;
  /** null = not comparable / no winner marking */
  higherIsBetter: boolean | null;
  displayPrecision: number;
  filterable: boolean;
  comparable: boolean;
  /**
   * AC-02: licensing kill switch. When false the value is stripped at the
   * serialization boundary and never reaches the client (AR-03, §14.1).
   */
  public: boolean;
}

/** A single measured attribute value on a vehicle. */
export interface AttributeValue {
  key: string;
  num?: number;
  text?: string;
  bool?: boolean;
  sourceId: string;
  confidence: Confidence;
  lastVerifiedAt: string; // ISO date
}

export type FeatureAvailability =
  | "standard"
  | "optional"
  | "package_only"
  | "unavailable";

export interface VehicleFeature {
  key: string;
  name: string;
  availability: FeatureAvailability;
  packageName?: string;
}

export interface Source {
  id: string;
  name: string;
  url?: string;
  licenseNote?: string;
  attributionRequired: boolean;
}

export interface ModelFamily {
  slug: string; // URL segment, e.g. "x5"
  name: string; // "X5"
  bodyStyle: string;
  segment: string;
  isMDivision: boolean;
}

export interface Vehicle {
  id: number;
  familySlug: string;
  modelYear: number;
  trimName: string; // "xDrive40i"
  slug: string; // "xdrive40i"
  generationCode?: string;
  powertrainType: PowertrainType;
  drivetrain: Drivetrain;
  baseMsrpUsd: number;
  destinationUsd: number;
  availabilityStatus: AvailabilityStatus;
  successorId?: number;
  predecessorId?: number;
  /** attribute key -> value */
  attributes: Record<string, AttributeValue>;
  features: VehicleFeature[];
  competitors?: string[];
  imageAlt: string;
}
