import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as cloudflare from '@pulumi/cloudflare';

const config = new pulumi.Config();
const environment = config.require('environment'); // dev | staging | prod

// ── AWS KMS Keys ───────────────────────────────────────────────────────────

/**
 * OAuth token encryption key.
 * Phase 1 scope: encrypts OAuth access + refresh tokens at rest.
 * Phase 2 will add a second key for resume PII.
 */
const oauthTokenKey = new aws.kms.Key(`vantage-oauth-tokens-${environment}`, {
  description: `Vantage OAuth token encryption — ${environment}`,
  deletionWindowInDays: 30,
  enableKeyRotation: true,
  tags: {
    Environment: environment,
    Service: 'vantage',
    Purpose: 'oauth-token-encryption',
  },
});

const oauthTokenKeyAlias = new aws.kms.Alias(`vantage-oauth-tokens-alias-${environment}`, {
  name: `alias/vantage/oauth-tokens/${environment}`,
  targetKeyId: oauthTokenKey.keyId,
});

// ── Cloudflare R2 Buckets ─────────────────────────────────────────────────

const accountId = config.require('cloudflareAccountId');

const resumesBucket = new cloudflare.R2Bucket(`vantage-resumes-${environment}`, {
  accountId,
  name: `vantage-resumes-${environment}`,
  location: 'WNAM', // Western North America
});

const exportsBucket = new cloudflare.R2Bucket(`vantage-exports-${environment}`, {
  accountId,
  name: `vantage-exports-${environment}`,
  location: 'WNAM',
});

// ── Outputs ────────────────────────────────────────────────────────────────

export const kmsOauthTokenKeyId = oauthTokenKey.keyId;
export const kmsOauthTokenKeyArn = oauthTokenKey.arn;
export const kmsOauthTokenKeyAliasName = oauthTokenKeyAlias.name;
export const r2ResumesBucketName = resumesBucket.name;
export const r2ExportsBucketName = exportsBucket.name;
