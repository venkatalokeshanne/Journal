/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
  poweredByHeader: false,
  devIndicators: false,
};
export default nextConfig;
