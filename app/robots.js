const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.samrajboutique.com').replace(/\/$/, '');

export default function robots() {
  // Private / low-value paths that should never be crawled
  const disallow = [
    '/admin',
    '/api/',
    '/cart',
    '/checkout',
    '/account',
    '/orders',
    '/login',
    '/register',
    // Parameter URLs that create duplicate content (adjust to the params you actually use)
    '/*?*sort=',
    '/*?*utm_',
    '/*?*sessionid=',
  ];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}