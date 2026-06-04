// AES-256-GCM encryption utilities for server-side decryption.
// The matching client-side encryption will be in frontend utils/encrypt.ts (Stage 5).

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes (64 hex chars), got ${key.length} bytes`);
  }
  return key;
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext.
 * Format: base64(iv (12) + ciphertext + authTag (16))
 */
export function decrypt(encoded: string): string {
  const key = getKey();
  const buffer = Buffer.from(encoded, 'base64');

  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(buffer.length - AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH, buffer.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Encrypt plaintext (for testing / key generation verification only).
 * Format: base64(iv (12) + ciphertext + authTag (16))
 */
export function encrypt(plaintext: string, keyHex?: string): string {
  const key = keyHex ? Buffer.from(keyHex, 'hex') : getKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

/**
 * Generate a random 256-bit key (for initial setup).
 */
export function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
