// Site-wide configuration. Base URL is env-driven so preview/staging/prod
// (NFR-15) each generate correct canonical + sitemap URLs.
export const SITE = {
  name: "BMW Car Explorer",
  // Independent research tool — deliberately generic, no BMW marks in the name.
  tagline: "Independent research, comparison & finder for the US BMW lineup",
  baseUrl:
    process.env["NEXT_PUBLIC_SITE_URL"]?.replace(/\/$/, "") ??
    "https://example.com",
  // R-02: prominent, non-negotiable non-affiliation disclaimer.
  disclaimer:
    "Independent and not affiliated with, sponsored by, or endorsed by BMW AG or BMW of North America. BMW and model names are trademarks of their respective owner, used here nominatively for accurate reference. Specifications and pricing are subject to change — confirm details with an authorized dealer.",
} as const;

export function absoluteUrl(path: string): string {
  return `${SITE.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
