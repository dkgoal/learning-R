# BMW Car Explorer (Web)

A free, publicly-accessible, mobile-first web app to **research, compare, and
choose a BMW** sold new in the United States. Implements the core product
surfaces of the v2.0 web spec: **Browse & Learn**, **Compare**, and **Find**,
built on a central attribute registry and pure, testable domain logic.

> **Independent — not affiliated with, sponsored by, or endorsed by BMW AG or
> BMW of North America.** BMW and model names are trademarks of their owner,
> used nominatively for accurate reference. Specs and pricing are subject to
> change; confirm with a dealer.

---

## Quick start

```bash
cd bmw-car-explorer
npm install
npm run dev          # http://localhost:3000

npm run typecheck    # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm test             # vitest — 72 domain tests
npm run test:coverage
npm run build        # next build (prerenders 54 routes)
```

Set `NEXT_PUBLIC_SITE_URL` for correct canonical / sitemap URLs per environment.

---

## What's implemented

This build delivers the product engineering the spec calls *"the easy part"* —
a runnable, tested slice of the three surfaces — with the licensing, SEO, and
accessibility guardrails wired in.

### The three surfaces
- **Browse** (`/bmw`) — faceted, query-string-driven filtering (FR-105) that
  works with JavaScript disabled (a plain GET form), sortable, crawlable
  pagination (FR-107), empty-state relaxation (FR-106).
- **Detail** (`/bmw/[family]/[year]/[trim]`) — the primary SEO asset. All 15
  category sections render server-side even when collapsed (FR-201), price
  ladder, per-value source + confidence affordances (FR-203), recalls (FR-206),
  lifecycle banner (FR-207), similar-BMW internal links (FR-205), and
  `Vehicle`+`Product`+`Offer`+`BreadcrumbList` JSON-LD (SEO-03/05).
- **Compare** (`/compare`, `/compare/[slug]`) — 2–4 way grid grouped by the 15
  categories with best-in-row highlighting (FR-303), delta mode (FR-304),
  differences-only (FR-305), a relative spec radar (FR-308), canonical
  alphabetical slugs with 301 redirects (SEO-01), curated-only indexing
  (SEO-02), CSV export (FR-309), server-rendered for crawlers/no-JS (FR-311).
- **Find** (`/finder`) — an explainable wizard. Two-stage scoring (hard filters
  then weighted rank), candidate-set-relative min-max normalization, median
  imputation with partial flags (FR-404), budget soft-penalty (FR-405),
  mandatory per-result breakdown (FR-407), and **live in-browser re-ranking**
  running the *same* `/domain` scorer (FR-408). Deterministic with explicit
  tie-breaks (FR-410) and a non-advice disclaimer (FR-411).

### Cross-cutting guardrails
- **Attribute registry** (`domain/attribute-registry.ts`) — single source of
  truth for all attribute metadata (AC-01). UI, comparison, filtering, scoring,
  and JSON-LD all read from it.
- **Licensing kill switch** — licensed C8 ratings (JD Power / CR / Edmunds) are
  registered `public: false` and stripped at the serialization boundary
  (AC-02 / AR-03 / §14.1). A transparent, self-computed **Reliability Index**
  from public NHTSA data substitutes for them (R-01).
- **Pure domain layer** (`/domain`) — no DB/DOM/network, so it runs identically
  on server and client and is unit-testable in isolation (AR-02). No magic
  numbers: weights, bounds, and epsilons live in `domain/config/*` (§9).
- **SEO** — sitemap, robots, canonical tags, per-page metadata + OpenGraph.
- **Accessibility** — semantic HTML, skip link, visible focus, keyboard-operable
  controls, and full function without JavaScript (NFR-10/11).
- **Legal pages** — privacy (CPRA/CCPA), terms + disclaimers, accessibility
  statement, data sources, methodology (NFR-18, §14.6).

### Architecture

```
app/                Next.js 15 App Router (Server Components by default)
  bmw/…             browse, family, model-year, trim detail (ISR/SSG)
  compare/…         builder + SSR comparison + CSV route handler
  finder/           CSR wizard shell over the shared scorer
  {legal,seo}       methodology, sources, privacy, terms, sitemap, robots
domain/             PURE, side-effect-free TS (unit-tested, AR-02)
  attribute-registry · units · comparison · finder · filters · reliability
  config/           weights, bounds, epsilons (no magic numbers, §9)
data/               seed catalog (stands in for the ETL + Postgres, AR-01)
components/         server + "use client" UI (each client use justified)
lib/                web-layer glue: query parsing, public serialization, format
test/               vitest — 72 tests incl. determinism + golden snapshot
```

---

## Deliberately out of scope (from the full P0–P6 program)

The spec is a full production program; this repository is the application core.
The following are **process/infrastructure**, not application code, and are
stubbed or omitted with the intent documented in-code:

- **§14 legal clearance** (the real critical path) — content licensing sign-off,
  trademark counsel review, scraping ToS, privacy program, third-party a11y
  audit. Legal pages here are clearly-marked templates.
- **ETL pipeline & admin CMS** (P1) — `data/catalog.ts` is a hand-curated seed
  standing in for the containerized `fetch→normalize→validate→upsert` adapters,
  staging schema, publish gates (DI-03), diff review, and versioned rollback.
- **Postgres + Redis + S3/CDN infra** (§5/§6) — the data-access boundary
  (`lib/catalog-view.ts`) is shaped so the seed can be swapped for Drizzle
  repositories against a read-only catalog role without touching the UI.
- **Accounts & server sync** (FR-500) — anonymous-first favorites/compare tray
  persist in localStorage today; Auth.js sync + data export/erasure are stubbed.
- **Dynamic OG images, k6 load tests, pentest, on-call/SLO** (P6).

## Data disclaimer

Seed specifications are representative, hand-curated fixtures with source
attribution and verification dates for demonstration — not a maintained,
authoritative dataset. In production these come from the ETL pipeline and are
verified against the cited public sources.
