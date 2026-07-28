import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center space-y-4">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="opacity-80">
        We couldn&apos;t find that vehicle or page.
      </p>
      <Link href="/bmw" className="underline">
        Browse the lineup
      </Link>
    </div>
  );
}
