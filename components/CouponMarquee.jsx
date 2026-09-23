'use client';

import { useEffect, useState } from 'react';
import { Tag, Truck } from 'lucide-react';

// Theme: Wine + Champagne Gold — keep in sync with ProductCard,
// ProductPage and Navbar. Deep wine announcement bar; text is warm
// cream for contrast, gold is used for the rule, separators and code underline.
const BAR = '#5E1F2E';        // Wine
const INK = '#F5E9E3';        // text (cream, readable on wine)
const INK_SOFT = '#D8B3B9';   // secondary text (min-order note)
const GOLD = '#D6B56D';       // Champagne Gold — rule, separators, underline
const GOLD_DEEP = '#EFCB7D';  // icons / coupon code (readable on wine)

// A quiet serif, matched to the wordmark used elsewhere on the site,
// so the marquee reads as part of the same brand rather than generic UI text.
const FONT = "Georgia, 'Times New Roman', serif";

export default function CouponMarquee() {
  const [coupons, setCoupons] = useState([]);
  const [freeShippingAbove, setFreeShippingAbove] = useState(null);

  useEffect(() => {
    fetch('/api/coupons?active=true')
      .then((r) => r.json())
      .then((d) => setCoupons(d.coupons || []))
      .catch(() => {});

    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => setFreeShippingAbove(d.settings?.freeShippingAbove ?? null))
      .catch(() => {});
  }, []);

  const freeShippingItem =
    freeShippingAbove != null ? { type: 'freeshipping', minOrderValue: freeShippingAbove } : null;

  const allItems = freeShippingItem ? [...coupons, freeShippingItem] : coupons;
  if (!allItems.length) return null;

  const items = [...allItems, ...allItems];

  return (
    <div
      className="relative overflow-hidden py-2"
      style={{ background: BAR, borderBottom: `1px solid ${GOLD}` }}
    >
      {/* Fade edges */}
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 z-10"
        style={{ background: `linear-gradient(to right, ${BAR}, transparent)` }}
      />
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10"
        style={{ background: `linear-gradient(to left, ${BAR}, transparent)` }}
      />

      <div className="flex animate-marquee whitespace-nowrap w-max">
        {items.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 mx-8 text-[12px] tracking-[0.3px]"
            style={{ color: INK, fontFamily: FONT }}
          >
            {i > 0 && <span className="mr-4" style={{ color: GOLD }}>—</span>}

            {c.type === 'freeshipping' ? (
              <>
                <Truck size={12} strokeWidth={1.5} className="shrink-0" style={{ color: GOLD_DEEP }} />
                Free shipping on orders above ₹{c.minOrderValue}
              </>
            ) : (
              <>
                <Tag size={12} strokeWidth={1.5} className="shrink-0" style={{ color: GOLD_DEEP }} />
                Use{' '}
                <span
                  className="italic px-1.5"
                  style={{ color: GOLD_DEEP, borderBottom: `1px solid ${GOLD}` }}
                >
                  {c.code}
                </span>
                {' '}for{' '}
                {c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`}
                {c.minOrderValue > 0 && (
                  <span style={{ color: INK_SOFT }}> on orders above ₹{c.minOrderValue}</span>
                )}
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}