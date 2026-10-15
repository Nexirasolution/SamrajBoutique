// Browser-side image pipeline. Vercel never sees image bytes and never
// resizes images: we generate every size we need HERE, once, at upload time,
// and push them straight to R2 (served by Cloudflare's CDN).
//
// Per uploaded image we store:
//   <uuid>_full.webp  (max 1600px wide)  <- this URL is what goes in the DB
//   <uuid>_800.webp
//   <uuid>_400.webp
// lib/imageLoader.js maps next/image widths onto these files.

// ---- Tunables ---------------------------------------------------------
const FULL_WIDTH = 1600;
const VARIANT_WIDTHS = [400, 800]; // must match presign route + lib/imageLoader.js
const FULL_QUALITY = 0.82;
const VARIANT_QUALITY = 0.8;
const OPTIMIZE_CONCURRENCY = 2; // CPU heavy, keep low for phones
const UPLOAD_CONCURRENCY = 6;
const PRESIGN_BATCH = 50; // must be <= server MAX_FILES_PER_REQUEST
const RETRIES = 2;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

// ---- Helpers ----------------------------------------------------------
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  });

  await Promise.all(runners);
  return results;
}

async function readError(res, fallback) {
  try {
    const data = await res.json();
    if (data?.error) return data.error;
  } catch {
    /* body was not JSON */
  }
  if (res.status === 401 || res.status === 403) return 'Session expired — please log in again';
  return `${fallback} (status ${res.status})`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Image optimisation (decode once, encode every size) ---------------
async function encode(bitmap, targetWidth, type, quality) {
  const scale = Math.min(1, targetWidth / bitmap.width); // never upscale
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  canvas.width = canvas.height = 0; // release memory (matters on iOS/Android)
  return blob;
}

/** @returns {{ full: Blob, variants: { width: number, blob: Blob }[] }} */
export async function optimizeImage(file) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(`${file.name}: unsupported file type. Use JPG, PNG, WebP, GIF or AVIF.`);
  }
  // Animated GIFs would lose frames — upload as-is
  if (file.type === 'image/gif') return { full: file, variants: [] };

  let bitmap;
  try {
    bitmap = await createImageBitmap(file); // also applies EXIF rotation
  } catch {
    throw new Error(`${file.name}: could not read this image. Try a JPG, PNG or WebP.`);
  }

  try {
    let type = 'image/webp';
    let full = await encode(bitmap, FULL_WIDTH, type, FULL_QUALITY);
    // Some browsers can't encode WebP and silently return PNG — fall back to JPEG
    if (!full || full.type !== 'image/webp') {
      type = 'image/jpeg';
      full = await encode(bitmap, FULL_WIDTH, type, FULL_QUALITY);
    }
    if (!full) throw new Error(`${file.name}: image processing failed`);

    const variants = [];
    for (const width of VARIANT_WIDTHS) {
      const blob = await encode(bitmap, width, type, VARIANT_QUALITY);
      if (!blob) throw new Error(`${file.name}: image processing failed`);
      variants.push({ width, blob });
    }
    return { full, variants };
  } finally {
    bitmap.close?.();
  }
}

// ---- Direct upload to R2 ----------------------------------------------
async function putToR2(uploadUrl, blob) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      if (res.ok) return;
      lastErr = new Error(`Storage rejected the upload (status ${res.status})`);
      if (res.status < 500 && res.status !== 429) break; // 4xx won't fix itself
    } catch {
      lastErr = new Error('Network error while uploading — check your connection');
    }
    await sleep(500 * 2 ** attempt);
  }
  throw lastErr;
}

/**
 * Upload many images to R2 with zero Vercel CPU for image work.
 * 1. resize/compress in the browser  2. get signed URLs (one small JSON call)
 * 3. PUT every size straight to R2 in parallel.
 *
 * @param {File[]} files
 * @param {{ folder?: string, onProgress?: (p: {phase: 'optimize'|'upload', done: number, total: number}) => void }} opts
 * @returns {Promise<string[]>} public URL of each image's main file, same order as `files`
 */
export async function uploadFiles(files, { folder = 'uploads', onProgress } = {}) {
  if (!files.length) return [];
  const total = files.length;

  // 1. Optimise
  let optimized = 0;
  onProgress?.({ phase: 'optimize', done: 0, total });
  const items = await pool(files, OPTIMIZE_CONCURRENCY, async (f) => {
    const out = await optimizeImage(f);
    onProgress?.({ phase: 'optimize', done: ++optimized, total });
    return out;
  });

  // 2. Presign (batched — usually a single request)
  const slots = [];
  for (let i = 0; i < items.length; i += PRESIGN_BATCH) {
    const chunk = items.slice(i, i + PRESIGN_BATCH);
    const res = await fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder,
        files: chunk.map((it) => ({
          contentType: it.full.type,
          variants: it.variants.map((v) => v.width),
        })),
      }),
    });
    if (!res.ok) throw new Error(await readError(res, 'Could not start upload'));
    const { uploads } = await res.json();
    slots.push(...uploads);
  }

  // 3. Flatten into one task list and upload in parallel
  const tasks = [];
  const remaining = items.map((it) => 1 + it.variants.length);
  items.forEach((it, i) => {
    tasks.push({ img: i, url: slots[i].uploadUrl, blob: it.full });
    it.variants.forEach((v, j) => {
      tasks.push({ img: i, url: slots[i].variants[j].uploadUrl, blob: v.blob });
    });
  });

  let uploaded = 0;
  onProgress?.({ phase: 'upload', done: 0, total });
  await pool(tasks, UPLOAD_CONCURRENCY, async (t) => {
    await putToR2(t.url, t.blob);
    if (--remaining[t.img] === 0) onProgress?.({ phase: 'upload', done: ++uploaded, total });
  });

  return slots.map((s) => s.url);
}

/** Single-image convenience wrapper — use this in any other form. */
export async function uploadImage(file, opts) {
  const [url] = await uploadFiles([file], opts);
  return url;
}