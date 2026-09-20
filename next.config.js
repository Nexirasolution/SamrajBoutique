// Old images are still served from R2, so keep its host allowed while any
// R2 URLs remain in the database. Remove this once everything is migrated.
const r2Host = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      ...(r2Host ? [{ protocol: 'https', hostname: r2Host }] : []),
    ],
  },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;