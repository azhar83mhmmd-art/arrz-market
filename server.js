require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const { initSocket } = require('./lib/socket');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// ── Trust proxy (perlu jika di-deploy di belakang reverse proxy / load balancer) ──
app.set('trust proxy', 1);

// ── Keamanan dasar: Helmet ──
app.use(
  helmet({
    contentSecurityPolicy: false, // diaktifkan manual nanti setelah semua asset dipetakan, agar tidak memblokir Socket.IO/CDN saat development
    crossOriginEmbedderPolicy: false,
  })
);

// ── CORS ──
// Same-origin untuk kebutuhan utama (frontend disajikan dari server yang sama),
// tapi tetap diberi whitelist eksplisit agar mudah dikembangkan jika frontend
// dipisah nanti.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // request non-browser / same-origin
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS tidak diizinkan untuk origin ini'));
  },
  credentials: true,
};
app.use(cors(corsOptions));

// ── Body parser ──
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ── Session (dipakai untuk auth admin) ──
if (!process.env.SESSION_SECRET) {
  console.warn('[Server] Peringatan: SESSION_SECRET belum diset di .env — gunakan nilai acak yang aman untuk production.');
}
app.use(
  session({
    name: 'arrz.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-jangan-dipakai-di-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PROD, // hanya HTTPS di production
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8, // 8 jam
    },
  })
);

// ── Rate limiting umum untuk semua route /api ──
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 300, // maksimum 300 request per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan. Silakan coba lagi beberapa saat lagi.' },
});
app.use('/api', apiLimiter);

// Rate limit lebih ketat khusus login admin, untuk mencegah brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Silakan coba lagi nanti.' },
});
app.use('/api/admin/login', loginLimiter);

// ── Static files ──
app.use(express.static(path.join(__dirname, 'public')));

// ── Socket.IO ──
const io = initSocket(server, allowedOrigins.length ? allowedOrigins : true);

// Membuat io bisa diakses dari req.app.get('io') di dalam routes
app.set('io', io);

// ── Routes API ──
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/sell-requests', require('./routes/sellers'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/uploads', require('./routes/uploads'));

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: NODE_ENV, time: new Date().toISOString() });
});

// ── 404 handler untuk API ──
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

// ── 404 untuk halaman publik yang tidak ditemukan ────────────
// Semua halaman disajikan sebagai file statis (bukan SPA), jadi path
// yang tidak match file manapun dianggap benar-benar tidak ditemukan.
app.use((req, res) => {
  res.status(404).send('Halaman tidak ditemukan.');
});

// ── Global error handler ──
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'Akses ditolak (CORS).' });
  }
  res.status(500).json({
    error: 'Terjadi Kesalahan',
    message: IS_PROD ? 'Data belum dapat dimuat. Silakan coba lagi.' : err.message,
  });
});

server.listen(PORT, () => {
  console.log(`\n  ARRZ MARKET server berjalan di http://localhost:${PORT}`);
  console.log(`  Environment: ${NODE_ENV}\n`);
});

module.exports = { app, server };
