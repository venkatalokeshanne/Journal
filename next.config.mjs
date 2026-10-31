/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
  poweredByHeader: false,
  // Lets a design preview build into its own folder without touching the live build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  devIndicators: false,
};
export default nextConfig;
