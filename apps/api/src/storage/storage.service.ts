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
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.logger.log(
      `StorageService initialised — bucket=${this.bucket} endpoint=${endpoint} forcePathStyle=${forcePathStyle}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Direct server-side upload (proxy upload — no CORS, no presigned URL)
  //
  // ContentLength MUST be set explicitly. Without it the SDK may use chunked
  // transfer encoding which changes the signing payload → SignatureDoesNotMatch.
  //
  // ChecksumAlgorithm is intentionally NOT set. The global client config of
  // requestChecksumCalculation:'WHEN_REQUIRED' should suppress x-amz-checksum-*
  // headers. Cloudflare R2 rejects any request that includes these headers.
  // ---------------------------------------------------------------------------

  async putObject(storageKey: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket:        this.bucket,
        Key:           storageKey,
        Body:          body,
        ContentType:   contentType,
        ContentLength: body.length,
      }),
    );
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
      expiresIn:          expiresInSeconds,
      unhoistableHeaders: new Set(['x-amz-checksum-crc32', 'x-amz-sdk-checksum-algorithm']),
    });

    return { uploadUrl, storageKey, expiresAt: new Date(Date.now() + expiresInSeconds * 1_000) };
  }

  // ---------------------------------------------------------------------------
  // Presigned download URL
  // ---------------------------------------------------------------------------

  async presignDownload(
    storageKey: string,
    expiresInSeconds = DOWNLOAD_TTL_SECONDS,
  ): Promise<PresignedDownloadResult> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    const downloadUrl = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    return { downloadUrl, expiresAt: new Date(Date.now() + expiresInSeconds * 1_000) };
  }

  // ---------------------------------------------------------------------------
  // Object management
  // ---------------------------------------------------------------------------

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    this.logger.log(`Deleted storage object: ${storageKey}`);
  }

  async objectExists(storageKey: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      return true;
    } catch (err) {
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return false;
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Key utilities
  // ---------------------------------------------------------------------------

  buildResumeKey(userId: string, resumeVersionId: string, fileName: string): string {
    const sanitised = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
    return `resumes/${userId}/${resumeVersionId}/${sanitised}`;
  }

  isAllowedMimeType(mimeType: string): boolean {
    return (ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(mimeType);
  }
}
