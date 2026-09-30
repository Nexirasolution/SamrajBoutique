import { cache } from 'react';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import Product from '@/models/Product';
import Review from '@/models/Review';
import '@/models/Category'; // registers the Category model for populate() — adjust path if yours differs

const plain = (x) => JSON.parse(JSON.stringify(x)); // ObjectId/Date -> string for client components

function getFilter(id) {
  return mongoose.isValidObjectId(id) ? { _id: id } : { slug: id };
}

// Shared by the server page and the API route.
// cache() de-dupes the call between generateMetadata and the page render.
export const getProductData = cache(async (idOrSlug) => {
  await dbConnect();

  const product = await Product.findOne({ ...getFilter(idOrSlug), isActive: true })
    .populate('category', 'name slug sizes type sizeChart')
    .lean();
  if (!product) return null;

  // reviews + related run in parallel instead of one after the other
  const [reviews, related] = await Promise.all([
    Review.find({ product: product._id, isApproved: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('rating comment customerName images isVerifiedPurchase createdAt')
      .lean(),
    Product.find({ category: product.category._id, _id: { $ne: product._id }, isActive: true })
      .limit(8)
      .select('name slug basePrice variants rating')
      .lean(),
  ]);

  return plain({ product, reviews, related });
});