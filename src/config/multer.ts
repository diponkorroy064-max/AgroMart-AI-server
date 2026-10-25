import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Resolve guaranteed uploads directory in server root
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// Ensure uploads folder always exists
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating uploads directory:', err);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedExts = /jpeg|jpg|png|webp|gif|pdf/i;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const isExtValid = allowedExts.test(ext);
  const isMimeValid =
    /image\/(jpeg|jpg|png|webp|gif)/i.test(file.mimetype) ||
    file.mimetype === 'application/pdf';

  if (isExtValid || isMimeValid) {
    return cb(null, true);
  }
  return cb(new Error('ফাইল আপলোড শুধুমাত্র ইমেজ (jpg, png, webp, gif) ও PDF সমর্থন করে।'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 15 }, // 15MB limit
});

export default upload;
