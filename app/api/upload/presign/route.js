import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const maxDuration = 10;

// Must match CACHE_CONTROL in lib/uploadClient.js (it is part of the signature)
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const MAX_FILES_PER_REQUEST = 50;
const URL_TTL_SECONDS = 600; // 10 min — enough for slow mobile connections

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const publicBase = () => (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// POST /api/upload/presign
// body: { folder?: string, files: [{ contentType: 'image/jpeg' }, ...] }
// returns: { uploads: [{ uploadUrl, url, key }, ...] }  (same order as files)
//
// Only tiny JSON passes through Vercel. The browser PUTs the actual image
// straight to Cloudflare R2 using the signed URL.
export const POST = requireAdmin(async (req) => {
  try {
    const body = await req.json();
    const files = Array.isArray(body.files) ? body.files : [];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files specified' }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Max ${MAX_FILES_PER_REQUEST} files per request` },
        { status: 400 }
      );
    }

    // Folder is used in the object key — keep it to safe characters only
    const rawFolder = typeof body.folder === 'string' ? body.folder : 'uploads';
    const folder = /^[a-z0-9_-]{1,40}$/i.test(rawFolder) ? rawFolder : 'uploads';

    for (const f of files) {
      if (!ALLOWED_TYPES[f?.contentType]) {
        return NextResponse.json(
          { error: `Unsupported file type: ${f?.contentType || 'unknown'}. Use JPG, PNG, WebP, GIF or AVIF.` },
          { status: 400 }
        );
      }
    }

    const uploads = await Promise.all(
      files.map(async ({ contentType }) => {
        const key = `${folder}/${randomUUID()}.${ALLOWED_TYPES[contentType]}`;
        const uploadUrl = await getSignedUrl(
          s3,
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            ContentType: contentType,
            CacheControl: CACHE_CONTROL,
          }),
          { expiresIn: URL_TTL_SECONDS }
        );
        return { uploadUrl, url: `${publicBase()}/${key}`, key };
      })
    );

    return NextResponse.json({ uploads });
  } catch (err) {
    console.error('POST /api/upload/presign error:', err);
    return NextResponse.json({ error: 'Could not prepare upload' }, { status: 500 });
  }
});