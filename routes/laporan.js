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

router.get('/api/bulanan', requireAuth, async (req,res)=>{
  try{
    const bln=(req.query.bulan||moment().format('MM')).padStart(2,'0');
    const thn=req.query.tahun||moment().format('YYYY');
    const{departemen,karyawan_id}=req.query;
    let sql=`SELECT a.*,k.nama,k.nip,k.jabatan,k.departemen FROM absensi a JOIN karyawan k ON a.karyawan_id=k.id WHERE ${bulanFilter('a.tanggal',bln,thn,db.isPG)}`,p=[];
    if(departemen){sql+=db.isPG?` AND k.departemen=$${p.length+1}`:' AND k.departemen=?';p.push(departemen);}
    if(karyawan_id){sql+=db.isPG?` AND a.karyawan_id=$${p.length+1}`:' AND a.karyawan_id=?';p.push(karyawan_id);}
    sql+=' ORDER BY a.tanggal ASC, k.nama ASC';
    res.json({success:true,data:await db.all(sql,p)});
  }catch(e){res.json({success:false,message:e.message});}
});

router.get('/api/rekap', requireAuth, async (req,res)=>{
  try{
    const dari=req.query.dari||moment().startOf('month').format('YYYY-MM-DD');
    const sampai=req.query.sampai||moment().endOf('month').format('YYYY-MM-DD');
    const{departemen}=req.query;
    let sql=`SELECT k.id,k.nip,k.nama,k.jabatan,k.departemen,COUNT(a.id) as total_hadir,SUM(CASE WHEN a.status='terlambat' THEN 1 ELSE 0 END) as total_terlambat,SUM(CASE WHEN a.jam_pulang IS NOT NULL THEN 1 ELSE 0 END) as total_pulang FROM karyawan k LEFT JOIN absensi a ON k.id=a.karyawan_id AND a.tanggal BETWEEN ? AND ? WHERE k.aktif=1`,p=[dari,sampai];
    if(departemen){sql+=' AND k.departemen=?';p.push(departemen);}
    sql+=' GROUP BY k.id,k.nip,k.nama,k.jabatan,k.departemen ORDER BY k.nama ASC';
    res.json({success:true,data:await db.all(sql,p),dari,sampai});
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
    const header='NIP,Nama,Jabatan,Departemen,Tanggal,Jam Masuk,Jam Pulang,Status,Jarak (m),Keterangan\n';
    const rows=data.map(r=>`"${r.nip}","${r.nama}","${r.jabatan||''}","${r.departemen||''}","${r.tanggal}","${r.jam_masuk||'-'}","${r.jam_pulang||'-'}","${r.status||''}","${r.jarak_masuk||0}","${r.keterangan||''}"`).join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename=absensi_${bln}_${thn}.csv`);
    res.send('\uFEFF'+header+rows);
  }catch(e){res.status(500).send('Error: '+e.message);}
});

module.exports = router;
