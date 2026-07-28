import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How BMW Car Explorer handles data and your CPRA/CCPA rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Privacy policy</h1>
      <p className="text-sm opacity-70">This is a template pending legal review (§14.4).</p>
      <p>
        We use privacy-friendly, cookieless analytics by default and do not set
        non-essential cookies. Your saved cars, comparisons, and finder sessions
        are stored on your own device (localStorage) unless you create an
        optional account to sync them.
      </p>
      <h2 className="text-xl font-semibold">We do not sell or share your data</h2>
      <p>
        We do not sell or share personal information as defined by the CPRA/CCPA.
      </p>
      <h2 className="text-xl font-semibold">Your rights</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Access a copy of your data (account export as JSON).</li>
        <li>Delete your account and data (hard-deleted within 30 days).</li>
        <li>Opt out — there is nothing to opt out of, as we don&apos;t sell data.</li>
      </ul>
      <p className="text-sm opacity-70">
        Data retention: anonymous finder/comparison links expire after 12 months.
      </p>
    </article>
  );
}
