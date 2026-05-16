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
// @smithy/signature-v4 and @aws-crypto/sha256-js are transitive dependencies
// of @aws-sdk/client-s3 and are present at runtime in the pnpm .pnpm store.
// They cannot be imported as top-level ESM/CJS imports because they are not
// listed in apps/api/package.json (pnpm strict phantom-dependency prevention).
// We load them via require() with explicit type casts — the same pattern used
// for @fastify/multipart in main.ts.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { SignatureV4 } = require('@smithy/signature-v4')  as { SignatureV4: new (c: any) => any };
const { Sha256 }      = require('@aws-crypto/sha256-js') as { Sha256: new () => any };
/* eslint-enable  @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Root cause of every SignatureDoesNotMatch error against Cloudflare R2
// (AWS SDK v3.726+):
//
// The SDK automatically injects two request-tracking headers into every S3
// request and includes them in the SigV4 `SignedHeaders` list:
//
//   amz-sdk-invocation-id  — unique ID per SDK call
//   amz-sdk-request        — retry attempt counter
//
// When R2 verifies the signature it reconstructs the canonical request from
// the incoming HTTP headers. R2 does not know these AWS-SDK-specific headers,
// so its canonical request differs from ours → HTTP 403 SignatureDoesNotMatch.
//
// Fix: provide a custom SigV4 signer that strips these (and any checksum)
// headers before computing the canonical request hash, so the resulting
// SignedHeaders contains only standard S3 headers that R2 supports:
//
//   content-length ; content-type ; host ; x-amz-content-sha256 ; x-amz-date
//
// Verified against @aws-sdk/client-s3 v3.1045.0 + Cloudflare R2.
// ---------------------------------------------------------------------------

const SDK_TRACKING_HEADERS = new Set([
  'amz-sdk-invocation-id',
  'amz-sdk-request',
  'x-amz-user-agent',
  'user-agent',
]);

const CHECKSUM_PREFIXES = ['x-amz-checksum-', 'x-amz-sdk-checksum-'];

function stripR2IncompatibleHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => {
      const lower = key.toLowerCase();
      return (
        !SDK_TRACKING_HEADERS.has(lower) &&
        !CHECKSUM_PREFIXES.some((p) => lower.startsWith(p)) &&
        lower !== 'x-amz-trailer'
      );
    }),
  );
}

/**
 * Builds an R2-compatible SigV4 signer.
 *
 * Wraps @smithy/signature-v4 and strips incompatible AWS-SDK headers before
 * computing the canonical request. Both `sign` (PutObject, HeadObject, …)
 * and `presign` (getSignedUrl for upload/download) are covered.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildR2Signer(credentials: { accessKeyId: string; secretAccessKey: string }, region: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: any = new SignatureV4({ service: 's3', region, credentials, sha256: Sha256 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clean = (req: any): any => ({
    ...req,
    headers: stripR2IncompatibleHeaders((req['headers'] as Record<string, string>) ?? {}),
  });

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sign:    (req: any, opts?: any): Promise<any> => base.sign(clean(req),    opts),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    presign: (req: any, opts?: any): Promise<any> => base.presign(clean(req), opts),
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
      // Suppress x-amz-checksum-* headers (SDK v3.726+ enables them by default;
      // Cloudflare R2 rejects any request that includes them).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      // Custom R2-compatible signer — see module-level comment for rationale.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signer: buildR2Signer({ accessKeyId, secretAccessKey }, region) as any,
    });

    this.logger.log(
      `StorageService initialised — bucket=${this.bucket} endpoint=${endpoint} forcePathStyle=${forcePathStyle}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Direct server-side upload (proxy upload — no CORS, no presigned URL)
  //
  // ContentLength must be set explicitly so the SDK does not fall back to
  // chunked transfer encoding, which changes the body hash in the canonical
  // request and causes a second SignatureDoesNotMatch.
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
