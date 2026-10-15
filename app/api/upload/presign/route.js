import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const maxDuration = 10;

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

// Must match VARIANT_WIDTHS in lib/uploadClient.js and lib/imageLoader.js
const ALLOWED_VARIANTS = [400, 800];

const MAX_FILES_PER_REQUEST = 50;
const URL_TTL_SECONDS = 600; // 10 min — enough for slow mobile connections

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  // R2 rejects the extra checksum params newer AWS SDK versions add to presigned URLs
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const publicBase = () => (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// POST /api/upload/presign
// body: { folder?, files: [{ contentType, variants?: [400, 800] }, ...] }
// returns: { uploads: [{ uploadUrl, url, key, variants: [{ width, uploadUrl, url }] }] }
//
// Keys per image:  <folder>/<uuid>_full.<ext>, <uuid>_400.<ext>, <uuid>_800.<ext>
// Only tiny JSON passes through Vercel. The browser PUTs every file straight to R2.
export const POST = requireAdmin(async (req) => {
  try {
    const body = await req.json();
    const files = Array.isArray(body.files) ? body.files : [];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files specified' }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ error: `Max ${MAX_FILES_PER_REQUEST} files per request` }, { status: 400 });
    }

    const rawFolder = typeof body.folder === 'string' ? body.folder : 'uploads';
    const folder = /^[a-z0-9_-]{1,40}$/i.test(rawFolder) ? rawFolder : 'uploads';

    for (const f of files) {
      if (!ALLOWED_TYPES[f?.contentType]) {
        return NextResponse.json(
          { error: `Unsupported file type: ${f?.contentType || 'unknown'}. Use JPG, PNG, WebP, GIF or AVIF.` },
          { status: 400 }
        );
      }
      const v = f.variants ?? [];
      if (!Array.isArray(v) || !v.every((w) => ALLOWED_VARIANTS.includes(w))) {
        return NextResponse.json({ error: 'Invalid image variant requested' }, { status: 400 });
      }
    }

    const base = publicBase();

    const uploads = await Promise.all(
      files.map(async ({ contentType, variants = [] }) => {
        const ext = ALLOWED_TYPES[contentType];
        const prefix = `${folder}/${randomUUID()}`;

        const sign = (key) =>
          getSignedUrl(
            s3,
            new PutObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME,
              Key: key,
              ContentType: contentType,
            }),
            { expiresIn: URL_TTL_SECONDS }
          );

        const key = `${prefix}_full.${ext}`;
        const [uploadUrl, ...variantUrls] = await Promise.all([
          sign(key),
          ...variants.map((w) => sign(`${prefix}_${w}.${ext}`)),
        ]);

        return {
          uploadUrl,
          url: `${base}/${key}`,
          key,
          variants: variants.map((w, i) => ({
            width: w,
            uploadUrl: variantUrls[i],
            url: `${base}/${prefix}_${w}.${ext}`,
          })),
        };
      })
    );

    return NextResponse.json({ uploads });
  } catch (err) {
    console.error('POST /api/upload/presign error:', err);
    return NextResponse.json({ error: 'Could not prepare upload' }, { status: 500 });
  }
});