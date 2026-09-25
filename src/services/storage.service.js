import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { encryptBuffer, decryptBuffer } from '../utils/encryption.js';

const UPLOADS_BASE_DIR = path.join(process.cwd(), 'uploads', 'bills');

export const storageService = {
  /**
   * Save file buffer securely scoped by userId and billId with AES-256-GCM encryption at rest (SCRUM-152).
   */
  saveFile: async (userId, billId, originalName, fileBuffer) => {
    const userDir = path.join(UPLOADS_BASE_DIR, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const ext = path.extname(originalName) || '.jpg';
    const fileName = `${billId}${ext}`;
    const filePath = path.join(userDir, fileName);

    // SCRUM-152: Encrypt with AES-256-GCM before writing to disk
    const encryptedBuffer = encryptBuffer(fileBuffer);
    fs.writeFileSync(filePath, encryptedBuffer);

    return {
      storageKey: path.join(userId, fileName),
      filePath,
      fileName,
      isEncryptedAtRest: true,
      encryptionAlgorithm: 'AES-256-GCM',
    };
  },

  /**
   * Reads and decrypts a stored file buffer from disk.
   * Transparently decrypts AES-256-GCM encrypted files and falls back to raw buffer if unencrypted.
   *
   * @param {string} filePath
   * @returns {Buffer}
   */
  getFileBuffer: (filePath) => {
    if (!fs.existsSync(filePath)) {
      const error = new Error('File not found on storage.');
      error.statusCode = 404;
      throw error;
    }

    const rawBuffer = fs.readFileSync(filePath);
    return decryptBuffer(rawBuffer);
  },

  /**
   * Get decrypted file stream for HTTP image response streaming.
   *
   * @param {string} filePath
   * @returns {Readable}
   */
  getFileStream: (filePath) => {
    const decryptedBuffer = storageService.getFileBuffer(filePath);
    return Readable.from(decryptedBuffer);
  },

  /**
   * Delete file from storage.
   */
  deleteFile: (filePath) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  },
};
