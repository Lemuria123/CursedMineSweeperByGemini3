// Browser-side AES-256-GCM encryption using Web Crypto API.
// Must match the server's Node.js crypto format:
//   base64(iv (12 bytes) + ciphertext + authTag (16 bytes))

// Default key — will be replaced at build time or via env.
// DO NOT commit the production key.
const DEFAULT_KEY_HEX = '0000000000000000000000000000000000000000000000000000000000000001';

function getKeyHex(): string {
  // @ts-ignore — Vite env
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENCRYPTION_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_ENCRYPTION_KEY;
  }
  return DEFAULT_KEY_HEX;
}

async function importKey(keyHex: string): Promise<CryptoKey> {
  const raw = hexToBytes(keyHex);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns base64(iv + ciphertext + authTag) matching server format.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const keyHex = getKeyHex();
  const key = await importKey(keyHex);

  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encoded = new TextEncoder().encode(plaintext);

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  // The result is ciphertext + authTag (authTag is the last 16 bytes)
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}
