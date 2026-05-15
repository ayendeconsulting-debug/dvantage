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
  /** Presigned PUT URL. The browser sends the file body directly to this URL. */
  uploadUrl: string;
  /** Object key used when generating the URL. */
  storageKey: string;
  /** UTC timestamp after which the presigned URL is no longer valid. */
  expiresAt: Date;
}

export interface PresignedDownloadResult {
  /** Presigned GET URL for authenticated file access. */
  downloadUrl: string;
  /** UTC timestamp after which the presigned URL is no longer valid. */
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Presigned upload URL TTL — 15 minutes. */
const UPLOAD_TTL_SECONDS = 15 * 60;

/** Presigned download URL TTL — 1 hour. */
const DOWNLOAD_TTL_SECONDS = 60 * 60;

// ---------------------------------------------------------------------------
// Env helper — fail fast with a clear message at startup
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

  /**
   * Maximum allowed resume file size in bytes.
   * Sourced from @vantage/validation — single source of truth shared with
   * the frontend form validation and ParsingService.
   */
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
      // ---------------------------------------------------------------------------
      // IMPORTANT: Disable automatic checksum calculation.
      // AWS SDK v3 adds CRC32 checksum headers by default (x-amz-checksum-*,
      // x-amz-sdk-checksum-algorithm) which Cloudflare R2 does not support and
      // rejects with 403 Forbidden on presigned PUT uploads.
      // ---------------------------------------------------------------------------
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.logger.log(
      `StorageService initialised — bucket=${this.bucket} ` +
        `endpoint=${endpoint} forcePathStyle=${forcePathStyle}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Direct server-side upload (used by proxy upload endpoint)
  // Bypasses presigned URLs entirely — sends directly from API server to R2.
  // ---------------------------------------------------------------------------

  async putObject(
    storageKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         storageKey,
      Body:        body,
      ContentType: contentType,
    });
    await this.client.send(command);
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
      expiresIn:           expiresInSeconds,
      // Do not include checksum headers in the presigned URL — R2 rejects them.
      unhoistableHeaders:  new Set(['x-amz-checksum-crc32', 'x-amz-sdk-checksum-algorithm']),
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

  buildResumeKey(
    userId: string,
    resumeVersionId: string,
    fileName: string,
  ): string {
    const sanitised = fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_');

    return `resumes/${userId}/${resumeVersionId}/${sanitised}`;
  }

  /**
   * Return true if the MIME type is allowed.
   * Delegates to the shared @vantage/validation allow-list.
   */
  isAllowedMimeType(mimeType: string): boolean {
    return (ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(mimeType);
  }
}
