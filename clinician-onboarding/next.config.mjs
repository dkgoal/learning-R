/**
 * Every page in this app prerenders at build time — there are no API routes,
 * server actions or runtime data reads — so it exports to plain HTML and can be
 * served from any static host.
 *
 * `basePath` comes from the environment because GitHub Pages serves a project
 * site under /<repo> while Vercel, Netlify and S3 serve from the root. Set
 * NEXT_PUBLIC_BASE_PATH=/learning-R/clinician-onboarding for Pages; leave it
 * unset everywhere else.
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "export",
  basePath,
  // Static hosts serve /about as /about/index.html; trailing slashes keep the
  // relative asset paths correct under a basePath.
  trailingSlash: true,
};

export default nextConfig;
