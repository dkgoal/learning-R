import { computeReliabilityIndex } from "@/domain/reliability";
import type {
  AttributeValue,
  Confidence,
  Vehicle,
  VehicleFeature,
} from "@/domain/types";

// -----------------------------------------------------------------------------
// Seed catalog. In production these rows come from the ETL pipeline (§5.2) and
// the admin CMS; here they are illustrative, hand-curated fixtures with proper
// source attribution and verification dates. Specs are representative of the
// US lineup and marked with the source they'd be verified against.
// -----------------------------------------------------------------------------

const VERIFIED = "2026-07-01";

type Spec = number | string | boolean;

// Which source each attribute key is verified against (§4: every field carries
// a source_id). Defaults to BMW PressClub for official specs.
const SOURCE_BY_KEY: Record<string, string> = {
  epa_city_mpg: "s_epa",
  epa_highway_mpg: "s_epa",
  epa_combined_mpg: "s_epa",
  mpge_combined: "s_epa",
  epa_range_mi: "s_epa",
  epa_ghg_score: "s_epa",
  epa_smog_score: "s_epa",
  co2_g_per_mi: "s_epa",
  nhtsa_overall_stars: "s_nhtsa_safety",
  iihs_award: "s_iihs",
  iihs_headlight_rating: "s_iihs",
  open_recall_count: "s_nhtsa_recalls",
  nhtsa_complaint_count: "s_nhtsa_recalls",
  reliability_index: "s_internal",
  total_cost_of_ownership_5yr: "s_internal",
  est_5yr_maintenance: "s_internal",
  est_5yr_fuel_or_energy: "s_internal",
  depreciation_5yr_pct: "s_internal",
  typical_lead_time_weeks: "s_internal",
};

function sourceFor(key: string): string {
  return SOURCE_BY_KEY[key] ?? "s_bmw_press";
}

function confidenceFor(key: string): Confidence {
  return sourceFor(key) === "s_internal" ? "estimated" : "high";
}

function toAttr(key: string, value: Spec): AttributeValue {
  const base = {
    key,
    sourceId: sourceFor(key),
    confidence: confidenceFor(key),
    lastVerifiedAt: VERIFIED,
  };
  if (typeof value === "number") return { ...base, num: value };
  if (typeof value === "boolean") return { ...base, bool: value };
  return { ...base, text: value };
}

function attrs(specs: Record<string, Spec>): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const [k, v] of Object.entries(specs)) out[k] = toAttr(k, v);
  return out;
}

function feat(
  key: string,
  name: string,
  availability: VehicleFeature["availability"],
  packageName?: string,
): VehicleFeature {
  return packageName ? { key, name, availability, packageName } : { key, name, availability };
}

// Common safety feature set for a modern (MY2025+) BMW.
function modernSafety(adaptiveStandard = false): VehicleFeature[] {
  return [
    feat("forward_collision_warning", "Forward Collision Warning", "standard"),
    feat("aeb", "Automatic Emergency Braking", "standard"),
    feat("lane_departure_warning", "Lane Departure Warning", "standard"),
    feat("blind_spot_detection", "Blind-Spot Detection", "standard"),
    feat(
      "adaptive_cruise_stop_go",
      "Adaptive Cruise (Stop & Go)",
      adaptiveStandard ? "standard" : "optional",
      adaptiveStandard ? undefined : "Driving Assistance Professional",
    ),
  ];
}

function techFeatures(premium: boolean): VehicleFeature[] {
  return [
    feat("wireless_carplay_feature", "Wireless Apple CarPlay", "standard"),
    feat("head_up_display_feature", "Head-Up Display", premium ? "standard" : "optional", premium ? undefined : "Premium Package"),
    feat("wireless_charging", "Wireless Device Charging", "standard"),
    feat("wifi_hotspot", "Wi-Fi Hotspot", "optional"),
    feat("digital_key_plus", "Digital Key Plus", premium ? "standard" : "optional", premium ? undefined : "Premium Package"),
  ];
}

interface Seed {
  id: number;
  familySlug: string;
  modelYear: number;
  trimName: string;
  slug: string;
  generationCode?: string;
  powertrainType: Vehicle["powertrainType"];
  drivetrain: Vehicle["drivetrain"];
  baseMsrpUsd: number;
  destinationUsd: number;
  availabilityStatus: Vehicle["availabilityStatus"];
  successorId?: number;
  predecessorId?: number;
  imageAlt: string;
  competitors?: string[];
  specs: Record<string, Spec>;
  features: VehicleFeature[];
}

// Injects reliability_index computed from public NHTSA inputs (R-01) if the
// row supplied recall/complaint counts and didn't hard-code the index.
function withReliability(specs: Record<string, Spec>): Record<string, Spec> {
  if (
    specs["reliability_index"] === undefined &&
    typeof specs["open_recall_count"] === "number" &&
    typeof specs["nhtsa_complaint_count"] === "number"
  ) {
    return {
      ...specs,
      reliability_index: computeReliabilityIndex({
        openRecallCount: specs["open_recall_count"],
        complaintCount: specs["nhtsa_complaint_count"],
      }),
    };
  }
  return specs;
}

const DEST = 1175;

const SEEDS: Seed[] = [
  {
    id: 1, familySlug: "3-series", modelYear: 2026, trimName: "330i", slug: "330i",
    generationCode: "G20", powertrainType: "ICE", drivetrain: "RWD",
    baseMsrpUsd: 45950, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW 330i sedan, three-quarter front view",
    competitors: ["Audi A4", "Mercedes-Benz C-Class", "Genesis G70"],
    specs: {
      body_style: "Sedan", segment: "Compact Executive", powertrain_type: "ICE",
      engine_code: "B48", horsepower_hp: 255, torque_lbft: 295, transmission: "8-speed automatic",
      zero_to_sixty_s: 5.6, top_speed_mph: 130, braking_60_0_ft: 118, lateral_g: 0.88,
      epa_city_mpg: 26, epa_highway_mpg: 36, epa_combined_mpg: 30, fuel_tank_gal: 15.6,
      length_in: 185.9, wheelbase_in: 112.2, curb_weight_lb: 3582, seating_capacity: 5,
      front_legroom_in: 42, cargo_behind_2nd_row_cuft: 17, max_cargo_cuft: 17,
      nhtsa_overall_stars: 5, iihs_award: "TSP+", iihs_headlight_rating: "Good",
      highway_assistant_hands_free: false, sae_autonomy_level: 2,
      basic_warranty_yr: 4, open_recall_count: 0, nhtsa_complaint_count: 12,
      idrive_version: "iDrive 8.5", center_display_in: 12.3, head_up_display: false,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: false, panoramic_roof: true, interior_noise_db_at_70mph: 68,
      suspension_type: "Independent, M Sport available", adaptive_m_suspension: false, drag_coefficient_cd: 0.26,
      total_cost_of_ownership_5yr: 52000, est_5yr_maintenance: 4200, est_5yr_fuel_or_energy: 9800, depreciation_5yr_pct: 52,
      epa_ghg_score: 6, epa_smog_score: 5, co2_g_per_mi: 296, assembly_country: "Germany",
      us_availability_status: "on_sale", typical_lead_time_weeks: 8,
    },
    features: [...modernSafety(true), ...techFeatures(false)],
  },
  {
    id: 2, familySlug: "3-series", modelYear: 2026, trimName: "M340i xDrive", slug: "m340i-xdrive",
    generationCode: "G20", powertrainType: "MHEV", drivetrain: "xDrive",
    baseMsrpUsd: 61300, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW M340i xDrive sedan, three-quarter front view",
    competitors: ["Audi S4", "Mercedes-AMG C 43", "Genesis G70 3.3T"],
    specs: {
      body_style: "Sedan", segment: "Compact Executive", powertrain_type: "MHEV",
      engine_code: "B58", horsepower_hp: 386, torque_lbft: 369, transmission: "8-speed automatic",
      zero_to_sixty_s: 4.2, top_speed_mph: 155, braking_60_0_ft: 108, lateral_g: 0.94,
      epa_city_mpg: 23, epa_highway_mpg: 32, epa_combined_mpg: 26, fuel_tank_gal: 15.6,
      length_in: 185.9, wheelbase_in: 112.2, curb_weight_lb: 3871, seating_capacity: 5,
      front_legroom_in: 42, cargo_behind_2nd_row_cuft: 17, max_cargo_cuft: 17,
      nhtsa_overall_stars: 5, iihs_award: "TSP+", iihs_headlight_rating: "Good",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, open_recall_count: 0, nhtsa_complaint_count: 9,
      idrive_version: "iDrive 8.5", center_display_in: 12.3, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 67,
      suspension_type: "Adaptive M Suspension", adaptive_m_suspension: true, drag_coefficient_cd: 0.27,
      total_cost_of_ownership_5yr: 66000, est_5yr_maintenance: 4600, est_5yr_fuel_or_energy: 11200, depreciation_5yr_pct: 54,
      epa_ghg_score: 5, epa_smog_score: 5, co2_g_per_mi: 342, assembly_country: "Germany",
      us_availability_status: "on_sale", typical_lead_time_weeks: 10,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 3, familySlug: "3-series", modelYear: 2025, trimName: "330e xDrive", slug: "330e-xdrive",
    generationCode: "G20", powertrainType: "PHEV", drivetrain: "xDrive",
    baseMsrpUsd: 53700, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2025 BMW 330e xDrive plug-in hybrid sedan",
    competitors: ["Audi A4 (PHEV markets)", "Mercedes-Benz C 350e"],
    specs: {
      body_style: "Sedan", segment: "Compact Executive", powertrain_type: "PHEV",
      engine_code: "B48 + electric", horsepower_hp: 288, torque_lbft: 310, combined_system_output: 288, transmission: "8-speed automatic",
      zero_to_sixty_s: 5.6, top_speed_mph: 130, lateral_g: 0.86,
      epa_combined_mpg: 28, mpge_combined: 67, epa_range_mi: 320, fuel_tank_gal: 10.6,
      battery_capacity_kwh: 12, ev_incentive_eligibility: false,
      length_in: 185.9, wheelbase_in: 112.2, curb_weight_lb: 4090, seating_capacity: 5,
      front_legroom_in: 42, cargo_behind_2nd_row_cuft: 13, max_cargo_cuft: 13,
      nhtsa_overall_stars: 5, iihs_award: "TSP+", iihs_headlight_rating: "Good",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, ev_battery_warranty_yr: 8, open_recall_count: 1, nhtsa_complaint_count: 7,
      idrive_version: "iDrive 8.5", center_display_in: 12.3, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: false, panoramic_roof: true, interior_noise_db_at_70mph: 67,
      suspension_type: "Independent", adaptive_m_suspension: false, drag_coefficient_cd: 0.26,
      total_cost_of_ownership_5yr: 55000, est_5yr_maintenance: 4300, est_5yr_fuel_or_energy: 7200, depreciation_5yr_pct: 55,
      epa_ghg_score: 8, epa_smog_score: 6, co2_g_per_mi: 180, assembly_country: "Germany",
      us_availability_status: "on_sale", typical_lead_time_weeks: 12,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 4, familySlug: "i4", modelYear: 2026, trimName: "eDrive40", slug: "edrive40",
    generationCode: "G26", powertrainType: "BEV", drivetrain: "RWD",
    baseMsrpUsd: 57900, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW i4 eDrive40 gran coupe, electric",
    competitors: ["Tesla Model 3", "Polestar 2", "Genesis Electrified G70"],
    specs: {
      body_style: "Gran Coupe", segment: "Compact Executive EV", powertrain_type: "BEV",
      horsepower_hp: 335, torque_lbft: 317, motor_count: 1, combined_system_output: 335, transmission: "Single-speed",
      zero_to_sixty_s: 5.4, top_speed_mph: 118, lateral_g: 0.86,
      mpge_combined: 105, epa_range_mi: 318, battery_capacity_kwh: 81,
      dc_fast_charge_peak_kw: 205, charge_10_80_min: 31, charge_port_standard: "NACS (2026)",
      ev_incentive_eligibility: false,
      length_in: 188.5, wheelbase_in: 112.4, curb_weight_lb: 4780, seating_capacity: 5,
      front_legroom_in: 41.6, cargo_behind_2nd_row_cuft: 10, max_cargo_cuft: 45, frunk_cuft: 0,
      nhtsa_overall_stars: 5, iihs_award: "TSP", iihs_headlight_rating: "Acceptable",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, ev_battery_warranty_yr: 8, open_recall_count: 0, nhtsa_complaint_count: 5,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: false, panoramic_roof: true, interior_noise_db_at_70mph: 64,
      suspension_type: "Adaptive M available", adaptive_m_suspension: false, drag_coefficient_cd: 0.24,
      total_cost_of_ownership_5yr: 51000, est_5yr_maintenance: 3200, est_5yr_fuel_or_energy: 5200, depreciation_5yr_pct: 58,
      epa_ghg_score: 10, epa_smog_score: 10, co2_g_per_mi: 0, assembly_country: "Germany",
      us_availability_status: "on_sale", typical_lead_time_weeks: 9,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 5, familySlug: "i5", modelYear: 2026, trimName: "eDrive40", slug: "edrive40",
    generationCode: "G60", powertrainType: "BEV", drivetrain: "RWD",
    baseMsrpUsd: 67300, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW i5 eDrive40 electric sedan",
    competitors: ["Mercedes-Benz EQE", "Tesla Model S", "Audi A6 e-tron"],
    specs: {
      body_style: "Sedan", segment: "Executive EV", powertrain_type: "BEV",
      horsepower_hp: 335, torque_lbft: 295, motor_count: 1, combined_system_output: 335, transmission: "Single-speed",
      zero_to_sixty_s: 5.7, top_speed_mph: 120, lateral_g: 0.85,
      mpge_combined: 96, epa_range_mi: 295, battery_capacity_kwh: 81,
      dc_fast_charge_peak_kw: 205, charge_10_80_min: 30, charge_port_standard: "NACS (2026)",
      ev_incentive_eligibility: false,
      length_in: 199.2, wheelbase_in: 118.1, curb_weight_lb: 4916, seating_capacity: 5,
      front_legroom_in: 41.4, cargo_behind_2nd_row_cuft: 17.3, max_cargo_cuft: 17.3,
      nhtsa_overall_stars: 5, iihs_award: "TSP+", iihs_headlight_rating: "Good",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, ev_battery_warranty_yr: 8, open_recall_count: 0, nhtsa_complaint_count: 4,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 62,
      suspension_type: "Adaptive available", adaptive_m_suspension: false, drag_coefficient_cd: 0.23,
      total_cost_of_ownership_5yr: 60000, est_5yr_maintenance: 3400, est_5yr_fuel_or_energy: 5600, depreciation_5yr_pct: 57,
      epa_ghg_score: 10, epa_smog_score: 10, co2_g_per_mi: 0, assembly_country: "Germany",
      us_availability_status: "on_sale", typical_lead_time_weeks: 11,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 6, familySlug: "5-series", modelYear: 2026, trimName: "530i xDrive", slug: "530i-xdrive",
    generationCode: "G60", powertrainType: "MHEV", drivetrain: "xDrive",
    baseMsrpUsd: 61600, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW 530i xDrive sedan",
    competitors: ["Mercedes-Benz E-Class", "Audi A6", "Genesis G80"],
    specs: {
      body_style: "Sedan", segment: "Executive", powertrain_type: "MHEV",
      engine_code: "B48", horsepower_hp: 255, torque_lbft: 295, transmission: "8-speed automatic",
      zero_to_sixty_s: 5.9, top_speed_mph: 130, lateral_g: 0.85,
      epa_city_mpg: 25, epa_highway_mpg: 32, epa_combined_mpg: 28, fuel_tank_gal: 16.1,
      length_in: 199.2, wheelbase_in: 118.1, curb_weight_lb: 4145, seating_capacity: 5,
      front_legroom_in: 41.4, cargo_behind_2nd_row_cuft: 18.4, max_cargo_cuft: 18.4,
      nhtsa_overall_stars: 5, iihs_award: "TSP+", iihs_headlight_rating: "Good",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, open_recall_count: 0, nhtsa_complaint_count: 6,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 64,
      suspension_type: "Adaptive available", adaptive_m_suspension: false, drag_coefficient_cd: 0.24,
      total_cost_of_ownership_5yr: 64000, est_5yr_maintenance: 4400, est_5yr_fuel_or_energy: 10400, depreciation_5yr_pct: 55,
      epa_ghg_score: 6, epa_smog_score: 5, co2_g_per_mi: 316, assembly_country: "Germany",
      us_availability_status: "on_sale", typical_lead_time_weeks: 10,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 7, familySlug: "x3", modelYear: 2026, trimName: "xDrive30", slug: "xdrive30",
    generationCode: "G45", powertrainType: "MHEV", drivetrain: "xDrive",
    baseMsrpUsd: 50675, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW X3 xDrive30 SAV",
    competitors: ["Audi Q5", "Mercedes-Benz GLC", "Genesis GV70"],
    specs: {
      body_style: "SAV", segment: "Compact Luxury SUV", powertrain_type: "MHEV",
      engine_code: "B48", horsepower_hp: 255, torque_lbft: 295, transmission: "8-speed automatic",
      zero_to_sixty_s: 6.0, top_speed_mph: 130, lateral_g: 0.84,
      epa_city_mpg: 24, epa_highway_mpg: 31, epa_combined_mpg: 27, fuel_tank_gal: 17.2,
      length_in: 187.2, wheelbase_in: 112.8, ground_clearance_in: 8.0, curb_weight_lb: 4123, seating_capacity: 5,
      front_legroom_in: 40.3, cargo_behind_2nd_row_cuft: 31, max_cargo_cuft: 57.8, max_towing_lb: 4400,
      nhtsa_overall_stars: 5, iihs_award: "TSP+", iihs_headlight_rating: "Good",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, open_recall_count: 0, nhtsa_complaint_count: 8,
      idrive_version: "iDrive 9", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 66,
      suspension_type: "Adaptive available", adaptive_m_suspension: false, drag_coefficient_cd: 0.27,
      total_cost_of_ownership_5yr: 56000, est_5yr_maintenance: 4500, est_5yr_fuel_or_energy: 10600, depreciation_5yr_pct: 53,
      epa_ghg_score: 6, epa_smog_score: 5, co2_g_per_mi: 328, assembly_country: "United States",
      us_availability_status: "on_sale", typical_lead_time_weeks: 8,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 8, familySlug: "x5", modelYear: 2026, trimName: "xDrive40i", slug: "xdrive40i",
    generationCode: "G05", powertrainType: "MHEV", drivetrain: "xDrive",
    baseMsrpUsd: 66200, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW X5 xDrive40i SAV",
    competitors: ["Mercedes-Benz GLE", "Audi Q7", "Genesis GV80"],
    specs: {
      body_style: "SAV", segment: "Mid-size Luxury SUV", powertrain_type: "MHEV",
      engine_code: "B58", horsepower_hp: 375, torque_lbft: 383, transmission: "8-speed automatic",
      zero_to_sixty_s: 5.2, top_speed_mph: 130, lateral_g: 0.83,
      epa_city_mpg: 21, epa_highway_mpg: 26, epa_combined_mpg: 23, fuel_tank_gal: 21.9,
      length_in: 194.3, wheelbase_in: 117.1, ground_clearance_in: 8.7, curb_weight_lb: 4828, seating_capacity: 5,
      front_legroom_in: 39.8, cargo_behind_2nd_row_cuft: 33.9, max_cargo_cuft: 72.3, max_towing_lb: 7200,
      nhtsa_overall_stars: 5, iihs_award: "TSP", iihs_headlight_rating: "Acceptable",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, open_recall_count: 1, nhtsa_complaint_count: 14,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 65,
      suspension_type: "Adaptive; air available", adaptive_m_suspension: false, air_suspension: true, drag_coefficient_cd: 0.32,
      total_cost_of_ownership_5yr: 71000, est_5yr_maintenance: 5200, est_5yr_fuel_or_energy: 13000, depreciation_5yr_pct: 54,
      epa_ghg_score: 4, epa_smog_score: 5, co2_g_per_mi: 386, assembly_country: "United States",
      us_availability_status: "on_sale", typical_lead_time_weeks: 12,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 9, familySlug: "x5", modelYear: 2026, trimName: "xDrive50e", slug: "xdrive50e",
    generationCode: "G05", powertrainType: "PHEV", drivetrain: "xDrive",
    baseMsrpUsd: 74500, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW X5 xDrive50e plug-in hybrid SAV",
    competitors: ["Mercedes-Benz GLE 450e", "Audi Q7 55 TFSI e", "Volvo XC90 Recharge"],
    specs: {
      body_style: "SAV", segment: "Mid-size Luxury SUV", powertrain_type: "PHEV",
      engine_code: "B58 + electric", horsepower_hp: 483, torque_lbft: 516, combined_system_output: 483, transmission: "8-speed automatic",
      zero_to_sixty_s: 4.6, top_speed_mph: 130, lateral_g: 0.82,
      epa_combined_mpg: 22, mpge_combined: 57, epa_range_mi: 400, electric_only_range_mi: 40,
      battery_capacity_kwh: 25.7, fuel_tank_gal: 18.2, ev_incentive_eligibility: false,
      length_in: 194.3, wheelbase_in: 117.1, ground_clearance_in: 8.7, curb_weight_lb: 5672, seating_capacity: 5,
      front_legroom_in: 39.8, cargo_behind_2nd_row_cuft: 31, max_cargo_cuft: 65, max_towing_lb: 5952,
      nhtsa_overall_stars: 5, iihs_award: "TSP", iihs_headlight_rating: "Acceptable",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, ev_battery_warranty_yr: 8, open_recall_count: 1, nhtsa_complaint_count: 10,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 64,
      suspension_type: "Air suspension", adaptive_m_suspension: false, air_suspension: true, drag_coefficient_cd: 0.32,
      total_cost_of_ownership_5yr: 76000, est_5yr_maintenance: 5000, est_5yr_fuel_or_energy: 9000, depreciation_5yr_pct: 56,
      epa_ghg_score: 7, epa_smog_score: 5, co2_g_per_mi: 210, assembly_country: "United States",
      us_availability_status: "on_sale", typical_lead_time_weeks: 14,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 10, familySlug: "ix", modelYear: 2026, trimName: "xDrive50", slug: "xdrive50",
    generationCode: "I20", powertrainType: "BEV", drivetrain: "xDrive",
    baseMsrpUsd: 87250, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW iX xDrive50 electric SAV",
    competitors: ["Mercedes-Benz EQE SUV", "Audi Q8 e-tron", "Rivian R1S"],
    specs: {
      body_style: "SAV", segment: "Mid-size Luxury EV SUV", powertrain_type: "BEV",
      horsepower_hp: 516, torque_lbft: 564, motor_count: 2, combined_system_output: 516, transmission: "Single-speed",
      zero_to_sixty_s: 4.4, top_speed_mph: 124, lateral_g: 0.82,
      mpge_combined: 86, epa_range_mi: 340, battery_capacity_kwh: 111.5,
      dc_fast_charge_peak_kw: 195, charge_10_80_min: 35, charge_port_standard: "NACS (2026)",
      ev_incentive_eligibility: false,
      length_in: 195.0, wheelbase_in: 118.1, ground_clearance_in: 8.0, curb_weight_lb: 5769, seating_capacity: 5,
      front_legroom_in: 39.8, cargo_behind_2nd_row_cuft: 35.5, max_cargo_cuft: 77.9, frunk_cuft: 0,
      nhtsa_overall_stars: 5, iihs_award: "TSP+", iihs_headlight_rating: "Good",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, ev_battery_warranty_yr: 8, open_recall_count: 0, nhtsa_complaint_count: 6,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 61,
      suspension_type: "Air suspension", adaptive_m_suspension: false, air_suspension: true, drag_coefficient_cd: 0.25,
      total_cost_of_ownership_5yr: 82000, est_5yr_maintenance: 3600, est_5yr_fuel_or_energy: 6200, depreciation_5yr_pct: 60,
      epa_ghg_score: 10, epa_smog_score: 10, co2_g_per_mi: 0, assembly_country: "Germany",
      us_availability_status: "on_sale", typical_lead_time_weeks: 12,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 11, familySlug: "x7", modelYear: 2026, trimName: "xDrive40i", slug: "xdrive40i",
    generationCode: "G07", powertrainType: "MHEV", drivetrain: "xDrive",
    baseMsrpUsd: 84800, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW X7 xDrive40i full-size SAV",
    competitors: ["Mercedes-Benz GLS", "Audi Q7/Q8", "Cadillac Escalade"],
    specs: {
      body_style: "SAV", segment: "Full-size Luxury SUV", powertrain_type: "MHEV",
      engine_code: "B58", horsepower_hp: 375, torque_lbft: 383, transmission: "8-speed automatic",
      zero_to_sixty_s: 5.6, top_speed_mph: 130, lateral_g: 0.79,
      epa_city_mpg: 20, epa_highway_mpg: 25, epa_combined_mpg: 22, fuel_tank_gal: 21.9,
      length_in: 203.6, wheelbase_in: 122.2, ground_clearance_in: 8.7, curb_weight_lb: 5620, seating_capacity: 7,
      front_legroom_in: 39.8, cargo_behind_2nd_row_cuft: 48.6, cargo_behind_3rd_row_cuft: 12.8, max_cargo_cuft: 90.4, max_towing_lb: 7500,
      nhtsa_overall_stars: 5, iihs_award: "TSP", iihs_headlight_rating: "Acceptable",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, open_recall_count: 0, nhtsa_complaint_count: 7,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 63,
      suspension_type: "Air suspension", adaptive_m_suspension: false, air_suspension: true, drag_coefficient_cd: 0.33,
      total_cost_of_ownership_5yr: 90000, est_5yr_maintenance: 5600, est_5yr_fuel_or_energy: 13600, depreciation_5yr_pct: 55,
      epa_ghg_score: 4, epa_smog_score: 5, co2_g_per_mi: 404, assembly_country: "United States",
      us_availability_status: "on_sale", typical_lead_time_weeks: 14,
    },
    features: [...modernSafety(true), ...techFeatures(true)],
  },
  {
    id: 12, familySlug: "m3", modelYear: 2026, trimName: "Competition xDrive", slug: "competition-xdrive",
    generationCode: "G80", powertrainType: "ICE", drivetrain: "xDrive",
    baseMsrpUsd: 84000, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2026 BMW M3 Competition xDrive sedan",
    competitors: ["Mercedes-AMG C 63", "Audi RS 5", "Cadillac CT4-V Blackwing"],
    specs: {
      body_style: "Sedan", segment: "High-Performance Sedan", powertrain_type: "ICE",
      engine_code: "S58", horsepower_hp: 523, torque_lbft: 479, transmission: "8-speed M Steptronic",
      zero_to_sixty_s: 3.4, top_speed_mph: 180, braking_60_0_ft: 102, lateral_g: 1.02,
      epa_city_mpg: 16, epa_highway_mpg: 22, epa_combined_mpg: 18, fuel_tank_gal: 15.6,
      length_in: 189.1, wheelbase_in: 112.5, curb_weight_lb: 3990, seating_capacity: 5,
      front_legroom_in: 41.9, cargo_behind_2nd_row_cuft: 13, max_cargo_cuft: 13,
      nhtsa_overall_stars: 5, iihs_award: "TSP", iihs_headlight_rating: "Acceptable",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, open_recall_count: 0, nhtsa_complaint_count: 5,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 70,
      suspension_type: "Adaptive M Suspension", adaptive_m_suspension: true, drag_coefficient_cd: 0.34,
      total_cost_of_ownership_5yr: 92000, est_5yr_maintenance: 6200, est_5yr_fuel_or_energy: 16800, depreciation_5yr_pct: 50,
      epa_ghg_score: 3, epa_smog_score: 5, co2_g_per_mi: 494, assembly_country: "Germany",
      us_availability_status: "on_sale", typical_lead_time_weeks: 16,
    },
    features: [...modernSafety(false), ...techFeatures(true)],
  },
  {
    id: 13, familySlug: "m5", modelYear: 2025, trimName: "Sedan", slug: "sedan",
    generationCode: "G90", powertrainType: "PHEV", drivetrain: "xDrive",
    baseMsrpUsd: 119500, destinationUsd: DEST, availabilityStatus: "on_sale",
    imageAlt: "2025 BMW M5 plug-in hybrid sedan",
    competitors: ["Mercedes-AMG E 63", "Audi RS 7", "Porsche Panamera"],
    specs: {
      body_style: "Sedan", segment: "High-Performance Sedan", powertrain_type: "PHEV",
      engine_code: "S68 + electric", horsepower_hp: 717, torque_lbft: 738, combined_system_output: 717, transmission: "8-speed M Steptronic",
      zero_to_sixty_s: 3.4, top_speed_mph: 190, braking_60_0_ft: 104, lateral_g: 0.98,
      epa_combined_mpg: 20, mpge_combined: 48, epa_range_mi: 320, electric_only_range_mi: 25,
      battery_capacity_kwh: 18.6, fuel_tank_gal: 16.6, ev_incentive_eligibility: false,
      length_in: 200.8, wheelbase_in: 117.9, curb_weight_lb: 5390, seating_capacity: 5,
      front_legroom_in: 41.4, cargo_behind_2nd_row_cuft: 15.2, max_cargo_cuft: 15.2,
      nhtsa_overall_stars: 5, iihs_award: "TSP", iihs_headlight_rating: "Acceptable",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, ev_battery_warranty_yr: 8, open_recall_count: 0, nhtsa_complaint_count: 3,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 68,
      suspension_type: "Adaptive M Suspension", adaptive_m_suspension: true, air_suspension: false, drag_coefficient_cd: 0.30,
      total_cost_of_ownership_5yr: 128000, est_5yr_maintenance: 7000, est_5yr_fuel_or_energy: 14000, depreciation_5yr_pct: 52,
      epa_ghg_score: 5, epa_smog_score: 5, co2_g_per_mi: 300, assembly_country: "Germany",
      us_availability_status: "on_sale", typical_lead_time_weeks: 20,
    },
    features: [...modernSafety(false), ...techFeatures(true)],
  },
  {
    id: 14, familySlug: "xm", modelYear: 2025, trimName: "Base", slug: "base",
    generationCode: "G09", powertrainType: "PHEV", drivetrain: "xDrive",
    baseMsrpUsd: 159000, destinationUsd: DEST, availabilityStatus: "order_only",
    imageAlt: "2025 BMW XM high-performance plug-in hybrid SAV",
    competitors: ["Lamborghini Urus", "Aston Martin DBX", "Range Rover Sport SV"],
    specs: {
      body_style: "SAV", segment: "High-Performance SUV", powertrain_type: "PHEV",
      engine_code: "S68 + electric", horsepower_hp: 644, torque_lbft: 590, combined_system_output: 644, transmission: "8-speed M Steptronic",
      zero_to_sixty_s: 4.1, top_speed_mph: 155, lateral_g: 0.90,
      epa_combined_mpg: 18, mpge_combined: 46, epa_range_mi: 300, electric_only_range_mi: 30,
      battery_capacity_kwh: 25.7, fuel_tank_gal: 18.7, ev_incentive_eligibility: false,
      length_in: 201.2, wheelbase_in: 122.2, ground_clearance_in: 8.0, curb_weight_lb: 6062, seating_capacity: 5,
      front_legroom_in: 39.4, cargo_behind_2nd_row_cuft: 18.6, max_cargo_cuft: 57.6, max_towing_lb: 5952,
      nhtsa_overall_stars: 5, iihs_award: "none", iihs_headlight_rating: "Acceptable",
      highway_assistant_hands_free: true, sae_autonomy_level: 2,
      basic_warranty_yr: 4, ev_battery_warranty_yr: 8, open_recall_count: 0, nhtsa_complaint_count: 4,
      idrive_version: "iDrive 8.5", center_display_in: 14.9, head_up_display: true,
      wireless_carplay: true, ota_update_capability: true,
      ventilated_seats: true, panoramic_roof: true, interior_noise_db_at_70mph: 67,
      suspension_type: "Adaptive M + air", adaptive_m_suspension: true, air_suspension: true, drag_coefficient_cd: 0.35,
      total_cost_of_ownership_5yr: 175000, est_5yr_maintenance: 7800, est_5yr_fuel_or_energy: 15600, depreciation_5yr_pct: 58,
      epa_ghg_score: 5, epa_smog_score: 5, co2_g_per_mi: 320, assembly_country: "United States",
      us_availability_status: "order_only", typical_lead_time_weeks: 24,
    },
    features: [...modernSafety(false), ...techFeatures(true)],
  },
  {
    id: 15, familySlug: "z4", modelYear: 2025, trimName: "sDrive30i", slug: "sdrive30i",
    generationCode: "G29", powertrainType: "ICE", drivetrain: "RWD",
    baseMsrpUsd: 53900, destinationUsd: DEST, availabilityStatus: "discontinued",
    predecessorId: undefined,
    imageAlt: "2025 BMW Z4 sDrive30i roadster (final model year)",
    competitors: ["Porsche 718 Boxster", "Mercedes-Benz SL", "Toyota GR Supra"],
    specs: {
      body_style: "Roadster", segment: "Roadster", powertrain_type: "ICE",
      engine_code: "B48", horsepower_hp: 255, torque_lbft: 295, transmission: "8-speed automatic",
      zero_to_sixty_s: 5.2, top_speed_mph: 155, braking_60_0_ft: 112, lateral_g: 0.92,
      epa_city_mpg: 25, epa_highway_mpg: 32, epa_combined_mpg: 28, fuel_tank_gal: 14.5,
      length_in: 170.7, wheelbase_in: 97.2, curb_weight_lb: 3287, seating_capacity: 2,
      front_legroom_in: 42.2, cargo_behind_2nd_row_cuft: 9.9, max_cargo_cuft: 9.9,
      nhtsa_overall_stars: 5, iihs_award: "none", iihs_headlight_rating: "Acceptable",
      highway_assistant_hands_free: false, sae_autonomy_level: 2,
      basic_warranty_yr: 4, open_recall_count: 0, nhtsa_complaint_count: 6,
      idrive_version: "iDrive 7", center_display_in: 10.25, head_up_display: false,
      wireless_carplay: true, ota_update_capability: false,
      ventilated_seats: false, panoramic_roof: false, interior_noise_db_at_70mph: 72,
      suspension_type: "Sport suspension", adaptive_m_suspension: false, drag_coefficient_cd: 0.34,
      total_cost_of_ownership_5yr: 58000, est_5yr_maintenance: 4600, est_5yr_fuel_or_energy: 10200, depreciation_5yr_pct: 56,
      epa_ghg_score: 6, epa_smog_score: 5, co2_g_per_mi: 316, assembly_country: "Austria",
      us_availability_status: "discontinued", typical_lead_time_weeks: 0,
    },
    features: [...modernSafety(false), ...techFeatures(false)],
  },
];

export const CATALOG_VERSION = 1;

export const VEHICLES: Vehicle[] = SEEDS.map((s) => {
  const { specs, ...rest } = s;
  const vehicle: Vehicle = {
    ...rest,
    attributes: attrs(withReliability(specs)),
  };
  return vehicle;
});

const BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));

export function allVehicles(): Vehicle[] {
  return VEHICLES;
}

export function getVehicleById(id: number): Vehicle | undefined {
  return BY_ID.get(id);
}

export function getVehicle(
  familySlug: string,
  modelYear: number,
  trimSlug: string,
): Vehicle | undefined {
  return VEHICLES.find(
    (v) =>
      v.familySlug === familySlug &&
      v.modelYear === modelYear &&
      v.slug === trimSlug,
  );
}

export function vehiclesInFamily(familySlug: string): Vehicle[] {
  return VEHICLES.filter((v) => v.familySlug === familySlug);
}

export { getFamily } from "./families";
