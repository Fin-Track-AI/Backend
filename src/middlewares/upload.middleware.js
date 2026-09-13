import multer from 'multer';

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/jpg',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const fileFilter = (req, file, cb) => {
  const isImageMime = ALLOWED_MIME_TYPES.includes(file.mimetype);
  const isImageExt = /\.(jpe?g|png|webp|heic)$/i.test(file.originalname || '');

  if (!isImageMime && !(file.mimetype === 'application/octet-stream' && (isImageExt || !file.originalname))) {
    const error = new Error(`Invalid file type '${file.mimetype}'. Only image files (JPEG, PNG, WEBP, HEIC) are accepted.`);
    error.statusCode = 400;
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }
  cb(null, true);
};

export const uploadBillImage = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
}).single('billImage');

/**
 * Middleware wrapper to handle Multer errors cleanly.
 */
export const handleUploadMiddleware = (req, res, next) => {
  uploadBillImage(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size exceeds maximum allowed limit of 5MB.',
            errors: { limit: '5MB' },
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message || 'File upload error',
      });
    }
    next();
  });
};
