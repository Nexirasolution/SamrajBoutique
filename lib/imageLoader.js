// Custom next/image loader: replaces Vercel's Image Optimization entirely.
// Returning a plain URL means the browser fetches images straight from
// Cloudflare R2 / the CDN. Vercel does no resizing, no transcoding, no CPU.
//
// (In dev, Next may warn that this loader "does not implement width" for
// passthrough URLs. That's harmless; it's intentional here.)

// Must match VARIANT_WIDTHS in lib/uploadClient.js and the presign route
const VARIANT_WIDTHS = [400, 800];

export default function imageLoader({ src, width }) {
  // 1. New uploads: <uuid>_full.webp has pre-built <uuid>_400 / _800 siblings.
  //    Pick the smallest pre-built file that is at least `width` wide.
  const m = src.match(/^(.*)_full\.(webp|jpg)$/i);
  if (m) {
    const w = VARIANT_WIDTHS.find((v) => width <= v);
    return w ? `${m[1]}_${w}.${m[2]}` : src;
  }

  // 2. Old Cloudinary images: let Cloudinary resize/convert (not Vercel)
  if (src.includes('res.cloudinary.com') && src.includes('/upload/')) {
    return src.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
  }

  // 3. Everything else (old R2 uploads, local files, GIFs): serve as-is
  return src;
}