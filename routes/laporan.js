const express = require('express');
const router  = express.Router();
const db      = require('../database/db-adapter');
const { requireAuth } = require('../middleware/auth');
const moment  = require('moment');

function bulanFilter(col, bln, thn, isPG) {
  return isPG
    ? `TO_CHAR(${col},'MM') = '${bln}' AND TO_CHAR(${col},'YYYY') = '${thn}'`
    : `strftime('%m',${col}) = '${bln}' AND strftime('%Y',${col}) = '${thn}'`;
}

// ── Helper: hitung durasi kerja dalam menit dari jam_masuk & jam_pulang ───────
function hitungDurasiMenit(jamMasuk, jamPulang) {
  if (!jamMasuk || !jamPulang) return 0;
  const [mh, mm] = jamMasuk.split(':').map(Number);
  const [ph, pm] = jamPulang.split(':').map(Number);
  return (ph * 60 + pm) - (mh * 60 + mm);
}

// ── Format menit → "Xj Ym" ────────────────────────────────────────────────────
function formatDurasi(menit) {
  if (!menit || menit <= 0) return '-';
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return j > 0 ? `${j}j ${m}m` : `${m}m`;
}

router.get('/api/bulanan', requireAuth, async (req,res)=>{
  try{
    const bln=(req.query.bulan||moment().format('MM')).padStart(2,'0');
    const thn=req.query.tahun||moment().format('YYYY');
    const{departemen,karyawan_id}=req.query;
    let sql=`SELECT a.*,k.nama,k.nip,k.jabatan,k.departemen FROM absensi a JOIN karyawan k ON a.karyawan_id=k.id WHERE ${bulanFilter('a.tanggal',bln,thn,db.isPG)}`,p=[];
    if(departemen){sql+=db.isPG?` AND k.departemen=$${p.length+1}`:' AND k.departemen=?';p.push(departemen);}
    if(karyawan_id){sql+=db.isPG?` AND a.karyawan_id=$${p.length+1}`:' AND a.karyawan_id=?';p.push(karyawan_id);}
    sql+=' ORDER BY a.tanggal ASC, k.nama ASC';
    const raw = await db.all(sql,p);
    // Hitung durasi & status jam kerja tiap baris
    const data = raw.map(r => {
      const durMenit  = hitungDurasiMenit(r.jam_masuk, r.jam_pulang);
      const minKerja  = 8 * 60; // minimal 8 jam
      return {
        ...r,
        durasi_menit:  durMenit,
        durasi_label:  formatDurasi(durMenit),
        kurang_menit:  durMenit > 0 ? Math.max(0, minKerja - durMenit) : null,
        status_jam:    r.jam_pulang
          ? (durMenit >= minKerja ? 'cukup' : 'kurang')
          : (r.jam_masuk ? 'belum_pulang' : 'tidak_hadir')
      };
    });
    res.json({success:true,data});
  }catch(e){res.json({success:false,message:e.message});}
});

router.get('/api/rekap', requireAuth, async (req,res)=>{
  try{
    const dari   = req.query.dari   || moment().startOf('month').format('YYYY-MM-DD');
    const sampai = req.query.sampai || moment().endOf('month').format('YYYY-MM-DD');
    const { departemen } = req.query;

    // Ambil semua absensi dalam rentang
    let sqlAbsen = `
      SELECT a.karyawan_id, a.jam_masuk, a.jam_pulang, a.status, a.tanggal
      FROM absensi a
      WHERE a.tanggal BETWEEN ? AND ?
    `;
    const pAbsen = [dari, sampai];
    if (departemen) {
      sqlAbsen += ` AND a.karyawan_id IN (SELECT id FROM karyawan WHERE departemen = ?)`;
      pAbsen.push(departemen);
    }
    const absensiList = await db.all(sqlAbsen, pAbsen);

    // Group by karyawan_id
    const mapAbsen = {};
    absensiList.forEach(a => {
      if (!mapAbsen[a.karyawan_id]) mapAbsen[a.karyawan_id] = [];
      mapAbsen[a.karyawan_id].push(a);
    });

    // Hitung hari kerja (Senin-Jumat) dalam rentang
    let hariKerja = 0;
    const cur = moment(dari);
    const end = moment(sampai);
    while (cur <= end) {
      if (cur.isoWeekday() <= 5) hariKerja++;
      cur.add(1,'days');
    }

    // Ambil semua karyawan aktif
    let sqlK = `SELECT id, nip, nama, jabatan, departemen FROM karyawan WHERE aktif = 1`;
    const pK = [];
    if (departemen) { sqlK += ' AND departemen = ?'; pK.push(departemen); }
    sqlK += ' ORDER BY nama ASC';
    const karyawanList = await db.all(sqlK, pK);

    const MIN_KERJA_HARI = 8 * 60; // 8 jam per hari dalam menit

    const data = karyawanList.map(k => {
      const absen   = mapAbsen[k.id] || [];
      const hadir   = absen.filter(a => a.jam_masuk).length;
      const terlambat = absen.filter(a => a.status === 'terlambat').length;
      const pulang  = absen.filter(a => a.jam_pulang).length;
      const absensi = hariKerja - hadir;

      // Total durasi kerja
      let totalMenit = 0;
      let hariCukup  = 0;
      let hariKurang = 0;
      absen.forEach(a => {
        const dur = hitungDurasiMenit(a.jam_masuk, a.jam_pulang);
        totalMenit += dur;
        if (a.jam_pulang) {
          if (dur >= MIN_KERJA_HARI) hariCukup++;
          else hariKurang++;
        }
      });

      const targetMenit = hadir * MIN_KERJA_HARI;
      const kurangTotal = Math.max(0, targetMenit - totalMenit);
      const persenHadir = hariKerja > 0 ? Math.round((hadir / hariKerja) * 100) : 0;

      return {
        ...k,
        hari_kerja: hariKerja,
        total_hadir: hadir,
        total_absen: absensi,
        total_terlambat: terlambat,
        total_pulang: pulang,
        total_menit_kerja: totalMenit,
        total_durasi_label: formatDurasi(totalMenit),
        hari_cukup: hariCukup,
        hari_kurang: hariKurang,
        kurang_total_menit: kurangTotal,
        kurang_total_label: kurangTotal > 0 ? formatDurasi(kurangTotal) : '-',
        persen_hadir: persenHadir,
        status_kehadiran: persenHadir >= 90 ? 'baik'
          : persenHadir >= 75 ? 'cukup' : 'kurang'
      };
    });

    res.json({ success:true, data, dari, sampai, hari_kerja: hariKerja });
  }catch(e){res.json({success:false,message:e.message});}
});

router.get('/api/harian/:tanggal', requireAuth, async (req,res)=>{
  try{
    const data=await db.all('SELECT a.*,k.nama,k.nip,k.jabatan,k.departemen,k.foto FROM karyawan k LEFT JOIN absensi a ON k.id=a.karyawan_id AND a.tanggal=? WHERE k.aktif=1 ORDER BY k.nama ASC',[req.params.tanggal]);
    res.json({success:true,data,tanggal:req.params.tanggal});
  }catch(e){res.json({success:false,message:e.message});}
});

router.get('/api/grafik-bulan', requireAuth, async (req,res)=>{
  try{
    const bln=(req.query.bulan||moment().format('MM')).padStart(2,'0');
    const thn=req.query.tahun||moment().format('YYYY');
    const sql=`SELECT a.tanggal,COUNT(CASE WHEN a.jam_masuk IS NOT NULL THEN 1 END) as hadir,COUNT(CASE WHEN a.status='terlambat' THEN 1 END) as terlambat FROM absensi a WHERE ${bulanFilter('a.tanggal',bln,thn,db.isPG)} GROUP BY a.tanggal ORDER BY a.tanggal ASC`;
    res.json({success:true,data:await db.all(sql,[])});
  }catch(e){res.json({success:false,message:e.message});}
});

router.get('/api/export-csv', requireAuth, async (req,res)=>{
  try{
    const bln=(req.query.bulan||moment().format('MM')).padStart(2,'0');
    const thn=req.query.tahun||moment().format('YYYY');
    const{departemen}=req.query;
    let sql=`SELECT k.nip,k.nama,k.jabatan,k.departemen,a.tanggal,a.jam_masuk,a.jam_pulang,a.status,a.jarak_masuk,a.keterangan FROM absensi a JOIN karyawan k ON a.karyawan_id=k.id WHERE ${bulanFilter('a.tanggal',bln,thn,db.isPG)}`,p=[];
    if(departemen){sql+=db.isPG?` AND k.departemen=$${p.length+1}`:' AND k.departemen=?';p.push(departemen);}
    sql+=' ORDER BY a.tanggal ASC, k.nama ASC';
    const data=await db.all(sql,p);
    // Tambahkan kolom durasi ke CSV
    const header='NIP,Nama,Jabatan,Departemen,Tanggal,Jam Masuk,Jam Pulang,Durasi Kerja,Status Jam,Status,Jarak (m)\n';
    const rows=data.map(r=>{
      const dur = hitungDurasiMenit(r.jam_masuk, r.jam_pulang);
      const statusJam = r.jam_pulang ? (dur >= 480 ? 'Cukup (≥8j)' : `Kurang (${formatDurasi(480-dur)} kurang)`) : '-';
      return `"${r.nip}","${r.nama}","${r.jabatan||''}","${r.departemen||''}","${r.tanggal}","${r.jam_masuk||'-'}","${r.jam_pulang||'-'}","${formatDurasi(dur)}","${statusJam}","${r.status||''}","${r.jarak_masuk||0}"`;
    }).join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename=absensi_${bln}_${thn}.csv`);
    res.send('\uFEFF'+header+rows);
  }catch(e){res.status(500).send('Error: '+e.message);}
});

// Export CSV Rekap Bulanan per Pegawai
router.get('/api/export-rekap-csv', requireAuth, async (req,res)=>{
  try{
    const bln = (req.query.bulan||moment().format('MM')).padStart(2,'0');
    const thn = req.query.tahun||moment().format('YYYY');
    const dari   = `${thn}-${bln}-01`;
    const sampai = moment(`${thn}-${bln}-01`).endOf('month').format('YYYY-MM-DD');

    // Re-use logic rekap
    const fakeReq = { query: { dari, sampai, departemen: req.query.departemen } };
    const rekapData = await new Promise((resolve, reject) => {
      const fakeRes = { json: d => resolve(d) };
      router.handle({ ...fakeReq, method:'GET', url:'/api/rekap' }, fakeRes, reject);
    });

    if (!rekapData?.success) throw new Error('Gagal ambil data rekap');

    const header = 'NIP,Nama,Jabatan,Departemen,Hari Kerja,Hadir,Tidak Hadir,Terlambat,Total Jam Kerja,Hari Cukup (≥8j),Hari Kurang (<8j),Kekurangan Jam,% Kehadiran,Status\n';
    const rows = rekapData.data.map(k =>
      `"${k.nip}","${k.nama}","${k.jabatan||''}","${k.departemen||''}","${k.hari_kerja}","${k.total_hadir}","${k.total_absen}","${k.total_terlambat}","${k.total_durasi_label}","${k.hari_cukup}","${k.hari_kurang}","${k.kurang_total_label}","${k.persen_hadir}%","${k.status_kehadiran}"`
    ).join('\n');

    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename=rekap_${bln}_${thn}.csv`);
    res.send('\uFEFF'+header+rows);
  }catch(e){res.status(500).send('Error: '+e.message);}
});

module.exports = router;

// ── DELETE /laporan/api/hapus/:id — hapus 1 baris absensi ────────────────────
router.delete('/api/hapus/:id', requireAuth, async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM absensi WHERE id = ?', [req.params.id]);
    if (!row) return res.json({ success: false, message: 'Data tidak ditemukan' });
    await db.run('DELETE FROM absensi WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Data absensi berhasil dihapus' });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// ── DELETE /laporan/api/hapus-bulan — hapus semua absensi bulan tertentu ─────
router.delete('/api/hapus-bulan', requireAuth, async (req, res) => {
  try {
    const { bulan, tahun } = req.body;
    if (!bulan || !tahun) return res.json({ success: false, message: 'Bulan dan tahun wajib diisi' });
    const bln = String(bulan).padStart(2, '0');
    const sql = db.isPG
      ? `DELETE FROM absensi WHERE TO_CHAR(tanggal,'MM')=$1 AND TO_CHAR(tanggal,'YYYY')=$2`
      : `DELETE FROM absensi WHERE strftime('%m',tanggal)=? AND strftime('%Y',tanggal)=?`;
    const result = await db.run(sql, [bln, String(tahun)]);
    res.json({ success: true, message: `Berhasil menghapus data absensi bulan ${bln}/${tahun}`, deleted: result.changes || 0 });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// ── DELETE /laporan/api/reset-semua — hapus SEMUA data (absensi saja) ─────────
router.delete('/api/reset-semua', requireAuth, async (req, res) => {
  try {
    const { konfirmasi } = req.body;
    if (konfirmasi !== 'HAPUS SEMUA DATA') {
      return res.json({ success: false, message: 'Konfirmasi tidak valid' });
    }
    await db.run('DELETE FROM absensi', []);
    res.json({ success: true, message: 'Semua data absensi berhasil dihapus permanen' });
  } catch(e) { res.json({ success: false, message: e.message }); }
});
