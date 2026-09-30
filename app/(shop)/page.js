// ISR: page is served from cache and rebuilt in the background every 60s.
// (Was force-dynamic = 8 DB queries on every single request.)
export const revalidate = 60;

import { dbConnect } from '@/lib/mongodb';
import Banner from '@/models/Banner';
import Product from '@/models/Product';
import Review from '@/models/Review';
import Combo from '@/models/Combo';
import Category from '@/models/Category';
import BannerCarousel from '@/components/BannerCarousel';
import ProductCard from '@/components/ProductCard';
import ReviewSection from '@/components/ReviewSection';

import Link from 'next/link';
import Image from 'next/image';
import { formatINR } from '@/lib/utils';
import { ArrowRight, Tag } from 'lucide-react';

const INK = '#2B2022';
const INK_SOFT = '#6E5F61';
const BLUSH = '#F8D7DA';
const BLUSH_LIGHT = '#FDF1F2';
const GOLD = '#D6B56D';
const GOLD_DEEP = '#8A6A24';
const HAIRLINE = '#F0DADC';
const FONT_SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const FEATURED_LIMIT = 6;

// Serialize Mongo docs (ObjectId/Date) once
const plain = (v) => JSON.parse(JSON.stringify(v));

async function getData() {
  await dbConnect();
  const [banners, newArrivals, reviews, combos, categories] = await Promise.all([
    Banner.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
    Product.find({ isActive: true, isActiveSeller: true })
      .sort({ createdAt: -1 })
      .limit(FEATURED_LIMIT) // was 12 then sliced to 6
      .lean(),
    Review.find({ isApproved: true, isFeatured: true })
      .populate('product', 'name')
      .limit(10)
      .lean(),
    Combo.find({ isActive: true })
      .select('name slug images image type packOptions comboPrice originalPrice')
      .limit(6)
      .lean(),
    Category.find({ isActive: true, parent: null })
      .select('name slug image')
      .limit(10)
      .lean(),
  ]);
  return {
    banners: plain(banners),
    newArrivals: plain(newArrivals),
    reviews: plain(reviews),
    combos: plain(combos),
    categories: plain(categories),
  };
}

export default async function HomePage() {
  const { banners, newArrivals, reviews, combos, categories } = await getData();

  return (
    <div className="overflow-x-hidden bg-white">
      <BannerCarousel banners={banners} />

      {/* Shop by Category */}
      {categories.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 pt-14 pb-6">
          <h2
            className="text-xl sm:text-2xl font-bold tracking-[3px] uppercase mb-6 text-center"
            style={{ color: INK, fontFamily: FONT_SANS }}
          >
            Shop by Category
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4 sm:gap-6">
            {categories.map((c) => (
              <Link
                key={c._id}
                href={`/category/${c.slug}`}
                className="group flex flex-col items-center text-center"
              >
                <div
                  className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full overflow-hidden transition-transform duration-300 group-hover:scale-105"
                  style={{ border: `1px solid ${GOLD}`, background: BLUSH_LIGHT }}
                >
                  {c.image ? (
                    <Image
                      src={c.image}
                      alt={c.name}
                      fill
                      sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, 96px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full" style={{ background: BLUSH }} />
                  )}
                </div>
                <span
                  className="mt-2 text-[10.5px] sm:text-[11px] font-bold tracking-wide leading-tight line-clamp-2 max-w-[80px]"
                  style={{ color: INK, fontFamily: FONT_SANS }}
                >
                  {c.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured collection */}
      <section className="max-w-6xl mx-auto px-4 pt-8 sm:pt-10 pb-16 text-center">
        <h2
          className="text-lg sm:text-xl font-bold tracking-[3px] uppercase"
          style={{ color: INK, fontFamily: FONT_SANS }}
        >
          Featured Collection
        </h2>

        {newArrivals.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8 mt-8 text-left">
            {newArrivals.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        )}

        <Link
          href="/products"
          className="inline-block mt-10 px-8 py-3 text-[12px] font-bold tracking-[2px] uppercase transition-colors bg-[#7B2D4A] text-white border border-[#7B2D4A] hover:bg-[#651F3B] hover:border-[#651F3B]"
          style={{ fontFamily: FONT_SANS }}
        >
          Shop the collection
        </Link>
      </section>

      {/* Combo Offers */}
      {combos.length > 0 && (
        <section className="py-16 border-t" style={{ borderColor: GOLD, background: BLUSH_LIGHT }}>
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex flex-col items-center text-center mb-8">
              <span
                className="text-[11px] font-bold uppercase tracking-[3px] mb-3 px-3 py-1"
                style={{ color: INK, background: GOLD, fontFamily: FONT_SANS }}
              >
                Save More
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-[1px]" style={{ color: INK, fontFamily: FONT_SANS }}>
                Combo Offers
              </h2>
              <p className="text-sm mt-1 font-light" style={{ color: INK_SOFT, fontFamily: FONT_SANS }}>
                Buy together, save together
              </p>
              <Link
                href="/combos"
                className="hidden sm:flex items-center gap-1 text-sm font-bold hover:gap-2 transition-all mt-3"
                style={{ color: GOLD_DEEP, fontFamily: FONT_SANS }}
              >
                View all <ArrowRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
              {combos.map((c) => {
                const isColorPack = c.type === 'color-pack';
                const cheapestPack =
                  isColorPack && c.packOptions?.length
                    ? c.packOptions.reduce((min, p) => (p.price < min.price ? p : min), c.packOptions[0])
                    : null;
                const cover = c.images?.[0] || c.image;
                const displayPrice = isColorPack ? cheapestPack?.price ?? 0 : c.comboPrice;
                const displayOriginal = isColorPack ? cheapestPack?.originalPrice ?? 0 : c.originalPrice;
                const savings = displayOriginal > displayPrice ? displayOriginal - displayPrice : 0;
                const pct = displayOriginal > 0 ? Math.round((savings / displayOriginal) * 100) : 0;

                return (
                  <Link
                    key={c._id}
                    href={`/combo/${c.slug}`}
                    className="group relative overflow-hidden bg-white transition-colors"
                    style={{ border: `1px solid ${HAIRLINE}` }}
                  >
                    <div className="relative w-full aspect-square overflow-hidden" style={{ background: BLUSH }}>
                      {cover && (
                        <Image
                          src={cover}
                          alt={c.name}
                          fill
                          sizes="(max-width: 640px) 50vw, 33vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      )}
                      {pct > 0 && (
                        <div
                          className="absolute top-2 left-2 z-10 text-[10px] font-bold px-2 py-0.5 flex items-center gap-1"
                          style={{ color: INK, background: GOLD, fontFamily: FONT_SANS }}
                        >
                          <Tag size={9} /> {pct}% off
                        </div>
                      )}
                      {isColorPack && (
                        <div
                          className="absolute top-2 right-2 z-10 text-[10px] font-medium px-2 py-0.5"
                          style={{ background: BLUSH, color: INK, border: `1px solid ${GOLD}` }}
                        >
                          Color Pack
                        </div>
                      )}
                    </div>

                    <div className="p-3" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                      <p className="text-[13px] font-bold tracking-wide line-clamp-1" style={{ color: INK, fontFamily: FONT_SANS }}>
                        {c.name}
                      </p>
                      <div className="flex items-baseline gap-2 mt-1.5">
                        <span className="font-bold text-sm" style={{ color: INK, fontFamily: FONT_SANS }}>
                          {isColorPack && 'From '}
                          {formatINR(displayPrice)}
                        </span>
                        {savings > 0 && (
                          <span className="text-[11px] line-through font-light" style={{ color: INK_SOFT, fontFamily: FONT_SANS }}>
                            {formatINR(displayOriginal)}
                          </span>
                        )}
                      </div>
                      {savings > 0 && (
                        <p className="text-[10.5px] font-bold mt-1 tracking-wide uppercase" style={{ color: GOLD_DEEP, fontFamily: FONT_SANS }}>
                          Save {formatINR(savings)}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-8 text-center sm:hidden">
              {/* NOTE: was /combo here and /combos above — make sure both match your real route */}
              <Link href="/combos" className="text-sm font-bold" style={{ color: GOLD_DEEP, fontFamily: FONT_SANS }}>
                View all combos →
              </Link>
            </div>
          </div>
        </section>
      )}

      <ReviewSection reviews={reviews} />
    </div>
  );
}