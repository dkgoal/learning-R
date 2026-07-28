import type { Metadata } from "next";
import { SOURCES } from "@/data/sources";

export const metadata: Metadata = {
  title: "Data sources",
  description:
    "The data sources behind BMW Car Explorer and their licensing / attribution status.",
  alternates: { canonical: "/sources" },
};

export default function SourcesPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Data sources</h1>
      <p className="opacity-80">
        Every value on the site is traceable to one of the sources below, with a
        verification date shown on each vehicle page. Licensed third-party
        ratings are deliberately excluded until properly licensed.
      </p>
      <ul className="space-y-3">
        {Object.values(SOURCES).map((s) => (
          <li key={s.id} className="rounded border border-black/10 dark:border-white/10 p-3">
            <div className="font-semibold">{s.name}</div>
            {s.url && (
              <a href={s.url} className="text-sm underline break-all">
                {s.url}
              </a>
            )}
            <p className="text-sm opacity-80">
              {s.licenseNote ?? "Public data."}{" "}
              {s.attributionRequired ? "Attribution required." : ""}
            </p>
          </li>
        ))}
      </ul>
    </article>
  );
}
