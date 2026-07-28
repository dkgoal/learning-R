/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Progressive enhancement (NFR-11): pages must render without client JS.
  // We keep the client bundle small (NFR-04) by defaulting to Server Components.
  experimental: {
    optimizePackageImports: [],
  },
};

export default nextConfig;
