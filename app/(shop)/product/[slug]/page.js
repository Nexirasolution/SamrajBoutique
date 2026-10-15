import { cache } from 'react';
import { notFound } from 'next/navigation';
import { dbConnect } from '@/lib/mongodb';
import Product from '@/models/Product';
import { getProductData } from '@/lib/getProduct';
import { slimProduct } from '@/lib/slimProduct';
import ProductClient from './ProductClient';

// Static + cached on the CDN, rebuilt in the background at most every 10 min.
// For instant updates, call revalidatePath(`/product/${slug}`) (and '/')
// in your admin routes that save or delete a product.
export const revalidate = 600;

// Slugs not pre-built here are generated on first visit, then cached too
// (dynamicParams defaults to true).
export async function generateStaticParams() {
  try {
    await dbConnect();
    const rows = await Product.find({ isActive: true, isActiveSeller: true })
      .sort({ createdAt: -1 })
      .limit(50) // newest 50 are pre-built; raise if you like
      .select('slug')
      .lean();
    return rows.map((r) => ({ slug: r.slug }));
  } catch {
    return []; // never fail the build over this, pages will build on demand
  }
}

// generateMetadata and the page both need the product: cache() makes it
// one database read per render instead of two.
const getData = cache((slug) => getProductData(slug));

export async function generateMetadata({ params }) {
  const { slug } = await params; // `await` is safe on Next 14 and 15
  const data = await getData(slug);
  if (!data) return {};
  const p = data.product;
  const img = p.variants?.[0]?.images?.[0];
  return {
    title: p.seoTitle || p.name,
    description: p.seoDescription || p.description?.slice(0, 160),
    openGraph: img ? { images: [img] } : undefined,
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const data = await getData(slug);
  if (!data) notFound();

  // The review UI in ProductClient is commented out, so don't ship reviews to
  // the browser. Related products only need their first variant for the card.
  // (If you re-enable reviews, pass `reviews` through again.)
  const { reviews, ...rest } = data;
  const initialData = { ...rest, related: rest.related?.map(slimProduct) };

  return <ProductClient initialData={initialData} />;
}