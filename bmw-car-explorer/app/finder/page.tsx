import type { Metadata } from "next";
import { Finder } from "@/components/Finder";
import { FAMILIES } from "@/data/families";
import { publicCatalog } from "@/lib/catalog-view";

export const metadata: Metadata = {
  title: "BMW Car Finder — get a ranked shortlist",
  description:
    "Answer a few questions and get an explainable, ranked shortlist of BMWs that fit your budget, needs, and priorities. Free, no account required.",
  alternates: { canonical: "/finder" },
};

// CSR shell (URL table): the server ships the public scoring payload and the
// client runs the exact same /domain scorer for instant re-ranking (FR-408).
export default function FinderPage() {
  const catalog = publicCatalog();
  const familyBody = Object.fromEntries(
    FAMILIES.map((f) => [f.slug, f.bodyStyle]),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Car Finder</h1>
        <p className="opacity-80">
          Tell us what matters and we&apos;ll rank the lineup for you — with a full
          explanation of why.
        </p>
      </header>
      <Finder catalog={catalog} familyBody={familyBody} />
    </div>
  );
}
