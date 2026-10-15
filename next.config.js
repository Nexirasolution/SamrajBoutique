/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Custom loader = Vercel's Image Optimization (and its CPU/billing) is never used.
    // Images are served directly from R2 / Cloudflare CDN. remotePatterns isn't needed.
    loader: 'custom',
    loaderFile: './lib/imageLoader.js',

    // Make next/image's srcset widths match the files we actually store
    // (_400, _800, _full = 1600). With the default sizes (640, 750, 828, ...)
    // a phone asking for 828px would be handed the 1600px file, because
    // the loader only has 400 / 800 / full to choose from.
    // Keep in sync with VARIANT_WIDTHS in lib/uploadClient.js and lib/imageLoader.js.
    deviceSizes: [400, 800, 1600],
    imageSizes: [64, 128, 256],
  },
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;