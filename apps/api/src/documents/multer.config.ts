import { UnsupportedMediaTypeException } from "@nestjs/common";
import { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { CHUNKING } from "@ai-pdf/shared";
import { memoryStorage } from "multer";

/**
 * In-memory buffering keeps the upload handler simple (we hand the whole
 * buffer to the S3 SDK) and is fine at the 50MB cap enforced below; if that
 * cap grows significantly later, switch to streaming multipart straight to
 * object storage instead of buffering in process memory (spec §35).
 */
export const documentUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: CHUNKING.MAX_UPLOAD_SIZE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    const isPdfMimeType = file.mimetype === "application/pdf";
    const isPdfExtension = file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdfMimeType || !isPdfExtension) {
      callback(new UnsupportedMediaTypeException("Only PDF files are accepted"), false);
      return;
    }
    callback(null, true);
  },
};
