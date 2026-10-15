// LEGACY server-side upload route.
// Every byte passes through Vercel, which costs CPU and bandwidth.
// Prefer uploadImage()/uploadFiles() from lib/uploadClient.js (direct-to-R2).
// If nothing calls this route any more, DELETE this file.
//
// Until then it is locked down: admin only, image types only, 5 MB max.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
const MAX_BYTES = 5 * 1024 * 1024;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export const POST = requireAdmin(async (req) => {
  try {
    // Reject oversized bodies before reading them
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const rawFolder = String(formData.get('folder') || 'uploads');
    const folder = /^[a-z0-9_-]{1,40}$/i.test(rawFolder) ? rawFolder : 'uploads';

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: 'Unsupported file type. Use JPG, PNG, WebP, GIF or AVIF.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `${folder}/${randomUUID()}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
    return NextResponse.json({ url: `${base}/${key}`, publicId: key });
  } catch (err) {
    console.error('R2 upload failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
});