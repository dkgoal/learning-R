import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        That case or page does not exist in this build.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-info hover:underline">
        Back to the dashboard
      </Link>
    </div>
  );
}
