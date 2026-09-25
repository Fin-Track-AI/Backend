import crypto from 'crypto';
import { config } from '../config/env.js';

// 8-byte magic header to identify FinTrack AES-256-GCM encrypted files
export const ENCRYPTION_MAGIC_HEADER = Buffer.from('FIN_ENC1', 'utf8'); // 8 bytes
export const ALGORITHM = 'aes-256-gcm';
export const IV_LENGTH = 12; // 96-bit IV recommended for GCM
export const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Derives a 32-byte (256-bit) cryptographic key from configuration secret.
 */
export function getDerivedStorageKey(secret = null) {
  const rawKey = secret || process.env.STORAGE_ENCRYPTION_KEY || config.jwtSecret || 'fintrack_default_aes256_storage_key_2026';
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest();
}

/**
 * Checks if a given buffer is encrypted with FinTrack AES-256-GCM envelope.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isEncryptedBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < ENCRYPTION_MAGIC_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH) {
    return false;
  }
  return buffer.subarray(0, ENCRYPTION_MAGIC_HEADER.length).equals(ENCRYPTION_MAGIC_HEADER);
}

/**
 * Encrypts a buffer using AES-256-GCM (NIST authenticated encryption).
 * Output format: [MAGIC_HEADER (8B) | IV (12B) | AUTH_TAG (16B) | CIPHERTEXT]
 *
 * @param {Buffer} plainBuffer
 * @param {Buffer|string} [customKey]
 * @returns {Buffer}
 */
export function encryptBuffer(plainBuffer, customKey = null) {
  if (!Buffer.isBuffer(plainBuffer)) {
    plainBuffer = Buffer.from(plainBuffer);
  }

  const key = customKey ? (Buffer.isBuffer(customKey) ? customKey : getDerivedStorageKey(customKey)) : getDerivedStorageKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    ENCRYPTION_MAGIC_HEADER,
    iv,
    authTag,
    encrypted,
  ]);
}

/**
 * Decrypts an AES-256-GCM encrypted buffer.
 * Automatically verifies the authentication tag to detect any tampering or bit-flipping.
 *
 * @param {Buffer} encryptedBuffer
 * @param {Buffer|string} [customKey]
 * @returns {Buffer}
 */
export function decryptBuffer(encryptedBuffer, customKey = null) {
  if (!Buffer.isBuffer(encryptedBuffer)) {
    throw new Error('Input must be a valid Buffer.');
  }

  // Graceful fallback if buffer is not encrypted (e.g. legacy test file)
  if (!isEncryptedBuffer(encryptedBuffer)) {
    return encryptedBuffer;
  }

  const key = customKey ? (Buffer.isBuffer(customKey) ? customKey : getDerivedStorageKey(customKey)) : getDerivedStorageKey();

  const ivStart = ENCRYPTION_MAGIC_HEADER.length;
  const tagStart = ivStart + IV_LENGTH;
  const cipherStart = tagStart + AUTH_TAG_LENGTH;

  const iv = encryptedBuffer.subarray(ivStart, tagStart);
  const authTag = encryptedBuffer.subarray(tagStart, cipherStart);
  const ciphertext = encryptedBuffer.subarray(cipherStart);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
