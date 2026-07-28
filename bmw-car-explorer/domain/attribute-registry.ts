import type { AttributeCategory, AttributeDef } from "./types";

/**
 * AC-01: the single source of truth for attribute metadata. Every consumer
 * (detail UI, comparison grid, filters, finder scorer, JSON-LD serializer)
 * reads from here. No attribute metadata is hard-coded in components.
 *
 * AC-02 / R-01: licensed C8 ratings (JD Power, Consumer Reports, Edmunds, KBB)
 * are registered with `public: false`. They are stripped at the serialization
 * boundary (see serializePublic) and never ship to the client until a license
 * is secured. We substitute an internally computed `reliability_index`
 * (public) derived from NHTSA complaint density + recalls.
 */

export const CATEGORY_LABELS: Record<AttributeCategory, string> = {
  C1: "Identity & Classification",
  C2: "Pricing & Cost of Ownership",
  C3: "Powertrain & Performance",
  C4: "Efficiency, Fuel & Electric",
  C5: "Dimensions, Capacity & Utility",
  C6: "Safety Ratings (Crash-Tested)",
  C7: "Active Safety & Driver Assistance",
  C8: "Consumer & Expert Ratings",
  C9: "Reliability, Warranty & Service",
  C10: "Technology & Infotainment",
  C11: "Comfort, Interior & Audio",
  C12: "Exterior, Chassis & Handling Hardware",
  C13: "Options, Packages & Configurability",
  C14: "Environmental & Regulatory",
  C15: "Availability & Market Context",
};

export const CATEGORY_ORDER: AttributeCategory[] = [
  "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8",
  "C9", "C10", "C11", "C12", "C13", "C14", "C15",
];

function def(
  key: string,
  category: AttributeCategory,
  label: string,
  unit: string | null,
  dataType: AttributeDef["dataType"],
  higherIsBetter: boolean | null,
  opts: Partial<Pick<AttributeDef, "displayPrecision" | "filterable" | "comparable" | "public">> = {},
): AttributeDef {
  return {
    key,
    category,
    label,
    unit,
    dataType,
    higherIsBetter,
    displayPrecision: opts.displayPrecision ?? (dataType === "integer" ? 0 : 1),
    filterable: opts.filterable ?? true,
    comparable: opts.comparable ?? higherIsBetter !== null,
    public: opts.public ?? true,
  };
}

const DEFS: AttributeDef[] = [
  // C1 — Identity & Classification
  def("generation_code", "C1", "Generation", null, "text", null, { filterable: true, comparable: false }),
  def("body_style", "C1", "Body Style", null, "enum", null, { comparable: false }),
  def("segment", "C1", "Segment", null, "enum", null, { comparable: false }),
  def("powertrain_type", "C1", "Powertrain Type", null, "enum", null, { comparable: false }),
  def("assembly_plant", "C1", "Assembly Plant", null, "text", null, { filterable: false, comparable: false }),

  // C2 — Pricing & Cost of Ownership
  def("base_msrp", "C2", "Base MSRP", "USD", "integer", false),
  def("destination_charge", "C2", "Destination Charge", "USD", "integer", false, { filterable: false }),
  def("est_5yr_maintenance", "C2", "Est. 5-yr Maintenance", "USD", "integer", false, { filterable: false }),
  def("est_5yr_fuel_or_energy", "C2", "Est. 5-yr Fuel/Energy", "USD", "integer", false, { filterable: false }),
  def("total_cost_of_ownership_5yr", "C2", "Est. 5-yr Cost of Ownership", "USD", "integer", false),
  def("depreciation_5yr_pct", "C2", "5-yr Depreciation", "%", "numeric", false, { filterable: false }),
  def("ev_incentive_eligibility", "C2", "Federal EV Incentive Eligible", null, "boolean", true, { comparable: false }),

  // C3 — Powertrain & Performance
  def("engine_code", "C3", "Engine Code", null, "text", null, { comparable: false }),
  def("horsepower_hp", "C3", "Horsepower", "hp", "integer", true),
  def("torque_lbft", "C3", "Torque", "lb-ft", "integer", true),
  def("combined_system_output", "C3", "Combined System Output", "hp", "integer", true, { filterable: false }),
  def("motor_count", "C3", "Electric Motors", null, "integer", null, { filterable: false, comparable: false }),
  def("transmission", "C3", "Transmission", null, "text", null, { comparable: false }),
  def("zero_to_sixty_s", "C3", "0–60 mph", "s", "numeric", false, { displayPrecision: 1 }),
  def("quarter_mile_s", "C3", "Quarter Mile", "s", "numeric", false, { filterable: false }),
  def("top_speed_mph", "C3", "Top Speed", "mph", "integer", true),
  def("braking_60_0_ft", "C3", "Braking 60–0", "ft", "integer", false, { filterable: false }),
  def("lateral_g", "C3", "Lateral Grip", "g", "numeric", true, { displayPrecision: 2, filterable: false }),

  // C4 — Efficiency, Fuel & Electric
  def("epa_city_mpg", "C4", "EPA City", "mpg", "integer", true, { filterable: false }),
  def("epa_highway_mpg", "C4", "EPA Highway", "mpg", "integer", true, { filterable: false }),
  def("epa_combined_mpg", "C4", "EPA Combined", "mpg", "integer", true),
  def("mpge_combined", "C4", "MPGe Combined", "MPGe", "integer", true),
  def("fuel_tank_gal", "C4", "Fuel Tank", "gal", "numeric", null, { filterable: false, comparable: false }),
  def("battery_capacity_kwh", "C4", "Battery (usable)", "kWh", "numeric", true, { filterable: false }),
  def("epa_range_mi", "C4", "EPA Range", "mi", "integer", true),
  def("electric_only_range_mi", "C4", "Electric-Only Range", "mi", "integer", true, { filterable: false }),
  def("dc_fast_charge_peak_kw", "C4", "DC Fast Charge Peak", "kW", "integer", true, { filterable: false }),
  def("charge_10_80_min", "C4", "DC Charge 10–80%", "min", "integer", false, { filterable: false }),
  def("charge_port_standard", "C4", "Charge Port", null, "enum", null, { comparable: false }),

  // C5 — Dimensions, Capacity & Utility
  def("length_in", "C5", "Length", "in", "numeric", null, { filterable: false, comparable: false }),
  def("wheelbase_in", "C5", "Wheelbase", "in", "numeric", true, { filterable: false }),
  def("ground_clearance_in", "C5", "Ground Clearance", "in", "numeric", true, { filterable: false }),
  def("curb_weight_lb", "C5", "Curb Weight", "lb", "integer", false, { filterable: false }),
  def("seating_capacity", "C5", "Seating Capacity", "seats", "integer", true),
  def("front_legroom_in", "C5", "Front Legroom", "in", "numeric", true, { filterable: false }),
  def("cargo_behind_2nd_row_cuft", "C5", "Cargo (behind 2nd row)", "cu ft", "numeric", true, { filterable: false }),
  def("cargo_behind_3rd_row_cuft", "C5", "Cargo (behind 3rd row)", "cu ft", "numeric", true, { filterable: false }),
  def("max_cargo_cuft", "C5", "Max Cargo", "cu ft", "numeric", true),
  def("frunk_cuft", "C5", "Frunk", "cu ft", "numeric", true, { filterable: false }),
  def("max_towing_lb", "C5", "Max Towing", "lb", "integer", true, { filterable: false }),

  // C6 — Safety Ratings (public: NHTSA + IIHS are publishable)
  def("nhtsa_overall_stars", "C6", "NHTSA Overall", "stars", "numeric", true),
  def("iihs_award", "C6", "IIHS Award", null, "enum", true, { comparable: true }),
  def("iihs_headlight_rating", "C6", "IIHS Headlights", null, "enum", null, { filterable: false, comparable: false }),

  // C7 — Active Safety & Driver Assistance
  def("highway_assistant_hands_free", "C7", "Hands-Free Highway Assist", null, "boolean", true, { comparable: true }),
  def("surround_view_360", "C7", "360° Surround View", null, "boolean", true, { filterable: false }),
  def("sae_autonomy_level", "C7", "SAE Autonomy Level", "level", "integer", true, { filterable: false }),

  // C8 — Consumer & Expert Ratings ⚠ licensing-gated (public: false, §14.1 / R-01)
  def("jd_power_quality", "C8", "JD Power Quality", "pts", "integer", true, { public: false }),
  def("consumer_reports_road_test", "C8", "Consumer Reports Road Test", "pts", "integer", true, { public: false }),
  def("edmunds_rating", "C8", "Edmunds Rating", "/10", "numeric", true, { public: false }),

  // C9 — Reliability, Warranty & Service
  def("basic_warranty_yr", "C9", "Basic Warranty", "yr", "numeric", true, { filterable: false }),
  def("ev_battery_warranty_yr", "C9", "EV Battery Warranty", "yr", "numeric", true, { filterable: false }),
  def("open_recall_count", "C9", "Open Recalls", "count", "integer", false, { filterable: false }),
  def("nhtsa_complaint_count", "C9", "NHTSA Complaints", "count", "integer", false, { filterable: false }),
  // Our own methodology, fully public (R-01 substitute for licensed reliability).
  def("reliability_index", "C9", "Reliability Index (our methodology)", "/100", "integer", true),

  // C10 — Technology & Infotainment
  def("idrive_version", "C10", "iDrive Version", null, "text", null, { comparable: false }),
  def("center_display_in", "C10", "Center Display", "in", "numeric", true, { filterable: false }),
  def("head_up_display", "C10", "Head-Up Display", null, "boolean", true, { filterable: false }),
  def("wireless_carplay", "C10", "Wireless CarPlay", null, "boolean", true, { filterable: false }),
  def("ota_update_capability", "C10", "OTA Updates", null, "boolean", true, { filterable: false }),

  // C11 — Comfort, Interior & Audio
  def("upholstery_options", "C11", "Upholstery Options", null, "array", null, { comparable: false, filterable: false }),
  def("ventilated_seats", "C11", "Ventilated Seats", null, "boolean", true, { filterable: false }),
  def("panoramic_roof", "C11", "Panoramic Roof", null, "boolean", true, { filterable: false }),
  def("audio_system_options", "C11", "Audio System Options", null, "array", null, { comparable: false, filterable: false }),
  def("interior_noise_db_at_70mph", "C11", "Interior Noise @ 70 mph", "dB", "numeric", false, { filterable: false }),

  // C12 — Exterior, Chassis & Handling Hardware
  def("suspension_type", "C12", "Suspension", null, "text", null, { comparable: false }),
  def("adaptive_m_suspension", "C12", "Adaptive M Suspension", null, "boolean", true, { filterable: false }),
  def("air_suspension", "C12", "Air Suspension", null, "boolean", true, { filterable: false }),
  def("drag_coefficient_cd", "C12", "Drag Coefficient", "Cd", "numeric", false, { displayPrecision: 2, filterable: false }),

  // C13 — Options, Packages & Configurability
  def("bmw_individual_available", "C13", "BMW Individual Available", null, "boolean", true, { filterable: false }),

  // C14 — Environmental & Regulatory
  def("epa_ghg_score", "C14", "EPA GHG Score", "/10", "integer", true, { filterable: false }),
  def("epa_smog_score", "C14", "EPA Smog Score", "/10", "integer", true, { filterable: false }),
  def("co2_g_per_mi", "C14", "CO₂", "g/mi", "integer", false, { filterable: false }),
  def("assembly_country", "C14", "Assembly Country", null, "text", null, { comparable: false }),

  // C15 — Availability & Market Context
  def("us_availability_status", "C15", "Availability", null, "enum", null, { comparable: false }),
  def("typical_lead_time_weeks", "C15", "Typical Lead Time", "wk", "integer", false, { filterable: false }),
];

const REGISTRY: Map<string, AttributeDef> = new Map(DEFS.map((d) => [d.key, d]));

export function allAttributes(): AttributeDef[] {
  return DEFS;
}

export function getAttribute(key: string): AttributeDef | undefined {
  return REGISTRY.get(key);
}

/** Attributes in a category, in registry declaration order. */
export function attributesInCategory(category: AttributeCategory): AttributeDef[] {
  return DEFS.filter((d) => d.category === category);
}

export function publicAttributes(): AttributeDef[] {
  return DEFS.filter((d) => d.public);
}

export function filterableAttributes(): AttributeDef[] {
  return DEFS.filter((d) => d.public && d.filterable);
}

export function comparableAttributes(): AttributeDef[] {
  return DEFS.filter((d) => d.public && d.comparable);
}
