const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../database/db-adapter');

const loginAttempts = new Map();
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000;
const MIN_PASS_LEN  = 6;
const GENERIC_FAIL  = 'Username atau password salah.';

setInterval(() => {
  const now = Date.now();
  for (const [ip, d] of loginAttempts.entries())
    if (now - d.lastAttempt > LOCKOUT_MS) loginAttempts.delete(ip);
}, 30 * 60 * 1000);

function getIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}
function sanitize(s) {
  return typeof s === 'string' ? s.replace(/[<>"'`;]/g,'').trim().slice(0,100) : '';
}

// POST /auth/login
router.post('/login', async (req, res) => {
  const ip     = getIP(req);
  const record = loginAttempts.get(ip) || { count:0, lockedUntil:0, lastAttempt:0 };
  const now    = Date.now();

  if (record.lockedUntil > now) {
    const sisa = Math.ceil((record.lockedUntil - now) / 1000);
    return res.status(429).json({ success:false, message:`Akun dikunci. Coba lagi dalam ${sisa} detik.`, lockedFor:sisa });
  }

  const username = sanitize(req.body.username || '');
  const password = sanitize(req.body.password || '');

  if (!username || !password)
    return res.status(400).json({ success:false, message:'Username dan password wajib diisi.' });
  if (username.length < 3 || password.length < MIN_PASS_LEN)
    return res.status(400).json({ success:false, message: GENERIC_FAIL });

  const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  const dummy = '$2a$10$dummyhashfortiminggprotectiononly000000000000000000000';
  const valid = await bcrypt.compare(password, user ? user.password : dummy);

  if (!user || !valid) {
    record.count++; record.lastAttempt = now;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS;
      loginAttempts.set(ip, record);
      return res.status(429).json({ success:false, message:`Terlalu banyak percobaan. Dikunci ${LOCKOUT_MS/60000} menit.`, lockedFor:LOCKOUT_MS/1000 });
    }
    loginAttempts.set(ip, record);
    return res.status(401).json({ success:false, message:`${GENERIC_FAIL} Sisa ${MAX_ATTEMPTS-record.count} percobaan.`, attemptsLeft:MAX_ATTEMPTS-record.count });
  }

  loginAttempts.delete(ip);
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ success:false, message:'Kesalahan sesi.' });
    req.session.user           = { id:user.id, username:user.username, role:user.role, loginAt:new Date().toISOString(), ip };
    req.session.isAuthenticated = true;
    res.json({ success:true, message:'Login berhasil', redirect:'/dashboard' });
  });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('absesi_sid');
    res.json({ success:true, redirect:'/login' });
  });
});

// GET /auth/me
router.get('/me', (req, res) => {
  if (req.session?.isAuthenticated && req.session?.user) {
    const { id, username, role } = req.session.user;
    return res.json({ success:true, user:{ id, username, role } });
  }
  res.status(401).json({ success:false, message:'Sesi tidak aktif' });
});

// POST /auth/change-password
router.post('/change-password', async (req, res) => {
  if (!req.session?.isAuthenticated)
    return res.status(401).json({ success:false, message:'Belum login' });

  const { password_lama, password_baru, password_konfirm } = req.body;
  if (!password_lama || !password_baru)
    return res.json({ success:false, message:'Semua field wajib diisi' });
  if (password_baru.length < 8)
    return res.json({ success:false, message:'Password baru minimal 8 karakter' });
  if (password_baru !== password_konfirm)
    return res.json({ success:false, message:'Konfirmasi password tidak cocok' });
  if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password_baru))
    return res.json({ success:false, message:'Password harus mengandung huruf dan angka' });

  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  if (!user) return res.status(404).json({ success:false, message:'User tidak ditemukan' });

  if (!await bcrypt.compare(password_lama, user.password))
    return res.json({ success:false, message:'Password lama salah' });

  const hash = await bcrypt.hash(password_baru, 12);
  await db.run('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
  res.json({ success:true, message:'Password berhasil diubah' });
});

// GET /auth/status-lockout
router.get('/status-lockout', (req, res) => {
  const record = loginAttempts.get(getIP(req));
  if (!record || record.lockedUntil <= Date.now())
    return res.json({ locked:false, attemptsLeft:MAX_ATTEMPTS });
  res.json({ locked:true, lockedFor:Math.ceil((record.lockedUntil-Date.now())/1000), attemptsLeft:0 });
});

module.exports = router;
