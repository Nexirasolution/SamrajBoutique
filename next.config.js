/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Custom loader = Vercel's Image Optimization (and its CPU/billing) is never used.
    // Images are served directly from R2 / Cloudflare CDN. remotePatterns isn't needed.
    loader: 'custom',
    loaderFile: './lib/imageLoader.js',
  },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;