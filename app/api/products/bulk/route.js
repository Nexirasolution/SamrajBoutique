import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import slugify from 'slugify';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const maxDuration = 30;

// POST /api/products/bulk
// body: {
//   category, skuPrefix, description, fabric,
//   price, compareAtPrice, sizes: [{ size, stock }],
//   images: [url, ...],            // already uploaded to R2 by the browser
//   tags, isReadyToShip,
//   sizeChart: [url, ...],
//   sleeveOptions: [...], zipOptions: [...]
// }
//
// Creates ONE product per image. Only small JSON passes through here —
// image bytes never touch Vercel.
//
// - Title = category name (A-Z0-9) + zero-padded number, continuing from the
//   highest existing number in that category.
// - SKU   = admin-typed code + zero-padded number, continuing from the
//   highest existing number globally (SKU is globally unique).
// - Everything else is applied identically to every product in the batch.
// - Pant/Shawl add-ons are per-product: set them on each product's edit page.

const MAX_IMAGES = 100;
const ALLOWED_SLEEVE = ['Full Sleeve', 'Half Sleeve', 'Elbow Sleeve', 'Sleeveless'];
const ALLOWED_ZIP = ['With Zip', 'Without Zip'];

const publicBase = () => (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
// Only accept image URLs that point at our own bucket
const isOurUrl = (u) =>
  typeof u === 'string' && u.length > 0 && (!publicBase() || u.startsWith(`${publicBase()}/`));

const maxNumber = (docs, field, re) => {
  let max = 0;
  for (const d of docs) {
    const m = d[field]?.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
};

export const POST = requireAdmin(async (req) => {
  try {
    const body = await req.json();

    const {
      category,
      skuPrefix,
      description = '',
      fabric = '',
      price,
      compareAtPrice = 0,
      sizes = [],
      images = [],
      tags = [],
      isReadyToShip = false,
      sizeChart = [],
      sleeveOptions = [],
      zipOptions = [],
    } = body;

    // ---- Cheap validation first (no DB hit) ----
    if (!category) return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    if (!skuPrefix?.trim()) return NextResponse.json({ error: 'SKU code is required' }, { status: 400 });
    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'At least one image is required' }, { status: 400 });
    }
    if (images.length > MAX_IMAGES) {
      return NextResponse.json({ error: `Max ${MAX_IMAGES} products per batch` }, { status: 400 });
    }
    if (!images.every(isOurUrl)) {
      return NextResponse.json({ error: 'Invalid image URL in request' }, { status: 400 });
    }
    if (!price || Number(price) <= 0) return NextResponse.json({ error: 'Price is required' }, { status: 400 });

    const sizeEntries = (Array.isArray(sizes) ? sizes : [])
      .filter((s) => s?.size)
      .map((s) => ({ size: String(s.size), stock: Number(s.stock) || 0 }));
    if (sizeEntries.length === 0) {
      return NextResponse.json({ error: 'At least one size with stock is required' }, { status: 400 });
    }

    const sizeChartImages = (Array.isArray(sizeChart) ? sizeChart : sizeChart ? [sizeChart] : []).filter(isOurUrl);
    const sleeveOptionsClean = Array.isArray(sleeveOptions) ? sleeveOptions.filter((s) => ALLOWED_SLEEVE.includes(s)) : [];
    const zipOptionsClean = Array.isArray(zipOptions) ? zipOptions.filter((z) => ALLOWED_ZIP.includes(z)) : [];

    const skuCode = skuPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!skuCode) return NextResponse.json({ error: 'SKU code must contain letters/numbers' }, { status: 400 });

    // ---- DB ----
    await dbConnect();

    const cat = await Category.findById(category).select('name').lean();
    if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    const titleCode = (cat.name || 'PRODUCT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!titleCode) {
      return NextResponse.json(
        { error: 'Category name must contain letters/numbers to generate a title' },
        { status: 400 }
      );
    }

    // Both numbering lookups in parallel, lean = no Mongoose hydration
    const [existingTitles, existingSkus] = await Promise.all([
      Product.find({ category: cat._id, name: { $regex: `^${titleCode}\\d+$`, $options: 'i' } })
        .select('name')
        .lean(),
      Product.find({ sku: { $regex: `^${skuCode}\\d+$`, $options: 'i' } })
        .select('sku')
        .lean(),
    ]);

    const maxTitleNum = maxNumber(existingTitles, 'name', new RegExp(`^${titleCode}(\\d+)$`, 'i'));
    const maxSkuNum = maxNumber(existingSkus, 'sku', new RegExp(`^${skuCode}(\\d+)$`, 'i'));

    // ---- Build every candidate in memory ----
    const candidates = images.map((image, i) => {
      const name = `${titleCode}${String(maxTitleNum + i + 1).padStart(3, '0')}`;
      const sku = `${skuCode}${String(maxSkuNum + i + 1).padStart(3, '0')}`;
      return { image, name, sku, slug: slugify(name, { lower: true }) };
    });

    // One query for all collisions instead of 2 queries per product
    const taken = await Product.find({
      $or: [
        { slug: { $in: candidates.map((c) => c.slug) } },
        { sku: { $in: candidates.map((c) => c.sku) } },
      ],
    })
      .select('slug sku')
      .lean();
    const takenSlugs = new Set(taken.map((t) => t.slug));
    const takenSkus = new Set(taken.map((t) => t.sku));

    const errors = [];
    const valid = [];

    for (const c of candidates) {
      if (takenSlugs.has(c.slug)) {
        errors.push({ name: c.name, error: 'A product with this generated name/slug already exists — skipped' });
        continue;
      }
      if (takenSkus.has(c.sku)) {
        errors.push({ name: c.name, error: `Generated SKU ${c.sku} already exists — skipped` });
        continue;
      }

      const doc = new Product({
        name: c.name,
        slug: c.slug,
        sku: c.sku,
        description,
        category: cat._id,
        fabric,
        tags,
        variants: [
          {
            color: '',
            colorHex: '#000000',
            images: [c.image],
            price: Number(price),
            compareAtPrice: Number(compareAtPrice) || 0,
            sizes: sizeEntries.map((s) => ({ ...s })),
          },
        ],
        basePrice: Number(price),
        isReadyToShip: !!isReadyToShip,
        sizeChart: sizeChartImages,
        sleeveOptions: sleeveOptionsClean,
        zipOptions: zipOptionsClean,
      });

      // Schema validation in memory — one bad doc can't sink the batch
      const vErr = doc.validateSync();
      if (vErr) {
        errors.push({ name: c.name, error: vErr.message });
        continue;
      }
      valid.push({ name: c.name, doc });
    }

    // ---- Single bulk write ----
    const created = [];
    if (valid.length > 0) {
      let insertedIds = new Set();
      let writeMsgs = new Map();

      try {
        const inserted = await Product.insertMany(
          valid.map((v) => v.doc),
          { ordered: false }
        );
        insertedIds = new Set(inserted.map((d) => String(d._id)));
      } catch (err) {
        // Unordered insert: some docs may still have been written (e.g. a race on a unique key)
        insertedIds = new Set((err.insertedDocs || []).map((d) => String(d._id)));
        for (const w of err.writeErrors || []) {
          const idx = w.index ?? w.err?.index;
          const msg = w.errmsg || w.err?.errmsg || err.message;
          if (idx !== undefined) writeMsgs.set(idx, msg);
        }
        if (!err.insertedDocs && !err.writeErrors) throw err;
      }

      valid.forEach((v, idx) => {
        if (insertedIds.has(String(v.doc._id))) {
          created.push({ id: v.doc._id, name: v.doc.name, sku: v.doc.sku });
        } else {
          errors.push({ name: v.name, error: writeMsgs.get(idx) || 'Failed to save' });
        }
      });
    }

    return NextResponse.json(
      { createdCount: created.length, created, errors },
      { status: created.length ? 201 : 400 }
    );
  } catch (err) {
    console.error('POST /api/products/bulk error:', err);
    return NextResponse.json({ error: err.message || 'Bulk upload failed' }, { status: 500 });
  }
});