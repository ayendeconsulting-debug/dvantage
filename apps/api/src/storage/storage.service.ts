import { Injectable, Logger } from '@nestjs/common';
import * as https from 'node:https';
import * as crypto from 'node:crypto';
import { ALLOWED_RESUME_MIME_TYPES, RESUME_MAX_SIZE_BYTES } from '@vantage/validation';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ---------------------------------------------------------------------------
// Why raw HTTPS for putObject and objectExists?
//
// AWS SDK v3.1045.0 (smithy-based architecture) ignores the `signer` option
// on S3Client.  The new @aws-sdk/middleware-sdk-s3 + @smithy/core schema
// executor handles signing internally — our custom signer was loaded but
// never called.  In addition, @aws-sdk/middleware-flexible-checksums adds
// x-amz-checksum-crc32 AFTER signing in a layer we cannot intercept.
//
// Both issues cause Cloudflare R2 to return HTTP 403 SignatureDoesNotMatch
// on every PutObjectCommand.
//
// Fix: bypass the SDK for mutating S3 calls (PUT, HEAD) and implement
// SigV4 directly using only node:crypto + node:https built-ins:
//   - We control exactly which headers are signed
//   - No SDK middleware can add incompatible headers post-signing
//   - Zero external dependencies — no version fragility
//
// Signed headers for PUT / HEAD:
//   content-length ; content-type ; host ; x-amz-content-sha256 ; x-amz-date
//   (or without content-length/content-type for HEAD)
//
// The legacy SDK client is kept for getSignedUrl (presign) only because
// getSignedUrl generates a URL without making an HTTP call — the URL is
// used by the browser which is a different signing context.
// ---------------------------------------------------------------------------

// ── SigV4 helpers (node:crypto only) ───────────────────────────────────────

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Percent-encode an S3 key segment per AWS URI encoding rules.
 * Slashes are preserved (passed through as segment separators).
 */
/**
 * Percent-encode an S3 key per AWS SigV4 URI encoding rules.
 * Unreserved chars (A-Z a-z 0-9 - _ . ~) are NOT encoded.
 * Slashes are preserved as path separators.
 * encodeURIComponent leaves ( ) ! * ' unencoded — we fix that.
 */
function awsUriEncode(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodeS3Key(key: string): string {
  return key.split('/').map(awsUriEncode).join('/');
}

interface SigV4Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}

interface RawS3Options {
  method: 'PUT' | 'HEAD' | 'DELETE';
  hostname: string;
  path: string; // must start with /
  headers: Record<string, string>;
  body?: Buffer;
}

/**
 * Compute the AWS SigV4 Authorization header and x-amz-date for a request.
 *
 * @param cfg       AWS credentials + region + service
 * @param method    HTTP verb
 * @param hostname  Virtual hosted / path style hostname
 * @param path      URI path (must start with /)
 * @param headers   All request headers (will be included in canonical request)
 * @param bodyHash  Hex SHA-256 of the body (or the empty-body constant)
 * @returns         { authorization, amzDate }
 */
function signRequest(
  cfg: SigV4Config,
  method: string,
  hostname: string,
  path: string,
  headers: Record<string, string>,
  bodyHash: string,
): { authorization: string; amzDate: string } {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\..+/, '') + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  // Canonical headers — sorted alphabetically by lowercase header name
  const allHeaders: Record<string, string> = {
    ...headers,
    host: hostname,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': bodyHash,
  };

  const sortedKeys = Object.keys(allHeaders)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders =
    sortedKeys.map((k) => `${k}:${(allHeaders[k] ?? '').trim()}`).join('\n') + '\n';
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [
    method,
    path,
    '', // no query string
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${cfg.region}/${cfg.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest)),
  ].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(Buffer.from(`AWS4${cfg.secretAccessKey}`), dateStamp), cfg.region), cfg.service),
    'aws4_request',
  );

  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(stringToSign, 'utf8')
    .digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, amzDate };
}

/** Execute a signed raw HTTPS request against R2 / S3. */
function rawS3Request(opts: RawS3Options): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: opts.hostname,
        path: opts.path,
        method: opts.method,
        headers: opts.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolve();
          } else {
            const body = Buffer.concat(chunks).toString('utf8');
            reject(new Error(`R2 ${opts.method} failed HTTP ${status}: ${body.slice(0, 400)}`));
          }
        });
      },
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ── R2 helpers ──────────────────────────────────────────────────────────────

const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// ── Public interfaces ───────────────────────────────────────────────────────

export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  expiresAt: Date;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresAt: Date;
}

const UPLOAD_TTL_SECONDS = 15 * 60;
const DOWNLOAD_TTL_SECONDS = 60 * 60;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`StorageService: environment variable "${key}" is not set`);
  return value;
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // SDK client kept for presign-only operations (getSignedUrl does not hit R2)
  private readonly client: S3Client;

  private readonly bucket: string;
  private readonly sigCfg: SigV4Config;
  private readonly r2Hostname: string; // virtual hosted style hostname for the bucket
  private readonly forcePathStyle: boolean;
  private readonly rawHostname: string; // account endpoint hostname

  readonly maxFileSizeBytes: number = RESUME_MAX_SIZE_BYTES;

  constructor() {
    const endpoint = requireEnv('R2_ENDPOINT');
    const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
    const region = process.env['R2_REGION'] ?? 'auto';
    const forcePathStyle = process.env['R2_FORCE_PATH_STYLE'] === 'true';

    this.bucket = requireEnv('R2_BUCKET_RESUMES');
    this.forcePathStyle = forcePathStyle;
    this.sigCfg = { accessKeyId, secretAccessKey, region, service: 's3' };

    // Derive the bare hostname from the endpoint URL
    const endpointUrl = new URL(endpoint);
    this.rawHostname = endpointUrl.hostname;
    this.r2Hostname = forcePathStyle ? this.rawHostname : `${this.bucket}.${this.rawHostname}`;

    // SDK client — used ONLY for getSignedUrl (no actual HTTP calls to R2)
    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.logger.log(
      `StorageService initialised — bucket=${this.bucket} endpoint=${endpoint} ` +
        `forcePathStyle=${forcePathStyle} hostname=${this.r2Hostname}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Direct server-side upload — raw HTTPS + manual SigV4
  // SignedHeaders: content-length;content-type;host;x-amz-content-sha256;x-amz-date
  // ---------------------------------------------------------------------------

  async putObject(storageKey: string, body: Buffer, contentType: string): Promise<void> {
    this.logger.debug(`putObject — key=${storageKey} bytes=${body.length} type=${contentType}`);

    const bodyHash = sha256Hex(body);
    const path = this.buildPath(storageKey);

    const extraHeaders: Record<string, string> = {
      'content-type': contentType,
      'content-length': String(body.length),
    };

    const { authorization, amzDate } = signRequest(
      this.sigCfg,
      'PUT',
      this.r2Hostname,
      path,
      extraHeaders,
      bodyHash,
    );

    await rawS3Request({
      method: 'PUT',
      hostname: this.r2Hostname,
      path,
      body,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.length),
        'x-amz-date': amzDate,
        'x-amz-content-sha256': bodyHash,
        Authorization: authorization,
      },
    });

    this.logger.log(`putObject success — key=${storageKey}`);
  }

  // ---------------------------------------------------------------------------
  // Check object existence — raw HTTPS + manual SigV4 (HEAD)
  // ---------------------------------------------------------------------------

  async objectExists(storageKey: string): Promise<boolean> {
    const path = this.buildPath(storageKey);

    const { authorization, amzDate } = signRequest(
      this.sigCfg,
      'HEAD',
      this.r2Hostname,
      path,
      {},
      EMPTY_BODY_SHA256,
    );

    try {
      await rawS3Request({
        method: 'HEAD',
        hostname: this.r2Hostname,
        path,
        headers: {
          'x-amz-date': amzDate,
          'x-amz-content-sha256': EMPTY_BODY_SHA256,
          Authorization: authorization,
        },
      });
      return true;
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('HTTP 404') || msg.includes('HTTP 403')) return false;
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Presigned upload URL (legacy browser-direct path)
  // getSignedUrl does NOT make an HTTP call — safe to use SDK here
  // ---------------------------------------------------------------------------

  async presignUpload(
    storageKey: string,
    mimeType: string,
    expiresInSeconds = UPLOAD_TTL_SECONDS,
  ): Promise<PresignedUploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
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
  // getSignedUrl does NOT make an HTTP call — safe to use SDK here
  // ---------------------------------------------------------------------------

  async presignDownload(
    storageKey: string,
    expiresInSeconds = DOWNLOAD_TTL_SECONDS,
  ): Promise<PresignedDownloadResult> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    const downloadUrl = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
    };
  }

  // ---------------------------------------------------------------------------
  // Delete (uses SDK — errors are non-fatal, caught by caller)
  // ---------------------------------------------------------------------------

  async deleteObject(storageKey: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    } catch (err) {
      // Re-throw — caller (ResumeService.deleteVersion) catches and logs
      throw err;
    }
    this.logger.log(`Deleted storage object: ${storageKey}`);
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

  // ---------------------------------------------------------------------------
  // Internal — build the request path for a storage key
  // ---------------------------------------------------------------------------

  private buildPath(storageKey: string): string {
    const encodedKey = encodeS3Key(storageKey);
    return this.forcePathStyle ? `/${this.bucket}/${encodedKey}` : `/${encodedKey}`;
  }
}
