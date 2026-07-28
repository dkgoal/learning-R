"use client"; // interactive selection + reads the localStorage compare tray.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export interface CompareOption {
  token: string;
  label: string;
  price: string;
}

const COMPARE_KEY = "bmwx.compareTray";

export function CompareBuilder({ options }: { options: CompareOption[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  // Seed from the persisted tray (FR-301).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMPARE_KEY);
      if (raw) {
        const tokens = (JSON.parse(raw) as string[]).filter((t) =>
          options.some((o) => o.token === t),
        );
        setSelected(tokens.slice(0, 4));
      }
    } catch {
      /* ignore */
    }
  }, [options]);

  const persist = (next: string[]) => {
    setSelected(next);
    try {
      window.localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const toggle = (token: string) => {
    if (selected.includes(token)) persist(selected.filter((t) => t !== token));
    else if (selected.length < 4) persist([...selected, token]);
  };

  // Canonical alphabetical ordering (SEO-01), matching the domain slug builder.
  const slug = useMemo(
    () => [...selected].sort((a, b) => a.localeCompare(b)).join("-vs-"),
    [selected],
  );

  const ready = selected.length >= 2;

  return (
    <div className="space-y-4">
      <p className="text-sm opacity-80">
        Pick 2–4 vehicles to compare. Your selection is saved on this device — no
        account needed.
      </p>

      <ul className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const isSel = selected.includes(o.token);
          const disabled = !isSel && selected.length >= 4;
          return (
            <li key={o.token}>
              <label
                className={`flex items-center gap-3 rounded border p-2 text-sm ${
                  isSel
                    ? "border-ink dark:border-white bg-black/5 dark:bg-white/10"
                    : "border-black/15 dark:border-white/15"
                } ${disabled ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  disabled={disabled}
                  onChange={() => toggle(o.token)}
                />
                <span className="flex-1">{o.label}</span>
                <span className="opacity-70">{o.price}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        {ready ? (
          <Link
            href={`/compare/${slug}`}
            className="rounded bg-ink text-white px-4 py-2 dark:bg-white dark:text-ink"
          >
            Compare {selected.length} vehicles →
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="rounded bg-ink text-white px-4 py-2 opacity-50 dark:bg-white dark:text-ink"
          >
            Select at least 2
          </button>
        )}
        {selected.length > 0 && (
          <button type="button" onClick={() => persist([])} className="underline text-sm">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
