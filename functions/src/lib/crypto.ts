import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { KeyManagementServiceClient } from '@google-cloud/kms';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const DEK_LENGTH = 32;

const KMS_LOCATION = 'europe-west1';
const KMS_KEYRING = 'dropscout-keys';
const KMS_KEY = 'dropscout-credentials-kek';

interface CipherBlock {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface EncryptedPayload {
  v: 2;
  dekCiphertext: string;
  payload: CipherBlock;
}

let kmsClient: KeyManagementServiceClient | null = null;
function getKmsClient(): KeyManagementServiceClient {
  if (!kmsClient) kmsClient = new KeyManagementServiceClient();
  return kmsClient;
}

function getKmsKeyName(): string {
  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT environment yok');
  return `projects/${project}/locations/${KMS_LOCATION}/keyRings/${KMS_KEYRING}/cryptoKeys/${KMS_KEY}`;
}

function encryptWithKey(key: Buffer, plaintext: Buffer): CipherBlock {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

function decryptWithKey(key: Buffer, block: CipherBlock): Buffer {
  const iv = Buffer.from(block.iv, 'base64');
  const authTag = Buffer.from(block.authTag, 'base64');
  const ciphertext = Buffer.from(block.ciphertext, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function toBuffer(value: Uint8Array | string | null | undefined, label: string): Buffer {
  if (!value) throw new Error(`KMS ${label} boş döndü`);
  return typeof value === 'string' ? Buffer.from(value, 'base64') : Buffer.from(value);
}

export async function encryptJSON(data: unknown): Promise<EncryptedPayload> {
  const dek = randomBytes(DEK_LENGTH);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const payload = encryptWithKey(dek, plaintext);

  const [response] = await getKmsClient().encrypt({
    name: getKmsKeyName(),
    plaintext: dek
  });
  const dekCiphertext = toBuffer(response.ciphertext, 'encrypt ciphertext').toString('base64');

  dek.fill(0);

  return { v: 2, dekCiphertext, payload };
}

export async function decryptJSON<T = unknown>(payload: EncryptedPayload): Promise<T> {
  const [response] = await getKmsClient().decrypt({
    name: getKmsKeyName(),
    ciphertext: Buffer.from(payload.dekCiphertext, 'base64')
  });
  const dek = toBuffer(response.plaintext, 'decrypt plaintext');
  try {
    const plain = decryptWithKey(dek, payload.payload);
    return JSON.parse(plain.toString('utf8')) as T;
  } finally {
    dek.fill(0);
  }
}
