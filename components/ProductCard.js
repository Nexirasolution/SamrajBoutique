'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Heart, ShoppingBag, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatINR } from '@/lib/utils';
import { getVariantTotalStock } from '@/lib/stock';
import { useWishlist } from '@/components/WhishlistContext'; // adjust path as needed
import { useCart } from '@/components/CartContext';

// Theme: Light Blush + Champagne Gold.
// Champagne gold is too light to carry small text on white, so text stays a
// warm dark ink and gold is used for borders, fills and accents.
// The button classes below use the same hex values — keep them in sync.
const INK = '#2B2022';         // primary text (warm near-black)
const INK_SOFT = '#7A6A6C';    // secondary text, struck-through price
const BLUSH = '#F8D7DA';       // Light Blush
const BLUSH_LIGHT = '#FDF1F2'; // image well
const GOLD = '#D6B56D';        // Champagne Gold
const GOLD_DEEP = '#8A6A24';   // gold used as text on white (readable)
const LINE = '#F0DADC';        // hairlines
const DISABLED = '#C9B9BB';
const PAPER = '#FFFFFF';
const FONT_SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// Products with a sleeve or zip choice can't be added straight from the card,
// so those cards send the shopper to the product page instead.
// Adjust these field names if your Product model calls them something else.
const OPTION_FIELDS = ['sleeveOptions', 'zipOptions'];

// ---------------------------------------------------------------------------
// Action buttons (colors live in classes so hover states can override them)
//   Mobile (< sm):  stacked, full width, 44px tall, 14px text, icon + label
//   sm and up:      side by side, 40px tall, 12.5px text
//   (the bag icon is hidden between sm and lg so the labels always fit)
// ---------------------------------------------------------------------------
const BTN_BASE =
  'flex items-center justify-center gap-2 sm:flex-1 h-11 sm:h-10 px-4 sm:px-3 rounded-md text-[14px] sm:text-[12.5px] font-semibold sm:font-medium tracking-wide whitespace-nowrap transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed';

const BTN_CART = `${BTN_BASE} bg-white text-[#2B2022] border border-[#D6B56D] hover:bg-[#F8D7DA]`;
const BTN_CART_ADDED = `${BTN_BASE} bg-[#F8D7DA] text-[#2B2022] border border-[#D6B56D]`;
const BTN_BUY = `${BTN_BASE} bg-[#D6B56D] text-[#2B2022] border border-[#D6B56D] hover:bg-[#C7A257] hover:border-[#C7A257]`;

const ICON_CLASS = 'sm:hidden lg:inline-block shrink-0';

export default function ProductCard({ product }) {
  const router = useRouter();
  const { addItem } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();

  const variant = product.variants?.[0];
  const image = variant?.images?.[0] || '/placeholder.png';
  const price = product.basePrice || variant?.price || 0;
  const compareAt = variant?.compareAtPrice || 0;
  const discountPct = compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : 0;

  const sizes = variant?.sizes || [];
  const hasSizes = sizes.length > 0;

  const totalStock = getVariantTotalStock(variant);
  const outOfStock = totalStock <= 0;
  const lowStock = !outOfStock && totalStock <= 5;

  // If the product only comes in one size, pick it automatically.
  const [selectedSize, setSelectedSize] = useState(() =>
    sizes.length === 1 && sizes[0].stock > 0 ? sizes[0].size : ''
  );
  const [added, setAdded] = useState(false);
  const selectedStock = sizes.find((s) => s.size === selectedSize)?.stock ?? 0;

  // Brief "Added" confirmation on the cart button
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1600);
    return () => clearTimeout(t);
  }, [added]);

  const needsProductPage = OPTION_FIELDS.some((k) => product[k]?.length > 0) || !hasSizes;

  const wishlistId = product.id ?? product._id ?? product.slug;
  const wishlisted = isWishlisted(wishlistId);
  const href = `/product/${product.slug}`;

  const handleWishlistClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(wishlistId);
  };

  function buildItem() {
    return {
      productId: product._id ?? product.id,
      slug: product.slug,
      variantId: variant?._id,
      name: product.name,
      image,
      color: variant?.color || '-',
      colorHex: variant?.colorHex,
      size: selectedSize,
      price,
      stock: selectedStock,
      qty: 1,
    };
  }

  function requireSize() {
    if (!selectedSize) {
      toast.error('Please select a size');
      return false;
    }
    return true;
  }

  function handleAddToCart() {
    if (!requireSize()) return;
    addItem(buildItem());
    setAdded(true);
  }

  function handleBuyNow() {
    if (!requireSize()) return;
    addItem(buildItem());
    router.push('/checkout');
  }

  return (
    <div style={{ background: PAPER, fontFamily: FONT_SANS }}>
      {/* Image */}
      <div className="relative">
        <Link href={href} className="block" aria-label={product.name}>
          <div className="relative aspect-[3/4] overflow-hidden" style={{ background: BLUSH }}>
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className={`object-cover ${outOfStock ? 'grayscale opacity-70' : ''}`}
            />
          </div>
        </Link>

        {/* Status badge */}
        <div className="absolute top-3 left-3 pointer-events-none">
          {outOfStock ? (
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: PAPER, background: INK_SOFT, padding: '5px 12px', borderRadius: '999px' }}
            >
              Out of stock
            </span>
          ) : lowStock ? (
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{
                color: INK,
                background: BLUSH,
                border: `1px solid ${GOLD}`,
                padding: '4px 11px',
                borderRadius: '999px',
              }}
            >
              {totalStock} left
            </span>
          ) : discountPct > 0 ? (
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: INK, background: GOLD, padding: '5px 12px', borderRadius: '999px' }}
            >
              Sale
            </span>
          ) : null}
        </div>

        {/* Wishlist */}
        <button
          type="button"
          onClick={handleWishlistClick}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={wishlisted}
          className="absolute top-3 right-3 flex items-center justify-center w-8 h-8 rounded-full transition-transform active:scale-90"
          style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(2px)' }}
        >
          <Heart
            className="w-4 h-4"
            strokeWidth={2}
            style={{ color: wishlisted ? GOLD_DEEP : INK }}
            fill={wishlisted ? GOLD : 'none'}
          />
        </button>
      </div>

      {/* Title + price */}
      <Link href={href} className="block pt-3">
        <h3
          className="text-[13px] sm:text-sm font-medium line-clamp-2"
          style={{ color: INK, lineHeight: 1.375, minHeight: '2.75em' }}
        >
          {product.name}
        </h3>

        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-base sm:text-lg" style={{ color: INK }}>
            {formatINR(price)}
          </span>
          {compareAt > price && (
            <span className="text-xs sm:text-sm line-through font-light" style={{ color: INK_SOFT }}>
              {formatINR(compareAt)}
            </span>
          )}
          {discountPct > 0 && (
            <span className="text-xs font-medium" style={{ color: GOLD_DEEP }}>
              {discountPct}% off
            </span>
          )}
        </div>
      </Link>

      {/* Size chips — only when the card can add straight to cart */}
      {!outOfStock && !needsProductPage && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Select size">
          {sizes.map((s) => {
            const soldOut = s.stock <= 0;
            const active = selectedSize === s.size;
            return (
              <button
                key={s.size}
                type="button"
                disabled={soldOut}
                onClick={() => setSelectedSize(s.size)}
                aria-pressed={active}
                className="min-w-[30px] h-7 px-2 text-[11px] font-medium transition-colors"
                style={{
                  borderRadius: '4px',
                  border: `1px solid ${active ? GOLD : LINE}`,
                  background: active ? BLUSH : PAPER,
                  color: soldOut ? DISABLED : INK,
                  fontWeight: active ? 600 : 500,
                  textDecoration: soldOut ? 'line-through' : 'none',
                  cursor: soldOut ? 'not-allowed' : 'pointer',
                }}
              >
                {s.size}
              </button>
            );
          })}
        </div>
      )}

      {/* Actions — stacked on small screens, side by side from sm up */}
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        {outOfStock ? (
          <button
            type="button"
            disabled
            className={`${BTN_BASE} w-full`}
            style={{ background: LINE, color: INK_SOFT }}
          >
            Out of stock
          </button>
        ) : needsProductPage ? (
          <Link href={href} className={BTN_BUY}>
            Choose options
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={handleAddToCart}
              className={added ? BTN_CART_ADDED : BTN_CART}
            >
              {added ? (
                <Check size={16} strokeWidth={2} className={ICON_CLASS} />
              ) : (
                <ShoppingBag size={16} strokeWidth={1.5} className={ICON_CLASS} />
              )}
              {added ? 'Added' : 'Add to cart'}
            </button>

            <button type="button" onClick={handleBuyNow} className={BTN_BUY}>
              Buy now
            </button>
          </>
        )}
      </div>
    </div>
  );
}