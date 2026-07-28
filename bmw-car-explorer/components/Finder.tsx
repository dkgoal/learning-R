"use client"; // interactive wizard; runs the SAME /domain scorer in-browser (FR-408).

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  PRIORITY_DIMENSIONS,
  type PriorityDimension,
} from "@/domain/config/weights";
import {
  runFinder,
  weightsFromPriorities,
  type FinderAnswers,
} from "@/domain/finder";
import type { PowertrainType, Vehicle } from "@/domain/types";
import { getFamily } from "@/data/families";
import { totalPrice, usd } from "@/lib/format";

const DIM_LABEL: Record<PriorityDimension, string> = {
  performance: "Performance",
  comfort: "Comfort",
  efficiency: "Efficiency",
  safety: "Safety",
  technology: "Technology",
  cargo: "Cargo & utility",
  cost_of_ownership: "Cost of ownership",
};

const BODY_STYLES = ["Sedan", "Gran Coupe", "SAV", "Roadster"];
const POWERTRAINS: { value: PowertrainType; label: string }[] = [
  { value: "ICE", label: "Gas" },
  { value: "MHEV", label: "Mild hybrid" },
  { value: "PHEV", label: "Plug-in hybrid" },
  { value: "BEV", label: "Electric" },
];

export function Finder({
  catalog,
  familyBody,
}: {
  catalog: Vehicle[];
  familyBody: Record<string, string>;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<FinderAnswers>({
    priorities: [...PRIORITY_DIMENSIONS],
    sportiness: 50,
  });
  const [showResults, setShowResults] = useState(false);
  const [weights, setWeights] = useState<Record<PriorityDimension, number> | null>(
    null,
  );

  const familyLookup = useMemo(
    () => (slug: string) => {
      const bodyStyle = familyBody[slug];
      return bodyStyle ? { bodyStyle } : undefined;
    },
    [familyBody],
  );

  const patch = (p: Partial<FinderAnswers>) =>
    setAnswers((a) => ({ ...a, ...p }));

  const toggleIn = <T,>(list: T[] | undefined, v: T): T[] => {
    const cur = list ?? [];
    return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  };

  const movePriority = (index: number, dir: -1 | 1) => {
    const list = [...(answers.priorities ?? PRIORITY_DIMENSIONS)];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    patch({ priorities: list });
  };

  const runNow = () => {
    setWeights(weightsFromPriorities(answers.priorities, answers.sportiness));
    setShowResults(true);
  };

  const output = useMemo(() => {
    if (!showResults) return null;
    return runFinder(catalog, answers, familyLookup, {
      weightsOverride: weights ?? undefined,
    });
  }, [showResults, catalog, answers, familyLookup, weights]);

  if (showResults && output) {
    return (
      <ResultsView
        output={output}
        weights={weights!}
        onWeight={(dim, val) =>
          setWeights((w) => ({ ...(w ?? weightsFromPriorities(answers.priorities)), [dim]: val }))
        }
        onRestart={() => {
          setShowResults(false);
          setStep(0);
        }}
      />
    );
  }

  const steps = [
    // Q1
    <fieldset key="budget">
      <legend className="font-semibold mb-2">What&apos;s your budget?</legend>
      <label className="block text-sm mb-1" htmlFor="budget">
        Max out-the-door price (USD)
      </label>
      <input
        id="budget"
        type="number"
        min={0}
        step={1000}
        value={answers.maxOutTheDoorUsd ?? ""}
        onChange={(e) =>
          patch({
            maxOutTheDoorUsd: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        className="rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
      />
    </fieldset>,
    // Q2
    <fieldset key="body">
      <legend className="font-semibold mb-2">Body style (optional)</legend>
      {BODY_STYLES.map((b) => (
        <label key={b} className="flex items-center gap-2 py-0.5">
          <input
            type="checkbox"
            checked={answers.bodyStyles?.includes(b) ?? false}
            onChange={() => patch({ bodyStyles: toggleIn(answers.bodyStyles, b) })}
          />
          {b}
        </label>
      ))}
    </fieldset>,
    // Q3
    <fieldset key="pt">
      <legend className="font-semibold mb-2">Powertrains you&apos;re open to</legend>
      {POWERTRAINS.map((p) => (
        <label key={p.value} className="flex items-center gap-2 py-0.5">
          <input
            type="checkbox"
            checked={answers.powertrains?.includes(p.value) ?? false}
            onChange={() =>
              patch({ powertrains: toggleIn(answers.powertrains, p.value) })
            }
          />
          {p.label}
        </label>
      ))}
    </fieldset>,
    // Q4
    <fieldset key="seats">
      <legend className="font-semibold mb-2">Seats needed</legend>
      {[
        { label: "No preference", val: undefined },
        { label: "2", val: 2 },
        { label: "4–5", val: 4 },
        { label: "6–7", val: 6 },
      ].map((o) => (
        <label key={o.label} className="flex items-center gap-2 py-0.5">
          <input
            type="radio"
            name="seats"
            checked={answers.seatsNeeded === o.val}
            onChange={() => patch({ seatsNeeded: o.val })}
          />
          {o.label}
        </label>
      ))}
    </fieldset>,
    // Q6 priorities
    <fieldset key="priorities">
      <legend className="font-semibold mb-2">Rank your priorities</legend>
      <p className="text-sm opacity-70 mb-2">Most important at the top.</p>
      <ol className="space-y-1">
        {(answers.priorities ?? PRIORITY_DIMENSIONS).map((dim, i) => (
          <li
            key={dim}
            className="flex items-center justify-between rounded border border-black/15 dark:border-white/15 px-3 py-1.5 text-sm"
          >
            <span>
              {i + 1}. {DIM_LABEL[dim]}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() => movePriority(i, -1)}
                aria-label={`Move ${DIM_LABEL[dim]} up`}
                className="px-2 border rounded border-black/20 dark:border-white/20"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => movePriority(i, 1)}
                aria-label={`Move ${DIM_LABEL[dim]} down`}
                className="px-2 border rounded border-black/20 dark:border-white/20"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    </fieldset>,
    // Q7 hard requirements
    <fieldset key="hard">
      <legend className="font-semibold mb-2">Hard requirements (optional)</legend>
      {[
        { key: "requireAwd", label: "All-wheel drive (xDrive)" },
        { key: "requireTspPlus", label: "IIHS Top Safety Pick+ only" },
        { key: "requireThirdRow", label: "Third row" },
        { key: "requireHandsFree", label: "Hands-free highway assist" },
        { key: "noHomeCharging", label: "No home charging (exclude EVs)" },
      ].map((o) => (
        <label key={o.key} className="flex items-center gap-2 py-0.5">
          <input
            type="checkbox"
            checked={Boolean(answers[o.key as keyof FinderAnswers])}
            onChange={(e) => patch({ [o.key]: e.target.checked } as Partial<FinderAnswers>)}
          />
          {o.label}
        </label>
      ))}
      <label className="flex items-center gap-2 py-0.5 mt-2">
        Minimum range (mi):
        <input
          type="number"
          min={0}
          step={25}
          value={answers.minRangeMi ?? ""}
          onChange={(e) =>
            patch({ minRangeMi: e.target.value ? Number(e.target.value) : undefined })
          }
          className="w-24 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
        />
      </label>
    </fieldset>,
    // Q10 sportiness + climate
    <fieldset key="feel">
      <legend className="font-semibold mb-2">Driving character &amp; climate</legend>
      <label className="block text-sm mb-1" htmlFor="sport">
        Comfort ← → Sporty
      </label>
      <input
        id="sport"
        type="range"
        min={0}
        max={100}
        value={answers.sportiness ?? 50}
        onChange={(e) => patch({ sportiness: Number(e.target.value) })}
        className="w-full"
      />
      <label className="flex items-center gap-2 py-2">
        <input
          type="checkbox"
          checked={answers.coldClimate ?? false}
          onChange={(e) => patch({ coldClimate: e.target.checked })}
        />
        I live in a cold / snowy climate
      </label>
    </fieldset>,
  ];

  const isLast = step === steps.length - 1;

  return (
    <div className="max-w-xl">
      <p className="text-sm opacity-60 mb-3">
        Step {step + 1} of {steps.length} · every question is optional
      </p>
      <div className="rounded-lg border border-black/10 dark:border-white/10 p-4 min-h-[12rem]">
        {steps[step]}
      </div>
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="px-4 py-2 underline disabled:opacity-40"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={runNow}
            className="rounded bg-ink text-white px-5 py-2 dark:bg-white dark:text-ink"
          >
            See my matches
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="rounded bg-ink text-white px-5 py-2 dark:bg-white dark:text-ink"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function ResultsView({
  output,
  weights,
  onWeight,
  onRestart,
}: {
  output: NonNullable<ReturnType<typeof runFinder>>;
  weights: Record<PriorityDimension, number>;
  onWeight: (dim: PriorityDimension, val: number) => void;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Your top matches</h2>
        <button type="button" onClick={onRestart} className="underline text-sm">
          Start over
        </button>
      </div>

      {/* FR-411: explicit non-advice disclaimer. */}
      <p className="rounded border border-black/10 dark:border-white/10 p-3 text-xs opacity-80">
        This is an algorithmic shortlist based only on the preferences you
        entered — not professional purchase advice. See{" "}
        <Link href="/methodology" className="underline">how it works</Link>.
        Scorer v{output.scorerVersion}.
      </p>

      {/* FR-408: live weight sliders re-rank in-browser. */}
      <details className="rounded border border-black/10 dark:border-white/10 p-3">
        <summary className="cursor-pointer font-medium">
          Adjust priority weights &amp; re-rank
        </summary>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {PRIORITY_DIMENSIONS.map((dim) => (
            <label key={dim} className="text-sm">
              <span className="flex justify-between">
                <span>{DIM_LABEL[dim]}</span>
                <span className="opacity-60">{Math.round(weights[dim] * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(weights[dim] * 100)}
                onChange={(e) => onWeight(dim, Number(e.target.value) / 100)}
                className="w-full"
              />
            </label>
          ))}
        </div>
      </details>

      {output.results.length === 0 ? (
        <p>No vehicles match your hard requirements. Try relaxing a filter.</p>
      ) : (
        <ol className="space-y-4">
          {output.results.map((r, i) => {
            const fam = getFamily(r.vehicle.familySlug);
            return (
              <li
                key={r.vehicle.id}
                className="rounded-lg border border-black/10 dark:border-white/10 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">
                    {i + 1}.{" "}
                    <Link
                      href={`/bmw/${r.vehicle.familySlug}/${r.vehicle.modelYear}/${r.vehicle.slug}`}
                      className="hover:underline"
                    >
                      {r.vehicle.modelYear} BMW {fam?.name} {r.vehicle.trimName}
                    </Link>
                  </h3>
                  <div className="text-right">
                    <div className="text-xl font-bold">{r.matchPct}%</div>
                    <div className="text-xs opacity-60">match</div>
                  </div>
                </div>

                <p className="text-sm mt-1">
                  {usd(totalPrice(r.vehicle))}
                  {r.budgetStretch && (
                    <span className="ml-2 rounded bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs">
                      Stretch (over budget)
                    </span>
                  )}
                  {r.partialFlag && (
                    <span className="ml-2 rounded bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs">
                      Some data estimated
                    </span>
                  )}
                </p>

                <ul className="mt-2 text-sm list-disc pl-5 space-y-0.5">
                  {r.whyBullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
                {r.tradeoffBullets.length > 0 && (
                  <ul className="mt-1 text-sm list-disc pl-5 opacity-70 space-y-0.5">
                    {r.tradeoffBullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}

                {/* FR-407: full explainability breakdown. */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm underline">
                    Score breakdown
                  </summary>
                  <table className="mt-2 w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-left opacity-70">
                        <th className="py-1">Dimension</th>
                        <th className="py-1">Weight</th>
                        <th className="py-1">Score</th>
                        <th className="py-1">Contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.breakdown.map((b) => (
                        <tr key={b.dimension} className="border-t border-black/5 dark:border-white/5">
                          <td className="py-1">
                            {DIM_LABEL[b.dimension]}
                            {b.partial && <span className="opacity-60"> *</span>}
                          </td>
                          <td className="py-1">{Math.round(b.weight * 100)}%</td>
                          <td className="py-1">{Math.round(b.normalized * 100)}</td>
                          <td className="py-1">{Math.round(b.contribution * 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] opacity-60 mt-1">
                    * dimension used an imputed (candidate-median) value.
                  </p>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
