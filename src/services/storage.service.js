import fs from 'fs';
import path from 'path';

const UPLOADS_BASE_DIR = path.join(process.cwd(), 'uploads', 'bills');

export const storageService = {
  /**
   * Save file buffer securely scoped by userId and billId.
   */
  saveFile: async (userId, billId, originalName, fileBuffer) => {
    const userDir = path.join(UPLOADS_BASE_DIR, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const ext = path.extname(originalName) || '.jpg';
    const fileName = `${billId}${ext}`;
    const filePath = path.join(userDir, fileName);

    fs.writeFileSync(filePath, fileBuffer);

    return {
      storageKey: path.join(userId, fileName),
      filePath,
      fileName,
    };
  },

  /**
   * Get file stream / buffer for a stored file.
   */
  getFileStream: (filePath) => {
    if (!fs.existsSync(filePath)) {
      const error = new Error('File not found on storage.');
      error.statusCode = 404;
      throw error;
    }
    return fs.createReadStream(filePath);
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
