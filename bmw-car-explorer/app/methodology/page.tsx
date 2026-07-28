import type { Metadata } from "next";
import { RANK_WEIGHTS, SCORER_VERSION } from "@/domain/config/weights";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How BMW Car Explorer sources data, computes its Reliability Index, and ranks vehicles in the Car Finder.",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <article className="prose-none max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Methodology</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Data &amp; sources</h2>
        <p>
          Specifications come from BMW PressClub and free public US government
          APIs (EPA fueleconomy.gov, NHTSA safety ratings, recalls, and
          complaints). Every value on the site carries a source and a
          verification date. Pricing and specifications change frequently —
          always confirm with an authorized dealer.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Reliability Index</h2>
        <p>
          We do <strong>not</strong> republish licensed third-party ratings
          (e.g. J.D. Power, Consumer Reports, Edmunds) because we have no license
          to do so. Instead we publish our own transparent{" "}
          <strong>Reliability Index</strong> (0–100, higher is better) computed
          only from public NHTSA data:
        </p>
        <p className="rounded bg-black/5 dark:bg-white/10 p-3 font-mono text-sm">
          index = clamp(100 − 6 × open_recalls − 0.4 × complaints, 5, 100)
        </p>
        <p className="text-sm opacity-80">
          This is our own methodology, not an industry rating. It is a rough,
          reproducible signal — not a guarantee of any individual vehicle&apos;s
          reliability.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Car Finder scoring (v{SCORER_VERSION})</h2>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            <strong>Hard filters</strong> eliminate any vehicle that fails a
            stated requirement (budget beyond +10%, wrong body style or
            powertrain, too few seats, missing AWD, range, safety, etc.).
          </li>
          <li>
            <strong>Weighted scoring</strong> ranks the survivors. Each of your
            seven priorities gets a weight from its rank (
            {RANK_WEIGHTS.map((w) => w.toFixed(2)).join(", ")}), normalized to
            sum to 1.
          </li>
          <li>
            Each priority&apos;s sub-score is a min-max normalization computed{" "}
            <em>relative to the eligible candidate set</em>, so scores are always
            0–100 within your shortlist, not absolute.
          </li>
          <li>
            Missing data is imputed with the candidate-set median and flagged —
            never treated as zero. Results relying on &gt;20% imputed inputs are
            marked.
          </li>
          <li>
            Being over budget applies a soft penalty and a “stretch” badge rather
            than silent elimination (up to +10%).
          </li>
        </ol>
        <p className="text-sm opacity-80">
          Identical inputs and catalog version always produce identical rankings.
          Ties break by starting price, then vehicle id. Every result includes a
          full score breakdown — no black box.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Not advice</h2>
        <p>
          Finder output is an algorithmic shortlist based solely on the
          preferences you enter. It is not professional purchase advice.
        </p>
      </section>
    </article>
  );
}
