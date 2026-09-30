import { notFound } from 'next/navigation';
import { getProductData } from '@/lib/getProduct';
import ProductClient from './ProductClient';

// Cached + regenerated in the background at most once a minute, so most
// visitors get a ready-made page instead of waiting on the database.
export const revalidate = 60;

export async function generateMetadata({ params }) {
  const data = await getProductData(params.slug);
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
  const data = await getProductData(params.slug);
  if (!data) notFound();
  return <ProductClient initialData={data} />;
}