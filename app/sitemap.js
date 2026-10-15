import { dbConnect } from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';

// Rebuild at most once an hour instead of hitting MongoDB on every crawler request
export const revalidate = 3600;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.samrajboutique.com').replace(/\/$/, '');
const MAX_URLS = 50000; // Google's per-sitemap limit

// Only add absolute http(s) image URLs to the image sitemap
const toAbsoluteImages = (imgs) =>
  (Array.isArray(imgs) ? imgs : [imgs])
    .filter((u) => typeof u === 'string' && /^https?:\/\//.test(u))
    .slice(0, 5);

export default async function sitemap() {
  let products = [];
  let categories = [];

  try {
    await dbConnect();
    [products, categories] = await Promise.all([
      Product.find({ isActive: true })
        .select('slug updatedAt images')
        .sort({ updatedAt: -1 })
        .limit(MAX_URLS)
        .lean(),
      Category.find({ isActive: true }).select('slug updatedAt').sort({ updatedAt: -1 }).lean(),
    ]);
  } catch (err) {
    console.error('[sitemap] DB error:', err);
  }

  // Only indexable, public pages. /cart and /checkout are intentionally excluded
  // (private, thin pages that shouldn't appear in search results).
  // Add real pages here, e.g. '/about', '/contact', '/shipping-policy', '/return-policy'.
  // lastModified is omitted for static pages: a fake "now" on every request makes Google ignore the field.
  const staticRoutes = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1.0 },
  ];

  const categoryRoutes = categories
    .filter((c) => c.slug)
    .map((c) => ({
      url: `${SITE_URL}/category/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

  const productRoutes = products
    .filter((p) => p.slug)
    .map((p) => {
      const images = toAbsoluteImages(p.images);
      return {
        url: `${SITE_URL}/product/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.7,
        ...(images.length && { images }), // image sitemap (Next.js 14.2+)
      };
    });

  return [...staticRoutes, ...categoryRoutes, ...productRoutes].slice(0, MAX_URLS);
}