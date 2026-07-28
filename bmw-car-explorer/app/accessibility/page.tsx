import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility statement",
  description: "BMW Car Explorer's commitment to WCAG 2.2 AA accessibility.",
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Accessibility statement</h1>
      <p>
        We aim to conform to <strong>WCAG 2.2 Level AA</strong> (NFR-10). The site
        is built with semantic HTML and accessible primitives: keyboard-operable
        controls, visible focus indicators, a skip-to-content link, sufficient
        color contrast, and content that works with JavaScript disabled.
      </p>
      <p>
        Automated axe-core checks run on every route in CI, and a third-party
        WCAG 2.2 AA audit is planned before public launch. If you encounter a
        barrier, please contact us so we can fix it.
      </p>
    </article>
  );
}
