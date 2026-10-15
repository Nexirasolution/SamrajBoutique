import './globals.css';
import { cache } from 'react';
import { Playfair_Display, Poppins } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { CartProvider } from '@/components/CartContext';
import { WishlistProvider } from '@/components/WhishlistContext';
// import BottomNav from '@/components/BottomNav';
import { dbConnect } from '@/lib/mongodb';
import Settings from '@/models/Settings';

/* ---------- Fonts (display: 'swap' avoids invisible text -> better LCP/CLS) ---------- */
const display = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
  display: 'swap',
});
const body = Poppins({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

/* ---------- Constants ---------- */
const SITE_NAME = 'Samraj Boutique';
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.samrajboutique.com').replace(/\/$/, '');
const DEFAULT_TITLE = 'Samraj Boutique - Women Kurtis, Nighties & More';
const DEFAULT_DESCRIPTION =
  'Shop authentic women kurtis, nighties, innerwear and trending collections online from Samraj Boutique.';
const DEFAULT_KEYWORDS = [
  'women kurtis online',
  'kurtis for women',
  'cotton kurtis',
  'designer kurtis',
  'nighties online',
  'night wear for women',
  'innerwear online',
  'ladies boutique online',
  'Samraj Boutique',
  'women fashion India',
];
const DEFAULT_OG_IMAGE = '/og-image.jpg'; // put a 1200x630 image in /public

/* ---------- Single cached DB read shared by metadata + JSON-LD (one query per request) ---------- */
const getSettings = cache(async () => {
  try {
    await dbConnect();
    return await Settings.findOne({ key: 'global' }).lean();
  } catch {
    return null;
  }
});

/* ---------- Metadata ---------- */
export async function generateMetadata() {
  const settings = await getSettings();

  const title = settings?.seoTitle || DEFAULT_TITLE;
  const description = settings?.seoDescription || DEFAULT_DESCRIPTION;
  const ogImage = settings?.seoImage || DEFAULT_OG_IMAGE;

  const extraKeywords = Array.isArray(settings?.seoKeywords)
    ? settings.seoKeywords
    : typeof settings?.seoKeywords === 'string'
    ? settings.seoKeywords.split(',').map((k) => k.trim()).filter(Boolean)
    : [];
  const keywords = [...new Set([...extraKeywords, ...DEFAULT_KEYWORDS])];

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${SITE_NAME}` },
    description,
    keywords,
    applicationName: SITE_NAME,
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: 'fashion',
    generator: 'Next.js',

    // Prevents phones from auto-linking numbers/emails in product text
    formatDetection: { email: false, address: false, telephone: false },

    // Canonical + language targeting (child pages can override `alternates.canonical`)
    alternates: {
      canonical: '/',
      languages: { 'en-IN': '/' },
    },

    openGraph: {
      title,
      description,
      url: SITE_URL,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_IN',
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${SITE_NAME} - Women's Fashion` }],
    },

    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
      ...(process.env.NEXT_PUBLIC_TWITTER_HANDLE && {
        site: process.env.NEXT_PUBLIC_TWITTER_HANDLE,
        creator: process.env.NEXT_PUBLIC_TWITTER_HANDLE,
      }),
    },

    robots: {
      index: true,
      follow: true,
      nocache: false,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },

    icons: {
      icon: [{ url: '/favicon.ico' }],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    },
    manifest: '/manifest.webmanifest',

    // Set these env vars after verifying the site in each console
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
      other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
        ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
        : undefined,
    },
  };
}

/* ---------- Viewport (theme color, mobile scaling) ---------- */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5, // keep zoom enabled for accessibility
  themeColor: '#8B0000',
};

/* ---------- Root layout ---------- */
export default async function RootLayout({ children }) {
  const settings = await getSettings();

  const sameAs = [
    settings?.instagramUrl,
    settings?.facebookUrl,
    settings?.youtubeUrl,
    settings?.whatsappUrl,
  ].filter(Boolean);

  // Structured data: Organization + WebSite (with sitelinks search box)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
        description: settings?.seoDescription || DEFAULT_DESCRIPTION,
        ...(settings?.phone && {
          contactPoint: {
            '@type': 'ContactPoint',
            telephone: settings.phone,
            contactType: 'customer service',
            areaServed: 'IN',
            availableLanguage: ['en', 'ta'],
          },
        }),
        ...(sameAs.length && { sameAs }),
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: 'en-IN',
        publisher: { '@id': `${SITE_URL}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          // Update the path to match your real search route
          target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <html lang="en-IN">
      <head>
        {/* Speeds up first request to image/CDN hosts; edit to match your image host */}
        {process.env.NEXT_PUBLIC_IMAGE_HOST && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_IMAGE_HOST} crossOrigin="anonymous" />
        )}
        <script
          type="application/ld+json"
          // '<' is escaped so the JSON can never break out of the script tag
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </head>
      <body
        className={`${display.variable} ${body.variable} font-body antialiased`}
        style={{ background: '#fdf5f5' }}
      >
        <CartProvider>
          <WishlistProvider>
            {children}

            {/* spacer so page content isn't hidden behind the fixed mobile nav */}
            <div className="md:hidden h-16" aria-hidden="true" />

            {/* <BottomNav /> */}
          </WishlistProvider>
        </CartProvider>

        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-body)',
              background: '#fff',
              color: '#8B0000',
              border: '1.5px solid #C9A84C',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
            },
            success: { iconTheme: { primary: '#8B0000', secondary: '#fff' } },
            error: { iconTheme: { primary: '#C9A84C', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  );
}