"use client"; // localStorage + interactive state — anonymous-first persistence (FR-501).

import Link from "next/link";
import { useEffect, useState } from "react";

const COMPARE_KEY = "bmwx.compareTray";
const FAV_KEY = "bmwx.favorites";

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]): void {
  window.localStorage.setItem(key, JSON.stringify(list));
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

function useList(key: string): [string[], (v: string[]) => void] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    setList(readList(key));
    const onChange = (e: StorageEvent) => {
      if (e.key === key || e.key === null) setList(readList(key));
    };
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, [key]);
  const update = (v: string[]) => {
    writeList(key, v);
    setList(v);
  };
  return [list, update];
}

/** FR-205/301: add/remove a vehicle from the compare tray (max 4). */
export function AddToCompareButton({ token }: { token: string }) {
  const [tray, setTray] = useList(COMPARE_KEY);
  const inTray = tray.includes(token);
  const full = tray.length >= 4 && !inTray;
  return (
    <button
      type="button"
      disabled={full}
      onClick={() =>
        setTray(inTray ? tray.filter((t) => t !== token) : [...tray, token])
      }
      className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm disabled:opacity-50"
      aria-pressed={inTray}
    >
      {inTray ? "✓ In compare" : full ? "Compare full (4)" : "Add to compare"}
    </button>
  );
}

/** FR-205/504: favorite a vehicle (anonymous localStorage). */
export function SaveButton({ token }: { token: string }) {
  const [favs, setFavs] = useList(FAV_KEY);
  const saved = favs.includes(token);
  return (
    <button
      type="button"
      onClick={() =>
        setFavs(saved ? favs.filter((t) => t !== token) : [...favs, token])
      }
      className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm"
      aria-pressed={saved}
    >
      {saved ? "★ Saved" : "☆ Save"}
    </button>
  );
}

/** Sticky tray summary with a link to the compare builder (FR-301). */
export function CompareTrayBar() {
  const [tray] = useList(COMPARE_KEY);
  if (tray.length === 0) return null;
  return (
    <div className="fixed bottom-3 inset-x-0 px-4 z-40">
      <div className="mx-auto max-w-content rounded-lg bg-ink text-white dark:bg-white dark:text-ink shadow-lg px-4 py-2 flex items-center justify-between text-sm">
        <span>{tray.length} in compare</span>
        <Link href="/compare" className="underline font-medium">
          Compare now →
        </Link>
      </div>
    </div>
  );
}
