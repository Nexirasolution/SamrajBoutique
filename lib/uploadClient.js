import imageCompression from 'browser-image-compression';

// ---- Tunables ---------------------------------------------------------
const MAX_DIMENSION = 2000;          // px, longest side
const MAX_SIZE_MB = 1;               // target size after compression
const SKIP_BELOW_BYTES = 400 * 1024; // already small — don't re-encode
const OPTIMIZE_CONCURRENCY = 2;      // CPU heavy, keep low for phones
const UPLOAD_CONCURRENCY = 4;
const PRESIGN_BATCH = 50;            // must be <= server MAX_FILES_PER_REQUEST
const RETRIES = 2;

// Must match CACHE_CONTROL in app/api/upload/presign/route.js
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

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

// ---- Image optimisation ----------------------------------------------
export async function optimizeImage(file) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(`${file.name}: unsupported file type. Use JPG, PNG, WebP, GIF or AVIF.`);
  }
  // Animated GIFs would lose frames; tiny files aren't worth re-encoding
  if (file.type === 'image/gif' || file.size < SKIP_BELOW_BYTES) return file;

  try {
    const out = await imageCompression(file, {
      maxSizeMB: MAX_SIZE_MB,
      maxWidthOrHeight: MAX_DIMENSION,
      useWebWorker: true,
      fileType: 'image/webp',
      initialQuality: 0.85,
    });
    return out.size < file.size ? out : file;
  } catch {
    return file; // fall back to the original if compression fails
  }
}

// ---- Direct upload to R2 ----------------------------------------------
async function putToR2(uploadUrl, file) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'Cache-Control': CACHE_CONTROL },
        body: file,
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
 * Upload many images to R2 without sending any file bytes through Vercel.
 * 1. compress in the browser  2. get signed URLs (one small JSON request)
 * 3. PUT files straight to R2 in parallel.
 *
 * @param {File[]} files
 * @param {{ folder?: string, onProgress?: (p: {phase: 'optimize'|'upload', done: number, total: number}) => void }} opts
 * @returns {Promise<string[]>} public URLs, same order as `files`
 */
export async function uploadFiles(files, { folder = 'uploads', onProgress } = {}) {
  if (!files.length) return [];
  const total = files.length;

  // 1. Optimise
  let optimized = 0;
  onProgress?.({ phase: 'optimize', done: 0, total });
  const ready = await pool(files, OPTIMIZE_CONCURRENCY, async (f) => {
    const out = await optimizeImage(f);
    onProgress?.({ phase: 'optimize', done: ++optimized, total });
    return out;
  });

  // 2. Presign (batched — usually a single request)
  const slots = [];
  for (let i = 0; i < ready.length; i += PRESIGN_BATCH) {
    const chunk = ready.slice(i, i + PRESIGN_BATCH);
    const res = await fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder,
        files: chunk.map((f) => ({ contentType: f.type })),
      }),
    });
    if (!res.ok) throw new Error(await readError(res, 'Could not start upload'));
    const { uploads } = await res.json();
    slots.push(...uploads);
  }

  // 3. Upload directly to R2
  let uploaded = 0;
  onProgress?.({ phase: 'upload', done: 0, total });
  await pool(ready, UPLOAD_CONCURRENCY, async (f, i) => {
    await putToR2(slots[i].uploadUrl, f);
    onProgress?.({ phase: 'upload', done: ++uploaded, total });
  });

  return slots.map((s) => s.url);
}

/** Single-image convenience wrapper — use this in any other form. */
export async function uploadImage(file, opts) {
  const [url] = await uploadFiles([file], opts);
  return url;
}