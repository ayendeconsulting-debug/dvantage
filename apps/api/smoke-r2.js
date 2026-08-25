/**
 * smoke-r2.js — R2 upload smoke test for dvantage-api fly machine
 *
 * Run from /repo/apps/api:
 *   node smoke-r2.js
 *
 * Tests:
 *   1. PutObjectCommand with custom R2-compatible signer  →  should PASS
 *   2. Reports SignedHeaders so you can confirm no tracking headers
 */

'use strict';

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { SignatureV4 } = require('@smithy/signature-v4');
const { Sha256 } = require('@aws-crypto/sha256-js');

// ── Same logic as storage.service.ts ────────────────────────────────────────

const SDK_HEADERS_TO_EXCLUDE = new Set([
  'amz-sdk-invocation-id',
  'amz-sdk-request',
  'x-amz-user-agent',
  'user-agent',
]);
const CHECKSUM_PREFIXES = ['x-amz-checksum-', 'x-amz-sdk-checksum-'];

function stripIncompatibleHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => {
      const lower = key.toLowerCase();
      return (
        !SDK_HEADERS_TO_EXCLUDE.has(lower) &&
        !CHECKSUM_PREFIXES.some((p) => lower.startsWith(p)) &&
        lower !== 'x-amz-trailer'
      );
    }),
  );
}

function buildR2Signer(credentials, region) {
  const base = new SignatureV4({ service: 's3', region, credentials, sha256: Sha256 });
  return {
    sign: async (req, opts) =>
      base.sign({ ...req, headers: stripIncompatibleHeaders(req.headers ?? {}) }, opts),
    presign: async (req, opts) =>
      base.presign({ ...req, headers: stripIncompatibleHeaders(req.headers ?? {}) }, opts),
  };
}

// ── Build client exactly as storage.service.ts will ─────────────────────────

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const region = process.env.R2_REGION || 'auto';
const bucket = process.env.R2_BUCKET_RESUMES;
const forcePathStyle = process.env.R2_FORCE_PATH_STYLE === 'true';

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  console.error(
    'Missing env vars: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_RESUMES',
  );
  process.exit(1);
}

const credentials = { accessKeyId, secretAccessKey };

const client = new S3Client({
  endpoint,
  region,
  credentials,
  forcePathStyle,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  signer: buildR2Signer(credentials, region),
});

// ── Intercept to log SignedHeaders ───────────────────────────────────────────

const capturedHeaders = {};
const origHandle = client.config.requestHandler.handle.bind(client.config.requestHandler);
client.config.requestHandler.handle = async (req, opts) => {
  const auth = req.headers.authorization || '';
  const m = auth.match(/SignedHeaders=([^,]+)/);
  capturedHeaders.signedHeaders = m ? m[1] : '(none)';
  return origHandle(req, opts);
};

// ── Run the smoke test ───────────────────────────────────────────────────────

const TEST_KEY = 'smoke/r2-compatibility-test.txt';
const TEST_BODY = Buffer.from(`smoke test ${Date.now()}`);

async function run() {
  console.log(`\n📡 R2 Smoke Test`);
  console.log(`   endpoint:  ${endpoint}`);
  console.log(`   bucket:    ${bucket}`);
  console.log(`   region:    ${region}`);
  console.log(`   pathStyle: ${forcePathStyle}`);
  console.log('');

  // PUT
  console.log('▶ PUT', TEST_KEY);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: TEST_KEY,
      Body: TEST_BODY,
      ContentType: 'text/plain',
      ContentLength: TEST_BODY.length,
    }),
  );
  console.log('  SignedHeaders:', capturedHeaders.signedHeaders);

  const bad = (capturedHeaders.signedHeaders || '')
    .split(';')
    .filter((h) => SDK_HEADERS_TO_EXCLUDE.has(h) || h.startsWith('x-amz-checksum'));
  if (bad.length) {
    console.error('  ❌ Incompatible headers still in signature:', bad);
    process.exit(1);
  } else {
    console.log('  ✅ PUT succeeded — signature is clean');
  }

  // HEAD (verify object exists)
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: TEST_KEY }));
  console.log('  ✅ HEAD confirms object exists in R2');

  console.log('\n🎉 All smoke tests passed — safe to deploy.\n');
}

run().catch((e) => {
  console.error('\n❌ SMOKE TEST FAILED');
  console.error('   Code:', e.Code || e.code || e.name);
  console.error('   Msg: ', e.message);
  console.error('   HTTP:', e.$metadata?.httpStatusCode);
  process.exit(1);
});
