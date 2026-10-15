// ProductCard only uses the FIRST variant and its FIRST image.
// Trimming the rest before the product goes to a client component keeps the
// page HTML / RSC payload small (faster to download, parse and hydrate).
// Use it on list pages only, never where you need every variant.
export function slimProduct(p) {
  return {
    ...p,
    variants: p.variants?.slice(0, 1).map((v) => ({
      ...v,
      images: v.images?.slice(0, 1),
    })),
  };
}