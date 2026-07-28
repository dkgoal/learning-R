import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms & disclaimers",
  description: "Terms of use and disclaimers for BMW Car Explorer.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Terms &amp; disclaimers</h1>
      <p className="text-sm opacity-70">This is a template pending legal review (§14.6).</p>
      <h2 className="text-xl font-semibold">No affiliation</h2>
      <p>{SITE.disclaimer}</p>
      <h2 className="text-xl font-semibold">Specifications &amp; pricing</h2>
      <p>
        Specifications and pricing are provided for research and are subject to
        change without notice. Always confirm current details with an authorized
        dealer before making a purchase decision.
      </p>
      <h2 className="text-xl font-semibold">Not professional advice</h2>
      <p>
        The Car Finder produces an algorithmic shortlist from the preferences you
        enter. It is not professional, financial, or purchase advice.
      </p>
    </article>
  );
}
