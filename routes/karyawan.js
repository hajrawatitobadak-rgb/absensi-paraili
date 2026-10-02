const express = require('express');
const router  = express.Router();
const db      = require('../database/db-adapter');
const { requireAuth } = require('../middleware/auth');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/images/karyawan');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `karyawan_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits:{ fileSize:5*1024*1024 },
  fileFilter:(req,file,cb) => file.mimetype.startsWith('image/') ? cb(null,true) : cb(new Error('Hanya gambar')) });

router.get('/api/list', requireAuth, async (req, res) => {
  try {
    const { search, departemen } = req.query;
    let sql = 'SELECT * FROM karyawan WHERE 1=1', p = [];
    if (search)     { sql += ' AND (nama LIKE ? OR nip LIKE ?)'; p.push(`%${search}%`,`%${search}%`); }
    if (departemen) { sql += ' AND departemen = ?'; p.push(departemen); }
    sql += ' ORDER BY nama ASC';
    res.json({ success:true, data: await db.all(sql, p) });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

router.get('/api/:id', requireAuth, async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM karyawan WHERE id = ?', [req.params.id]);
    row ? res.json({ success:true, data:row }) : res.json({ success:false, message:'Tidak ditemukan' });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

router.post('/api/tambah', requireAuth, upload.single('foto'), async (req, res) => {
  try {
    const { nip, nama, jabatan, departemen, email, telepon } = req.body;
    if (!nip || !nama) return res.json({ success:false, message:'NIP dan nama wajib' });
    if (await db.get('SELECT id FROM karyawan WHERE nip = ?', [nip]))
      return res.json({ success:false, message:'NIP sudah terdaftar' });
    const foto = req.file ? `/images/karyawan/${req.file.filename}` : null;
    const r = await db.run('INSERT INTO karyawan(nip,nama,jabatan,departemen,email,telepon,foto) VALUES(?,?,?,?,?,?,?)',
      [nip,nama,jabatan||'',departemen||'',email||'',telepon||'',foto]);
    res.json({ success:true, message:'Pegawai berhasil ditambahkan', id:r.lastInsertRowid });
  } catch(e) { res.json({ success:false, message:'Gagal: '+e.message }); }
});

router.put('/api/:id', requireAuth, upload.single('foto'), async (req, res) => {
  try {
    const pegawai = await db.get('SELECT * FROM karyawan WHERE id = ?', [req.params.id]);
    if (!pegawai) return res.json({ success:false, message:'Tidak ditemukan' });
    if (req.body.aktif !== undefined && !req.body.nip) {
      await db.run('UPDATE karyawan SET aktif = ? WHERE id = ?', [req.body.aktif, req.params.id]);
      return res.json({ success:true, message:'Status diperbarui' });
    }
    const { nip, nama, jabatan, departemen, email, telepon, aktif } = req.body;
    const foto = req.file ? `/images/karyawan/${req.file.filename}` : pegawai.foto;
    await db.run('UPDATE karyawan SET nip=?,nama=?,jabatan=?,departemen=?,email=?,telepon=?,foto=?,aktif=? WHERE id=?',
      [nip,nama,jabatan||'',departemen||'',email||'',telepon||'',foto,aktif!==undefined?aktif:pegawai.aktif,req.params.id]);
    res.json({ success:true, message:'Data diperbarui' });
  } catch(e) { res.json({ success:false, message:'Gagal: '+e.message }); }
});

router.post('/api/:id/face', requireAuth, async (req, res) => {
  try {
    const { descriptor, foto_base64 } = req.body;
    if (!descriptor) return res.json({ success:false, message:'Data wajah tidak valid' });
    let fotoPath = null;
    if (foto_base64) {
      const dir = path.join(__dirname, '../public/images/karyawan');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
      const fn = `face_${req.params.id}_${Date.now()}.jpg`;
      fs.writeFileSync(path.join(dir,fn), foto_base64.replace(/^data:image\/jpeg;base64,/,''), 'base64');
      fotoPath = `/images/karyawan/${fn}`;
    }
    if (fotoPath) await db.run('UPDATE karyawan SET face_descriptor=?,foto=? WHERE id=?',[JSON.stringify(descriptor),fotoPath,req.params.id]);
    else          await db.run('UPDATE karyawan SET face_descriptor=? WHERE id=?',[JSON.stringify(descriptor),req.params.id]);
    res.json({ success:true, message:'Data wajah disimpan' });
  } catch(e) { res.json({ success:false, message:'Gagal: '+e.message }); }
});

router.get('/api/faces/all', async (req, res) => {
  try {
    const rows = await db.all('SELECT id,nip,nama,jabatan,departemen,foto,face_descriptor FROM karyawan WHERE aktif=1 AND face_descriptor IS NOT NULL');
    res.json({ success:true, data: rows.map(k=>({...k, face_descriptor:JSON.parse(k.face_descriptor)})) });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

router.delete('/api/:id', requireAuth, async (req, res) => {
  try {
    const p = await db.get('SELECT * FROM karyawan WHERE id = ?', [req.params.id]);
    if (!p) return res.json({ success:false, message:'Tidak ditemukan' });
    await db.run('UPDATE karyawan SET aktif = 0 WHERE id = ?', [req.params.id]);
    res.json({ success:true, message:`"${p.nama}" dinonaktifkan` });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

router.delete('/api/:id/permanen', requireAuth, async (req, res) => {
  try {
    const p = await db.get('SELECT * FROM karyawan WHERE id = ?', [req.params.id]);
    if (!p) return res.json({ success:false, message:'Tidak ditemukan' });
    await db.run('DELETE FROM absensi WHERE karyawan_id = ?', [req.params.id]);
    await db.run('DELETE FROM karyawan WHERE id = ?', [req.params.id]);
    res.json({ success:true, message:`Data "${p.nama}" dihapus permanen` });
  } catch(e) { res.json({ success:false, message:'Gagal: '+e.message }); }
});

router.get('/api/departemen/list', requireAuth, async (req, res) => {
  try {
    const rows = await db.all("SELECT DISTINCT departemen FROM karyawan WHERE departemen IS NOT NULL AND departemen != '' ORDER BY departemen");
    res.json({ success:true, data:rows.map(d=>d.departemen) });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

module.exports = router;
