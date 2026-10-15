'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Design tokens: shared black/white/gold system
const INK = '#000000';
const GOLD = '#C9A227';
const PAPER = '#FFFFFF';

const INTERVAL_MS = 4500;
const PRELOAD_NEXT_AFTER_MS = 1500; // let the first banner (LCP) finish before fetching others

export default function BannerCarousel({ banners }) {
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState(() => new Set([0]));
  const [ready, setReady] = useState(false);
  const count = banners?.length || 0;

  // Only start fetching the 2nd banner after the 1st has had a head start
  useEffect(() => {
    const t = setTimeout(() => setReady(true), PRELOAD_NEXT_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  // Remember which slides were shown so they stay mounted (no re-fetch flicker)
  useEffect(() => {
    setVisited((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
  }, [index]);

  // Autoplay. Depends on `index` so the timer restarts after a manual click.
  useEffect(() => {
    if (count < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [count, index]);

  if (!count) return null;

  const next = (index + 1) % count;

  return (
    <section className="relative w-full overflow-hidden" style={{ background: PAPER }}>
      {/*
        One image per banner, used on every screen size. Fixed aspect-ratio frame
        + object-cover, so there are never gaps and no layout shift:
          mobile -> 16:9, sm+ -> ~2.375:1
      */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[100/42.1]">
        {banners.map((b, i) => {
          const mount = i === index || visited.has(i) || (ready && i === next);
          return (
            <Link
              key={b._id}
              href={b.link || '#'}
              className={`absolute inset-0 block transition-opacity duration-700 ${
                i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
              } ${!b.link ? 'pointer-events-none' : ''}`}
              tabIndex={i === index ? 0 : -1}
              aria-hidden={i !== index}
            >
              {mount && (
                <Image
                  src={b.image}
                  alt={b.title || 'Banner'}
                  fill
                  sizes="100vw"
                  // First banner is the LCP element: preload it with high priority.
                  // Others load normally, and only once mounted (see above).
                  priority={i === 0}
                  className="object-cover object-center select-none"
                  draggable={false}
                />
              )}
            </Link>
          );
        })}

        {count > 1 && (
          <>
            {/* Arrows: white with a thin gold outline so they read on any banner image */}
            <button
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
              className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-full transition z-10"
              style={{ background: PAPER, color: INK, border: `1px solid ${GOLD}` }}
              aria-label="Previous"
            >
              <ChevronLeft size={15} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setIndex((i) => (i + 1) % count)}
              className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-full transition z-10"
              style={{ background: PAPER, color: INK, border: `1px solid ${GOLD}` }}
              aria-label="Next"
            >
              <ChevronRight size={15} strokeWidth={1.5} />
            </button>

            {/* Thin dash indicators */}
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