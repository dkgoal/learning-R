import type { Source } from "@/domain/types";

// §5.2 data sources. Only free public APIs + BMW PressClub (attribution) and our
// own internal methodology are used in this seed. Licensed C8 sources are NOT
// present because their attributes are public:false in the registry (§14.1).
export const SOURCES: Record<string, Source> = {
  s_bmw_press: {
    id: "s_bmw_press",
    name: "BMW PressClub USA",
    url: "https://www.press.bmwgroup.com/usa",
    licenseNote: "Public press material, attribution required.",
    attributionRequired: true,
  },
  s_epa: {
    id: "s_epa",
    name: "EPA fueleconomy.gov",
    url: "https://www.fueleconomy.gov",
    licenseNote: "US Government public data.",
    attributionRequired: false,
  },
  s_nhtsa_safety: {
    id: "s_nhtsa_safety",
    name: "NHTSA Safety Ratings",
    url: "https://www.nhtsa.gov/ratings",
    attributionRequired: false,
  },
  s_nhtsa_recalls: {
    id: "s_nhtsa_recalls",
    name: "NHTSA Recalls & Complaints",
    url: "https://www.nhtsa.gov/recalls",
    attributionRequired: false,
  },
  s_iihs: {
    id: "s_iihs",
    name: "IIHS",
    url: "https://www.iihs.org",
    licenseNote: "Award status published; redistribution terms to confirm.",
    attributionRequired: true,
  },
  s_internal: {
    id: "s_internal",
    name: "BMW Car Explorer methodology",
    url: "/methodology",
    licenseNote: "Our own computed estimates and indices.",
    attributionRequired: false,
  },
};
