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
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

// ---------------------------------------------------------------------------
// Root cause (AWS SDK v3.726+):
//
// AWS SDK v3 adds two request-tracking headers to EVERY S3 request:
//   - amz-sdk-invocation-id  (unique per SDK call)
//   - amz-sdk-request        (retry attempt number)
//
// These headers are included in the SigV4 `SignedHeaders` list. Cloudflare R2
// does NOT include them in its own canonical request when verifying the
// signature → the computed signatures differ → HTTP 403 SignatureDoesNotMatch.
//
// Fix: provide a custom SigV4 signer that strips these (and other SDK-specific)
// headers from the request BEFORE computing the canonical request hash. The
// stripped headers are also absent from the actual HTTP call, so R2's
// verification and our signature remain in sync.
//
// Verified against @aws-sdk/client-s3 v3.1045.0 + Cloudflare R2.
// ---------------------------------------------------------------------------

/** Headers injected by the AWS SDK that R2 cannot handle in SignedHeaders. */
const SDK_HEADERS_TO_EXCLUDE_FROM_SIGNING = new Set([
  'amz-sdk-invocation-id',
  'amz-sdk-request',
  'x-amz-user-agent',
  'user-agent',
]);

/** Header prefixes for AWS checksum extensions that R2 does not support. */
const CHECKSUM_HEADER_PREFIXES = [
  'x-amz-checksum-',
  'x-amz-sdk-checksum-',
];

function stripR2IncompatibleHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => {
      const lower = key.toLowerCase();
      return (
        !SDK_HEADERS_TO_EXCLUDE_FROM_SIGNING.has(lower) &&
        !CHECKSUM_HEADER_PREFIXES.some((p) => lower.startsWith(p)) &&
        lower !== 'x-amz-trailer'
      );
    }),
  );
}

/**
 * Builds an R2-compatible SigV4 signer.
 *
 * Wraps @smithy/signature-v4 and strips incompatible AWS-SDK headers before
 * computing the canonical request, so only standard S3 headers appear in
 * SignedHeaders:  content-length;content-type;host;x-amz-content-sha256;x-amz-date
 */
function buildR2Signer(
  credentials: { accessKeyId: string; secretAccessKey: string },
  region: string,
) {
  const base = new SignatureV4({
    service: 's3',
    region,
    credentials,
    sha256: Sha256,
  });

  return {
    sign: async (
      request: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => {
      const cleaned = {
        ...request,
        headers: stripR2IncompatibleHeaders(
          (request.headers as Record<string, string>) ?? {},
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return base.sign(cleaned as any, options as any);
    },
    presign: async (
      request: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => {
      const cleaned = {
        ...request,
        headers: stripR2IncompatibleHeaders(
          (request.headers as Record<string, string>) ?? {},
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return base.presign(cleaned as any, options as any);
    },
  };
}

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

const UPLOAD_TTL_SECONDS   = 15 * 60;
const DOWNLOAD_TTL_SECONDS = 60 * 60;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`StorageService: environment variable "${key}" is not set`);
  return value;
}

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
      // Suppress x-amz-checksum-* headers (SDK v3.726+ adds them by default;
      // R2 rejects any request that includes them).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      // Custom signer strips amz-sdk-invocation-id / amz-sdk-request from the
      // canonical request so R2's signature verification matches ours.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signer: buildR2Signer({ accessKeyId, secretAccessKey }, region) as any,
    });

    this.logger.log(
      `StorageService initialised — bucket=${this.bucket} endpoint=${endpoint} forcePathStyle=${forcePathStyle}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Direct server-side upload (proxy upload — no CORS, no presigned URL)
  // ---------------------------------------------------------------------------

  async putObject(storageKey: string, body: Buffer, contentType: string): Promise<void> {
    this.logger.debug(`putObject — key=${storageKey} bytes=${body.length} type=${contentType}`);
    await this.client.send(
      new PutObjectCommand({
        Bucket:        this.bucket,
        Key:           storageKey,
        Body:          body,
        ContentType:   contentType,
        ContentLength: body.length,
      }),
    );
    this.logger.log(`putObject success — key=${storageKey}`);
  }

  // ---------------------------------------------------------------------------
  // Presigned upload URL (legacy browser-direct path)
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
      expiresIn: expiresInSeconds,
    });

    return {
      uploadUrl,
      storageKey,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
    };
  }

  // ---------------------------------------------------------------------------
  // Presigned download URL
  // ---------------------------------------------------------------------------

  async presignDownload(
    storageKey: string,
    expiresInSeconds = DOWNLOAD_TTL_SECONDS,
  ): Promise<PresignedDownloadResult> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
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
