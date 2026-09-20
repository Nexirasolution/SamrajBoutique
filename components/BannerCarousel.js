'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Design tokens — shared black/white/gold system
const INK = '#000000';
const GOLD = '#C9A227';
const PAPER = '#FFFFFF';

export default function BannerCarousel({ banners }) {
  const [index, setIndex] = useState(0);

  // Autoplay. Depends on `index` so the timer restarts after a manual
  // arrow/dot click instead of skipping right after it.
  useEffect(() => {
    if (!banners?.length || banners.length < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % banners.length), 4500);
    return () => clearTimeout(t);
  }, [banners, index]);

  if (!banners?.length) return null;

  return (
    <section className="relative w-full overflow-hidden" style={{ background: PAPER }}>
      {/*
        One image per banner (the desktop image), used on every screen size.
        The frame has a fixed aspect ratio and the image fills it with
        object-cover, so there are never gaps on mobile or desktop:
          mobile  -> 16:9 (less side-cropping than a tall box)
          sm+     -> ~2.375:1 (same 42.1% ratio as before)
      */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[100/42.1]">

        {banners.map((b, i) => (
          <Link
            key={b._id}
            href={b.link || '#'}
            className={`absolute inset-0 block transition-opacity duration-700 ${
              i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
            } ${!b.link ? 'pointer-events-none' : ''}`}
            tabIndex={i === index ? 0 : -1}
            aria-hidden={i !== index}
          >
            <img
              src={b.image}
              alt={b.title || 'Banner'}
              className="absolute inset-0 w-full h-full object-cover object-center select-none"
              draggable={false}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </Link>
        ))}

        {banners.length > 1 && (
          <>
            {/* Arrows — white with a thin gold outline so they read on any banner image */}
            <button
              onClick={() => setIndex((i) => (i - 1 + banners.length) % banners.length)}
              className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-full transition z-10"
              style={{ background: PAPER, color: INK, border: `1px solid ${GOLD}` }}
              aria-label="Previous"
            >
              <ChevronLeft size={15} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setIndex((i) => (i + 1) % banners.length)}
              className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-full transition z-10"
              style={{ background: PAPER, color: INK, border: `1px solid ${GOLD}` }}
              aria-label="Next"
            >
              <ChevronRight size={15} strokeWidth={1.5} />
            </button>

            {/* Thin dash indicators — bottom-anchored on both mobile and desktop */}
            <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  className="rounded-full transition-all"
                  style={{
                    height: '3px',
                    width: i === index ? '22px' : '10px',
                    background: i === index ? GOLD : 'rgba(255,255,255,0.7)',
                    boxShadow: i === index ? '0 0 0 1px rgba(0,0,0,0.25)' : '0 0 0 1px rgba(0,0,0,0.15)',
                  }}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}