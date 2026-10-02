require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const path       = require('path');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

// Initialize database (auto: PostgreSQL di Railway, SQLite lokal)
const db = require('./database/db-adapter');

const app  = express();
const PORT = process.env.PORT || 3000;

// Percayai proxy Railway/Render (agar session cookie secure bekerja di HTTPS)
app.set('trust proxy', 1);

// ─── 1. HELMET — HTTP Security Headers ───────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",                    // diperlukan face-api.js (WebAssembly eval)
        "https://cdn.jsdelivr.net",         // face-api.js & Chart.js
        "https://cdnjs.cloudflare.com",     // Font Awesome JS (jika ada)
      ],
      scriptSrcAttr: ["'unsafe-inline'"],   // onclick="" di HTML
      styleSrc:    [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",     // Font Awesome CSS
      ],
      imgSrc:      [
        "'self'",
        "data:",
        "blob:",
        "https://upload.wikimedia.org",     // Logo Mamuju Tengah
        "https://*",                        // foto karyawan dari sumber lain jika ada
      ],
      fontSrc:     [
        "'self'",
        "https://cdnjs.cloudflare.com",     // Font Awesome fonts
      ],
      connectSrc:  [
        "'self'",
        "https://cdn.jsdelivr.net",         // face-api.js model weights
        "blob:",
      ],
      mediaSrc:    ["'self'", "blob:"],     // video/audio WebRTC
      workerSrc:   ["'self'", "blob:"],     // Web Worker (face-api.js)
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      childSrc:    ["blob:"],               // WebRTC getUserMedia
      // TIDAK pakai upgradeInsecureRequests di localhost
    },
  },
  crossOriginEmbedderPolicy: false,         // wajib false agar WebRTC kamera bekerja
  crossOriginOpenerPolicy:   false,         // agar popup tidak tertutup
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ─── 2. Nonaktifkan header yang membocorkan info ──────────────────────────────
app.disable('x-powered-by');

// ─── 3. Rate Limiter GLOBAL — 200 req/menit per IP ───────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Terlalu banyak permintaan. Coba lagi sebentar.' }
});
app.use(globalLimiter);

// ─── 4. Rate Limiter LOGIN — 10 req/15 menit per IP (brute-force protection) ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true, // hanya hitung request yang GAGAL
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' }
});

// ─── 5. Rate Limiter ABSENSI — 30 req/menit (anti-spam absensi) ──────────────
const absensiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Terlalu banyak permintaan absensi.' }
});

// ─── 6. Middleware Inti ───────────────────────────────────────────────────────
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── 7. Session yang Aman ────────────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || 'ganti_dengan_string_panjang_acak_sekali_pakai',
  resave:            false,
  saveUninitialized: false,
  name:              'absesi_sid',          // nama cookie tidak generik
  cookie: {
    secure:   process.env.NODE_ENV === 'production', // HTTPS otomatis di Railway
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge:   8 * 60 * 60 * 1000
  }
}));

// ─── 8. Middleware: tandai request AJAX — tolak jika bukan dari browser ───────
app.use('/auth/login', (req, res, next) => {
  if (req.method === 'POST') {
    const ajaxHeader = req.headers['x-requested-with'];
    if (!ajaxHeader || ajaxHeader !== 'XMLHttpRequest') {
      return res.status(403).json({ success: false, message: 'Permintaan tidak valid' });
    }
  }
  next();
});

// ─── 9. Middleware: validasi origin untuk API sensitif ────────────────────────
function checkOrigin(req, res, next) {
  const origin  = req.headers['origin']  || '';
  const referer = req.headers['referer'] || '';
  const host    = req.headers['host']    || '';
  // Izinkan jika origin kosong (same-origin) atau dari host yang sama
  if (!origin || origin.includes(host) || referer.includes(host)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Akses ditolak' });
}

// ─── 10. Routes ──────────────────────────────────────────────────────────────
const authRoutes       = require('./routes/auth');
const karyawanRoutes   = require('./routes/karyawan');
const absensiRoutes    = require('./routes/absensi');
const laporanRoutes    = require('./routes/laporan');
const pengaturanRoutes = require('./routes/pengaturan');

// Login: rate limiter ketat + origin check
app.use('/auth/login', loginLimiter);
app.use('/auth',       authRoutes);

// Absensi: rate limiter
app.use('/absensi/api/masuk',  absensiLimiter);
app.use('/absensi/api/pulang', absensiLimiter);
app.use('/absensi',            absensiRoutes);

app.use('/karyawan',   karyawanRoutes);
app.use('/laporan',    laporanRoutes);
app.use('/pengaturan', pengaturanRoutes);

// ─── 11. Halaman HTML ────────────────────────────────────────────────────────
const { requireAuth } = require('./middleware/auth');

app.get('/', (req, res) => {
  res.redirect(req.session?.user ? '/dashboard' : '/login');
});

app.get('/login', (req, res) => {
  // Jika sudah login, langsung ke dashboard
  if (req.session?.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard',            requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/karyawan/daftar',      requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'karyawan.html')));
app.get('/karyawan/registrasi',  requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'registrasi-wajah.html')));
app.get('/laporan/absensi',      requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'laporan.html')));
app.get('/pengaturan',           requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'pengaturan.html')));

// Halaman absensi — terbuka untuk umum (kios)
app.get('/absensi/scan', (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'absensi.html')));

// ─── 12. 404 ─────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

// ─── 13. Error Handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  // Jangan bocorkan detail error ke client
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
});

// ─── Start — listen di 0.0.0.0 agar HP bisa akses ───────────────────────────
const os = require('os');

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// Route: info server untuk halaman panduan
app.get('/api/server-info', (req, res) => {
  res.json({ ip: getLocalIP(), port: PORT });
});

// Route: panduan akses HP
app.get('/panduan', (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'panduan.html')));

// PWA manifest
app.get('/manifest.json', (req, res) => {
  res.json({
    name:             'Absensi Desa Paraili',
    short_name:       'Absensi',
    description:      'Sistem Absensi Desa Paraili - Kab. Mamuju Tengah',
    start_url:        '/absensi/scan',
    display:          'fullscreen',
    orientation:      'portrait',
    background_color: '#0f2d52',
    theme_color:      '#0f2d52',
    icons: [
      { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Lambang_Kabupaten_Mamuju_Tengah.png/192px-Lambang_Kabupaten_Mamuju_Tengah.png', sizes: '192x192', type: 'image/png' },
    ]
  });
});

// '0.0.0.0' = terima koneksi dari semua device di jaringan yang sama
app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       SISTEM ABSENSI DESA PARAILI - MAMUJU TENGAH       ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Komputer ini : http://localhost:${PORT}                   ║`);
  console.log(`║  HP/Tablet    : http://${ip}:${PORT}                ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Absensi Kios : http://${ip}:${PORT}/absensi/scan   ║`);
  console.log(`║  Login Admin  : http://${ip}:${PORT}/login          ║`);
  console.log(`║  Panduan HP   : http://${ip}:${PORT}/panduan        ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');
});

module.exports = app;
