import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireAdmin } from '@/lib/apiAuth';
import { getProductData } from '@/lib/getProduct';

function getFilter(id) {
  return mongoose.isValidObjectId(id) ? { _id: id } : { slug: id };
}

export async function GET(req, { params }) {
  const data = await getProductData(params.id);
  if (!data) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}

export const PUT = requireAdmin(async (req, { params }) => {
  await dbConnect();
  const body = await req.json();

  const current = await Product.findOne(getFilter(params.id)).select('_id category sku');
  if (!current) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  // SKU is permanently locked after creation — ignore anything the client sends.
  delete body.sku;

  if (body.variants?.length) {
    body.basePrice = Math.min(...body.variants.map((v) => v.price));
  }

  const product = await Product.findOneAndUpdate(getFilter(params.id), body, { new: true });
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  revalidatePath(`/product/${product.slug}`); // show admin edits immediately
  return NextResponse.json({ product });
});

export const DELETE = requireAdmin(async (req, { params }) => {
  await dbConnect();
  const doomed = await Product.findOneAndDelete(getFilter(params.id));
  if (doomed) revalidatePath(`/product/${doomed.slug}`);
  return NextResponse.json({ success: true });
});