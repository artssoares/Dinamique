/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship as TypeScript source, so Next must compile them.
  transpilePackages: [
    '@dinamique/types',
    '@dinamique/utils',
    '@dinamique/business-logic',
    '@dinamique/exports',
  ],
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
