const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'absensi.db');
const db = new Database(dbPath);

// Aktifkan WAL mode untuk performa lebih baik
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Buat Tabel ────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS karyawan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nip TEXT UNIQUE NOT NULL,
    nama TEXT NOT NULL,
    jabatan TEXT,
    departemen TEXT,
    email TEXT,
    telepon TEXT,
    foto TEXT,
    face_descriptor TEXT,
    aktif INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS absensi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    karyawan_id INTEGER NOT NULL,
    tanggal DATE NOT NULL,
    jam_masuk TIME,
    jam_pulang TIME,
    lat_masuk REAL,
    lng_masuk REAL,
    lat_pulang REAL,
    lng_pulang REAL,
    jarak_masuk REAL,
    jarak_pulang REAL,
    status TEXT DEFAULT 'hadir',
    keterangan TEXT,
    foto_masuk TEXT,
    foto_pulang TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (karyawan_id) REFERENCES karyawan(id),
    UNIQUE(karyawan_id, tanggal)
  );

  CREATE TABLE IF NOT EXISTS lokasi_kantor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    radius INTEGER DEFAULT 100,
    aktif INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS pengaturan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunci TEXT UNIQUE NOT NULL,
    nilai TEXT NOT NULL
  );
`);

// ─── Seed Data Default ──────────────────────────────────────────────────────

// Admin default
const adminExist = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExist) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  console.log('✅ Admin default dibuat: admin / admin123');
}

// Lokasi kantor default
const lokasiExist = db.prepare('SELECT id FROM lokasi_kantor WHERE aktif = 1').get();
if (!lokasiExist) {
  db.prepare(`
    INSERT INTO lokasi_kantor (nama, lat, lng, radius, aktif)
    VALUES (?, ?, ?, ?, 1)
  `).run('Kantor Sekda', -6.2088, 106.8456, 100);
  console.log('✅ Lokasi kantor default dibuat');
}

// Pengaturan default
const defaultSettings = [
  { kunci: 'jam_masuk', nilai: '08:00' },
  { kunci: 'jam_pulang', nilai: '17:00' },
  { kunci: 'toleransi_menit', nilai: '30' },
  { kunci: 'nama_instansi', nilai: 'Sekretariat Daerah' },
  { kunci: 'tahun_anggaran', nilai: new Date().getFullYear().toString() },
];

const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO pengaturan (kunci, nilai) VALUES (?, ?)
`);
defaultSettings.forEach(s => insertSetting.run(s.kunci, s.nilai));

console.log('✅ Database siap digunakan');

module.exports = db;
