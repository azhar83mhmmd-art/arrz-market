const express = require('express');
const router = express.Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const { supabaseAdmin } = require('../lib/supabase');

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_FILES = 8;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      const err = new Error('INVALID_TYPE');
      err.fileName = file.originalname;
      return cb(err);
    }
    cb(null, true);
  },
});

// Upload dipakai dari form publik (Jual Akun) & admin (Tambah/Edit Akun),
// jadi rate limit sendiri yang cukup longgar namun tetap membatasi abuse.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak upload. Silakan coba lagi beberapa saat lagi.' },
});

function extFromMime(mime) {
  switch (mime) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

// ── POST /api/uploads ────────────────────────────────────────
// Terima hingga 8 file lewat field "photos", upload ke bucket account-images,
// kembalikan array URL publik. Dipakai oleh form Jual Akun & admin.
// Query ?context=accounts (dari admin) menyimpan ke folder accounts/,
// selain itu default ke sell-requests/ (form publik jual akun).
router.post('/', uploadLimiter, (req, res) => {
  const folder = req.query.context === 'accounts' ? 'accounts' : 'sell-requests';

  upload.array('photos', MAX_FILES)(req, res, async (err) => {
    if (err) {
      if (err.message === 'INVALID_TYPE') {
        return res.status(400).json({
          error: 'Upload Gagal',
          message: err.fileName
            ? `Format file "${err.fileName}" tidak didukung. Gunakan JPG, JPEG, PNG, atau WEBP.`
            : 'Format file tidak didukung. Gunakan JPG, JPEG, PNG, atau WEBP.',
        });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'Upload Gagal',
          message: 'Ukuran foto terlalu besar. Maksimal 5 MB per foto.',
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: 'Upload Gagal',
          message: `Maksimal ${MAX_FILES} foto per pengiriman.`,
        });
      }
      console.error('[POST /api/uploads] multer error:', err.message);
      return res.status(400).json({
        error: 'Upload Gagal',
        message: 'Foto gagal diupload. Periksa format dan ukuran file.',
      });
    }

    try {
      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
      }

      const uploadedUrls = [];
      const failedFiles = [];

      for (const file of files) {
        const ext = extFromMime(file.mimetype);
        const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

        const { error: uploadErr } = await supabaseAdmin.storage
          .from('account-images')
          .upload(filename, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadErr) {
          console.error('[POST /api/uploads] gagal upload ke storage:', uploadErr.message);
          failedFiles.push({ name: file.originalname, reason: uploadErr.message });
          continue;
        }

        const { data: publicUrlData } = supabaseAdmin.storage.from('account-images').getPublicUrl(filename);
        if (publicUrlData?.publicUrl) {
          uploadedUrls.push(publicUrlData.publicUrl);
        }
      }

      if (uploadedUrls.length === 0) {
        // Semua file gagal diupload ke storage — ini BUKAN masalah format/ukuran
        // (sudah lolos fileFilter & limits di atas), jadi jangan pakai pesan
        // generik yang menyesatkan. Kemungkinan besar: bucket belum dibuat,
        // RLS storage salah, atau koneksi Supabase bermasalah.
        const firstReason = failedFiles[0]?.reason || '';
        const isBucketMissing = /bucket not found/i.test(firstReason);
        const isAuthIssue = /jwt|permission|policy|unauthorized/i.test(firstReason);

        let message = 'Gagal menyimpan foto ke storage. Silakan coba lagi.';
        if (isBucketMissing) {
          message = 'Storage foto belum dikonfigurasi di server. Hubungi admin.';
        } else if (isAuthIssue) {
          message = 'Server tidak memiliki izin menyimpan foto. Hubungi admin.';
        }

        return res.status(502).json({ error: 'Upload Gagal', message });
      }

      // Sebagian berhasil, sebagian gagal — tetap kembalikan yang berhasil,
      // tapi beri tahu jumlah yang gagal agar user tidak bingung kenapa foto
      // yang ditampilkan lebih sedikit dari yang dipilih.
      const response = { urls: uploadedUrls };
      if (failedFiles.length > 0) {
        response.warning = `${failedFiles.length} dari ${files.length} foto gagal diunggah. Silakan coba unggah ulang foto yang gagal.`;
      }

      res.status(201).json(response);
    } catch (uploadErr) {
      console.error('[POST /api/uploads]', uploadErr.message);
      res.status(500).json({
        error: 'Upload Gagal',
        message: 'Koneksi bermasalah saat mengunggah foto. Silakan coba lagi.',
      });
    }
  });
});

module.exports = router;
