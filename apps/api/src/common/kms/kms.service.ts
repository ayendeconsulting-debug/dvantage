import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const TAG_BYTES  = 16;
const SEP        = '.';
const PLAIN_PFX  = 'PLAIN:';

@Injectable()
export class KmsService implements OnModuleInit {
  private readonly logger = new Logger(KmsService.name);
  private client!: KMSClient;
  private readonly keyId: string;

  constructor() {
    this.keyId = process.env['KMS_KEY_ID_OAUTH_TOKENS'] ?? '';
  }

  onModuleInit(): void {
    // Fix: exactOptionalPropertyTypes rejects `credentials: T | undefined`.
    // Use conditional spread so the key is absent (not undefined) when keyId exists.
    this.client = new KMSClient({
      region: process.env['AWS_REGION'] ?? 'us-east-1',
      ...(this.keyId
        ? {}
        : { credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' } }),
    });

    if (!this.keyId) {
      this.logger.warn(
        'KMS_KEY_ID_OAUTH_TOKENS not set — OAuth tokens stored unencrypted. ' +
        'Configure before accepting real OAuth flows.',
      );
    } else {
      this.logger.log(`KMS client ready (key: ${this.keyId.slice(0, 8)}…)`);
    }
  }

  async encrypt(plaintext: string): Promise<string> {
    if (!this.keyId) {
      return `${PLAIN_PFX}${plaintext}`;
    }

    const { CiphertextBlob, Plaintext: dek } = await this.client.send(
      new GenerateDataKeyCommand({ KeyId: this.keyId, KeySpec: 'AES_256' }),
    );

    if (!CiphertextBlob || !dek) {
      throw new Error('KMS GenerateDataKey returned incomplete response');
    }

    const nonce  = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, Buffer.from(dek), nonce);
    const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();

    return [
      Buffer.from(CiphertextBlob).toString('base64url'),
      nonce.toString('base64url'),
      Buffer.concat([enc, tag]).toString('base64url'),
    ].join(SEP);
  }

  async decrypt(value: string): Promise<string> {
    if (value.startsWith(PLAIN_PFX)) {
      return value.slice(PLAIN_PFX.length);
    }

    const parts = value.split(SEP);
    if (parts.length !== 3) throw new Error('Malformed KMS ciphertext blob');

    const [encDekB64, nonceB64, ciphertextB64] = parts as [string, string, string];

    const { Plaintext: dek } = await this.client.send(
      new DecryptCommand({ CiphertextBlob: Buffer.from(encDekB64, 'base64url') }),
    );

    if (!dek) throw new Error('KMS Decrypt returned empty DEK');

    const nonce      = Buffer.from(nonceB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');
    const tag        = ciphertext.subarray(ciphertext.length - TAG_BYTES);
    const data       = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, Buffer.from(dek), nonce);
    decipher.setAuthTag(tag);

    return decipher.update(data) + decipher.final('utf8');
  }
}
