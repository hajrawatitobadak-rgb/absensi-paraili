/**
 * db-adapter.js — Auto-detect PostgreSQL (Railway) vs SQLite (lokal)
 * Jika DATABASE_URL ada → PostgreSQL, jika tidak → SQLite
 */
const path   = require('path');
const bcrypt = require('bcryptjs');
const USE_PG = !!process.env.DATABASE_URL;

if (USE_PG) {
  // ── POSTGRESQL ──────────────────────────────────────────────────────────────
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  (async () => {
    const c = await pool.connect();
    try {
      await c.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL, role TEXT DEFAULT 'admin',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS karyawan (
          id SERIAL PRIMARY KEY, nip TEXT UNIQUE NOT NULL, nama TEXT NOT NULL,
          jabatan TEXT, departemen TEXT, email TEXT, telepon TEXT,
          foto TEXT, face_descriptor TEXT, aktif INTEGER DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS absensi (
          id SERIAL PRIMARY KEY, karyawan_id INTEGER NOT NULL REFERENCES karyawan(id),
          tanggal DATE NOT NULL, jam_masuk TIME, jam_pulang TIME,
          lat_masuk REAL, lng_masuk REAL, lat_pulang REAL, lng_pulang REAL,
          jarak_masuk REAL, jarak_pulang REAL, status TEXT DEFAULT 'hadir',
          keterangan TEXT, foto_masuk TEXT, foto_pulang TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(karyawan_id, tanggal)
        );
        CREATE TABLE IF NOT EXISTS lokasi_kantor (
          id SERIAL PRIMARY KEY, nama TEXT NOT NULL, lat REAL NOT NULL,
          lng REAL NOT NULL, radius INTEGER DEFAULT 200, aktif INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS pengaturan (
          id SERIAL PRIMARY KEY, kunci TEXT UNIQUE NOT NULL, nilai TEXT NOT NULL
        );
      `);

      const ar = await c.query("SELECT id FROM users WHERE username='admin'");
      if (!ar.rowCount) {
        await c.query('INSERT INTO users(username,password,role) VALUES($1,$2,$3)',
          ['admin', bcrypt.hashSync('admin123', 10), 'admin']);
        console.log('✅ Admin default dibuat');
      }
      const lr = await c.query('SELECT id FROM lokasi_kantor WHERE aktif=1 LIMIT 1');
      if (!lr.rowCount) {
        await c.query('INSERT INTO lokasi_kantor(nama,lat,lng,radius,aktif) VALUES($1,$2,$3,$4,1)',
          ['Kantor Desa Paraili', -2.5489, 119.3248, 200]);
      }
      for (const [k,v] of [['jam_masuk','08:00'],['jam_pulang','17:00'],
            ['toleransi_menit','30'],['nama_instansi','Desa Paraili'],
            ['tahun_anggaran', String(new Date().getFullYear())]]) {
        await c.query('INSERT INTO pengaturan(kunci,nilai) VALUES($1,$2) ON CONFLICT(kunci) DO NOTHING',[k,v]);
      }
      console.log('✅ PostgreSQL siap');
    } finally { c.release(); }
  })().catch(e => console.error('❌ PG init error:', e.message));

  // Konversi ? → $1,$2,... dan fungsi SQLite → PG
  function pg(sql, params=[]) {
    let i=0;
    const s = sql
      .replace(/strftime\('%m',([^)]+)\)/gi, "TO_CHAR($1,'MM')")
      .replace(/strftime\('%Y',([^)]+)\)/gi, "TO_CHAR($1,'YYYY')")
      .replace(/\bINSERT OR IGNORE\b/gi,'INSERT')
      .replace(/\bINSERT OR REPLACE\b/gi,'INSERT')
      .replace(/\?/g, ()=>`$${++i}`);
    return { s, params };
  }

  module.exports = {
    isPG: true,
    async get(sql,p=[]){ const {s,params}=pg(sql,p); const r=await pool.query(s,params); return r.rows[0]||null; },
    async all(sql,p=[]){ const {s,params}=pg(sql,p); const r=await pool.query(s,params); return r.rows; },
    async run(sql,p=[]){ const {s,params}=pg(sql,p); const r=await pool.query(s,params); return {lastInsertRowid:r.rows[0]?.id||null,changes:r.rowCount}; },
    async upsertSetting(k,v){ await pool.query('INSERT INTO pengaturan(kunci,nilai) VALUES($1,$2) ON CONFLICT(kunci) DO UPDATE SET nilai=$2',[k,v]); },
    pool
  };

} else {
  // ── SQLITE (lokal) ──────────────────────────────────────────────────────────
  const Database = require('better-sqlite3');
  const sqlite   = new Database(path.join(__dirname, 'absensi.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'admin', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS karyawan (id INTEGER PRIMARY KEY AUTOINCREMENT, nip TEXT UNIQUE NOT NULL, nama TEXT NOT NULL, jabatan TEXT, departemen TEXT, email TEXT, telepon TEXT, foto TEXT, face_descriptor TEXT, aktif INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS absensi (id INTEGER PRIMARY KEY AUTOINCREMENT, karyawan_id INTEGER NOT NULL, tanggal DATE NOT NULL, jam_masuk TIME, jam_pulang TIME, lat_masuk REAL, lng_masuk REAL, lat_pulang REAL, lng_pulang REAL, jarak_masuk REAL, jarak_pulang REAL, status TEXT DEFAULT 'hadir', keterangan TEXT, foto_masuk TEXT, foto_pulang TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (karyawan_id) REFERENCES karyawan(id), UNIQUE(karyawan_id, tanggal));
    CREATE TABLE IF NOT EXISTS lokasi_kantor (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, radius INTEGER DEFAULT 200, aktif INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS pengaturan (id INTEGER PRIMARY KEY AUTOINCREMENT, kunci TEXT UNIQUE NOT NULL, nilai TEXT NOT NULL);
  `);

  if (!sqlite.prepare('SELECT id FROM users WHERE username=?').get('admin')) {
    sqlite.prepare('INSERT INTO users(username,password,role) VALUES(?,?,?)').run('admin', bcrypt.hashSync('admin123',10), 'admin');
    console.log('✅ Admin default dibuat: admin / admin123');
  }
  if (!sqlite.prepare('SELECT id FROM lokasi_kantor WHERE aktif=1').get()) {
    sqlite.prepare('INSERT INTO lokasi_kantor(nama,lat,lng,radius,aktif) VALUES(?,?,?,?,1)').run('Kantor Desa Paraili',-2.5489,119.3248,200);
  }
  for (const [k,v] of [['jam_masuk','08:00'],['jam_pulang','17:00'],['toleransi_menit','30'],
        ['nama_instansi','Desa Paraili'],['tahun_anggaran',String(new Date().getFullYear())]]) {
    sqlite.prepare('INSERT OR IGNORE INTO pengaturan(kunci,nilai) VALUES(?,?)').run(k,v);
  }
  console.log('✅ SQLite siap digunakan');

  module.exports = {
    isPG: false,
    async get(sql,p=[]){ return sqlite.prepare(sql).get(...p)||null; },
    async all(sql,p=[]){ return sqlite.prepare(sql).all(...p); },
    async run(sql,p=[]){ const r=sqlite.prepare(sql).run(...p); return {lastInsertRowid:r.lastInsertRowid,changes:r.changes}; },
    async upsertSetting(k,v){ sqlite.prepare('INSERT OR REPLACE INTO pengaturan(kunci,nilai) VALUES(?,?)').run(k,v); },
    sqlite
  };
}
