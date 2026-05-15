import { Injectable, Logger } from '@nestjs/common';
import {
  ALLOWED_RESUME_MIME_TYPES,
  RESUME_MAX_SIZE_BYTES,
} from '@vantage/validation';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  expiresAt: Date;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UPLOAD_TTL_SECONDS   = 15 * 60;
const DOWNLOAD_TTL_SECONDS = 60 * 60;

// ---------------------------------------------------------------------------
// Env helper
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`StorageService: environment variable "${key}" is not set`);
  return value;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  readonly maxFileSizeBytes: number = RESUME_MAX_SIZE_BYTES;

  constructor() {
    const endpoint        = requireEnv('R2_ENDPOINT');
    const accessKeyId     = requireEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
    const region          = process.env['R2_REGION'] ?? 'auto';
    const forcePathStyle  = process.env['R2_FORCE_PATH_STYLE'] === 'true';

    this.bucket = requireEnv('R2_BUCKET_RESUMES');

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
      // Disable automatic checksum — R2 rejects the extra headers
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.logger.log(
      `StorageService initialised — bucket=${this.bucket} ` +
        `endpoint=${endpoint} forcePathStyle=${forcePathStyle}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Direct server-side upload via native fetch (bypasses SDK checksum middleware)
  // ---------------------------------------------------------------------------

  async putObject(
    storageKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    // Generate a presigned URL for server-side use.
    // We sign it server-side so there's no CORS issue, and we use fetch()
    // with exactly the headers included in the signature (Content-Type only).
    const command = new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         storageKey,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(this.client, command, {
      expiresIn:          300, // 5 minutes — plenty for a same-process upload
      unhoistableHeaders: new Set(['x-amz-checksum-crc32', 'x-amz-sdk-checksum-algorithm']),
    });

    // Use native fetch — no SDK checksum middleware, no extra headers
    const res = await fetch(presignedUrl, {
      method:  'PUT',
      headers: {
        'Content-Type':   contentType,
        'Content-Length': String(body.length),
      },
      body,
      duplex: 'half',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`R2 putObject failed: ${res.status} ${res.statusText} — ${text}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Presigned URLs
  // ---------------------------------------------------------------------------

  async presignUpload(
    storageKey: string,
    mimeType: string,
    expiresInSeconds = UPLOAD_TTL_SECONDS,
  ): Promise<PresignedUploadResult> {
    const command = new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         storageKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn:          expiresInSeconds,
      unhoistableHeaders: new Set(['x-amz-checksum-crc32', 'x-amz-sdk-checksum-algorithm']),
    });

    return {
      uploadUrl,
      storageKey,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
    };
  }

  async presignDownload(
    storageKey: string,
    expiresInSeconds = DOWNLOAD_TTL_SECONDS,
  ): Promise<PresignedDownloadResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key:    storageKey,
    });

    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
    };
  }

  // ---------------------------------------------------------------------------
  // Object management
  // ---------------------------------------------------------------------------

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    this.logger.log(`Deleted storage object: ${storageKey}`);
  }

  async objectExists(storageKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return true;
    } catch (err) {
      if (
        err instanceof S3ServiceException &&
        err.$metadata.httpStatusCode === 404
      ) {
        return false;
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Key utilities
  // ---------------------------------------------------------------------------

  buildResumeKey(userId: string, resumeVersionId: string, fileName: string): string {
    const sanitised = fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_');
    return `resumes/${userId}/${resumeVersionId}/${sanitised}`;
  }

  isAllowedMimeType(mimeType: string): boolean {
    return (ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(mimeType);
  }
}


