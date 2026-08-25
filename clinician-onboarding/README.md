# Clinician Onboarding Platform

End-to-end onboarding of physicians and advanced practice providers, built from
`clinicianonboardingrequirements.md`.

The requirements document's core premise is that employment onboarding, payor
enrollment and medical staff privileging share roughly 70% of the same data and
documents but collect it three times. This build takes that premise literally:
one golden practitioner record, one verification set, and one timeline in which
the payor track and the privileging track run in parallel off a shared
verification layer — with their dependencies made visible rather than discovered.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 198 domain and integration tests
npm run typecheck
npm run build
```

## Hosting

Every page prerenders at build time — no API routes, no server actions, no
runtime data reads — so `npm run build` emits a folder of plain HTML in `out/`
(20 pages, ~4.6 MB) that any static host will serve. There is no server to run
and nothing to pay for.

**GitHub Pages** (already wired up). `.github/workflows/deploy-clinician-onboarding.yml`
builds, typechecks, tests and publishes on every push. Enable it once under
**Settings → Pages → Source → GitHub Actions**; the site then lands at
`https://<user>.github.io/<repo>/`. The workflow sets `NEXT_PUBLIC_BASE_PATH`
because Pages serves project sites from a subpath.

**Vercel / Netlify / Cloudflare Pages.** Point at this repo, set the root
directory to `clinician-onboarding`, and accept the detected defaults. Leave
`NEXT_PUBLIC_BASE_PATH` unset — these serve from the domain root.

**Anywhere else** — S3, nginx, a shared drive:

```bash
npm run build && npx serve out    # or copy out/ wherever you like
```

Not Google Colab: it is an ephemeral Python notebook runtime, so hosting a web
app there means installing Node, running a server in a cell and tunnelling it
out, and it all disappears when the runtime disconnects.

## What is here

Next.js 15 (App Router, React 19, TypeScript, Tailwind), fully statically
rendered with no client-side JavaScript beyond the framework runtime. The
interesting code is in `domain/` — pure, dependency-free, and tested to ~99%
statement coverage. The pages are thin readers of what those engines compute.

| Screen | What it shows |
|---|---|
| `/` | Portfolio dashboard: cases, start-date and revenue risk, expirables horizon, queue aging |
| `/cases/[id]` | One case end to end — timeline, application, PSV, payors, privileges, billing, gates, work |
| `/portal/[id]` | The clinician's own view: progress, pre-filled data, what is still needed |
| `/verifications` | Adjudication queue, PSV work queue, monthly exclusion screening, the §6 matrix |
| `/payors` | Enrollment tracker, derived requirements and blockers, delegated roster + reconciliation, benchmarking |
| `/privileges` | Unsupported privilege requests, approval chain, FPPE/OPPE, DOP library |
| `/billing` | First billable date per payor/TIN/location, held claims, revenue at risk |
| `/expirables` | Horizon, active suspensions, renewal ladder, cycle reconciliation |
| `/reports` | Time to first billable decomposed, bottleneck attribution, audit readiness |
| `/admin` | Tenant configuration, scope-of-practice rules, gating rules, milestone graph, field-level RBAC |
| `/audit` | Hash-chained log, sensitive-read register, point-in-time file reconstruction |

## Domain modules

| Module | Requirement | What it decides |
|---|---|---|
| `timeline.ts` | §4.1 | Backward-plans from the start date; two-pass critical path; start-date and revenue risk |
| `milestones.ts` | §3, §4 | The dependency graph, plus a shorter locum track |
| `intake.ts` | §4.2 | Work-history gaps, disclosures, completeness, e-signature evidence, nudge escalation |
| `psv.ts` | §4.3, §6 | Required verification set, 180-day timeliness against the *decision* date, delta verification |
| `payors.ts` | §7 | Derived payor requirement, blockers, benchmarking, delegated rosters, termination fan-out |
| `billing.ts` | §4.7 | First billable date per payor/TIN/location, billing hold, filing limits, bridge arrangements |
| `privileges.ts` | §8 | Criteria evaluation against verified evidence, committee votes, FPPE/OPPE |
| `advanced-practice.ts` | §9 | Supervision caps, state scope of practice, agreements, APP billing model |
| `expirables.ts` | §10, §11 | Lead-time ladder, suspension actions, recredentialing/reappointment reconciliation |
| `rules.ts` | §10 | Declarative gating rules over a fact bag, editable without code |
| `rbac.ts` | §2, §14 | Field-level read/write policy, redaction, committee packet redaction per role |
| `audit.ts` | §14 | Append-only hash-chained log and point-in-time reconstruction |
| `kpi.ts` | §13 | Stage decomposition, bottleneck attribution, queue aging, committee throughput |

## Decisions worth knowing about

**Status lives on the join, never on the person.** A practitioner onboards at
several facilities, under several TINs, in several states, with different
privilege sets and different payor participation at the same time. There is no
`practitioner.status` — status is on `PayorEnrollment`, `PrivilegeRequest` and
the appointment. The requirements name the flat alternative as the most common
architectural mistake, and every screen here depends on not having made it.

**Start-date risk and revenue risk are separate numbers.** Payor effective dates
trail a start date on nearly every case. Folding that into one status paints the
whole portfolio red and the signal becomes worthless, so `planTimeline` returns
`riskLevel` (can this clinician start?) and `billingRiskLevel` (when can we bill?)
independently. Only START_DATE-gated milestones can tighten the first.

**Verification timeliness is judged against the decision date, not today.** A
file that was complete in March is not complete for a September committee. Every
PSV evaluation takes the projected committee date, which is what makes
`STALE` appear before a decision slips rather than after.

**Nothing is silently overwritten.** A verified value that differs from the
self-reported one is a `DISCREPANCY` for a human to adjudicate. The difference
is the evidence; resolving it by assignment destroys what a survey asks for.

**Everything takes `today` as an argument.** No engine reads the clock. An
auditor will ask what the system believed on a given date, and a function that
reads `Date.now()` internally cannot answer.

**Rules are data.** Gating logic — including the EPCS example spelled out in §10 —
is a declarative condition list evaluated against a fact bag, and a closed gate
reports which condition failed and what the value actually is.

## The seed data

Five cases chosen to exercise §15 rather than to look tidy, on a fixed demo clock
of 2026-08-25:

1. **Osei, MD** — unachievable start date; catheterization and structural heart
   privileges requested without the training or evidenced volume to support them;
   a work-history discrepancy awaiting adjudication.
2. **Whitfield, NP** — six-state telehealth; commercial products blocked because
   the virtual-care TIN has no contract; a Texas DEA schedule outside NP scope; a
   supervising physician already at the California capacity cap; a payor that will
   not credential NPs at all.
3. **Chandran, MD** — new graduate IMG, licence pending at the start date, visa
   expiring inside the first 90 days.
4. **Marchetti, DO** — intra-system transfer, live and billing: 11 verifications
   reused rather than re-run, a retroactive Medicare date releasing held claims,
   and $4,310 already lost to a filing limit while UnitedHealthcare sat on the
   application for 127 days.
5. **Baird, MD** — locum on temporary privileges with a reciprocal billing bridge
   that expires before enrollment completes.

## Scope

This is Phase 1 of the requirements' own phasing recommendation — golden record,
unified intake, expirables engine, task/workflow engine, dashboards — with
working slices of Phases 3 and 4 (payor matrix and per-payor tracking; DOP
library, criteria validation, committee workflow, FPPE/OPPE).

Not built: live integrations (the §12 table is modeled as data shapes and
submission channels, not wired to NPPES, PECOS, NPDB, CAQH or payor portals);
authentication and a real datastore (RBAC and the audit log are implemented as
domain logic over seed data); e-signature capture (signature *evidence* is
validated, the ceremony is not); write paths — every screen is a read of computed
state.

Cycle lengths, verification windows, scope-of-practice rules and accreditor
standards are tenant configuration in `domain/config.ts`, not constants. Validate
them against current accreditor manuals, state law and payor contracts before
encoding them as system rules.
