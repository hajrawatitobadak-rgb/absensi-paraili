const express = require('express');
const router  = express.Router();
const db      = require('../database/db-adapter');
const { requireAuth } = require('../middleware/auth');
const path    = require('path');
const fs      = require('fs');
const moment  = require('moment');

function hitungJarak(lat1,lng1,lat2,lng2){
  const R=6371000,dL=(lat2-lat1)*Math.PI/180,dl=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dL/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dl/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}

function simpanFoto(base64,id,tipe){
  if(!base64) return null;
  const dir=path.join(__dirname,'../public/images/absensi');
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  const fn=`absensi_${id}_${tipe}_${Date.now()}.jpg`;
  fs.writeFileSync(path.join(dir,fn),base64.replace(/^data:image\/jpeg;base64,/,''),'base64');
  return `/images/absensi/${fn}`;
}

async function tentukanStatus(jam){
  const r1=await db.get("SELECT nilai FROM pengaturan WHERE kunci='jam_masuk'");
  const r2=await db.get("SELECT nilai FROM pengaturan WHERE kunci='toleransi_menit'");
  const [h,m]=(r1?.nilai||'08:00').split(':').map(Number);
  const tol=parseInt(r2?.nilai||'30');
  const [ha,ma]=jam.split(':').map(Number);
  return (ha*60+ma)<=(h*60+m+tol)?'hadir':'terlambat';
}

router.post('/api/masuk', async (req,res)=>{
  try{
    const{karyawan_id,lat,lng,foto_base64}=req.body;
    if(!karyawan_id||!lat||!lng) return res.json({success:false,message:'Data tidak lengkap'});
    const k=await db.get('SELECT * FROM karyawan WHERE id=? AND aktif=1',[karyawan_id]);
    if(!k) return res.json({success:false,message:'Pegawai tidak ditemukan'});
    const lok=await db.get('SELECT * FROM lokasi_kantor WHERE aktif=1 LIMIT 1');
    if(!lok) return res.json({success:false,message:'Lokasi kantor belum dikonfigurasi'});
    const jarak=hitungJarak(+lat,+lng,lok.lat,lok.lng);
    if(jarak>lok.radius) return res.json({success:false,message:`Anda ${jarak}m dari kantor. Maks ${lok.radius}m`,jarak});
    const tanggal=moment().format('YYYY-MM-DD'),jam=moment().format('HH:mm:ss');
    const ex=await db.get('SELECT * FROM absensi WHERE karyawan_id=? AND tanggal=?',[karyawan_id,tanggal]);
    if(ex?.jam_masuk) return res.json({success:false,message:`Sudah absen masuk pukul ${ex.jam_masuk}`});
    const foto=simpanFoto(foto_base64,karyawan_id,'masuk');
    const status=await tentukanStatus(jam);
    if(ex) await db.run('UPDATE absensi SET jam_masuk=?,lat_masuk=?,lng_masuk=?,jarak_masuk=?,status=?,foto_masuk=? WHERE karyawan_id=? AND tanggal=?',[jam,lat,lng,jarak,status,foto,karyawan_id,tanggal]);
    else   await db.run('INSERT INTO absensi(karyawan_id,tanggal,jam_masuk,lat_masuk,lng_masuk,jarak_masuk,status,foto_masuk) VALUES(?,?,?,?,?,?,?,?)',[karyawan_id,tanggal,jam,lat,lng,jarak,status,foto]);
    res.json({success:true,message:`Absensi masuk berhasil! ${status==='terlambat'?'⚠️ Terlambat':'✅ Tepat waktu'}`,data:{nama:k.nama,jam,tanggal,jarak,status}});
  }catch(e){res.json({success:false,message:e.message});}
});

router.post('/api/pulang', async (req,res)=>{
  try{
    const{karyawan_id,lat,lng,foto_base64}=req.body;
    if(!karyawan_id||!lat||!lng) return res.json({success:false,message:'Data tidak lengkap'});
    const k=await db.get('SELECT * FROM karyawan WHERE id=? AND aktif=1',[karyawan_id]);
    if(!k) return res.json({success:false,message:'Pegawai tidak ditemukan'});
    const lok=await db.get('SELECT * FROM lokasi_kantor WHERE aktif=1 LIMIT 1');
    const jarak=lok?hitungJarak(+lat,+lng,lok.lat,lok.lng):0;
    if(lok&&jarak>lok.radius) return res.json({success:false,message:`Anda ${jarak}m dari kantor. Maks ${lok.radius}m`,jarak});
    const tanggal=moment().format('YYYY-MM-DD'),jam=moment().format('HH:mm:ss');
    const ex=await db.get('SELECT * FROM absensi WHERE karyawan_id=? AND tanggal=?',[karyawan_id,tanggal]);
    if(!ex?.jam_masuk) return res.json({success:false,message:'Belum absen masuk hari ini'});
    if(ex?.jam_pulang)  return res.json({success:false,message:`Sudah absen pulang pukul ${ex.jam_pulang}`});
    const foto=simpanFoto(foto_base64,karyawan_id,'pulang');
    await db.run('UPDATE absensi SET jam_pulang=?,lat_pulang=?,lng_pulang=?,jarak_pulang=?,foto_pulang=? WHERE karyawan_id=? AND tanggal=?',[jam,lat,lng,jarak,foto,karyawan_id,tanggal]);
    res.json({success:true,message:'✅ Absensi pulang berhasil!',data:{nama:k.nama,jam,tanggal,jarak}});
  }catch(e){res.json({success:false,message:e.message});}
});

router.get('/api/hari-ini', requireAuth, async (req,res)=>{
  try{
    const t=moment().format('YYYY-MM-DD');
    const data=await db.all('SELECT a.*,k.nama,k.nip,k.jabatan,k.departemen,k.foto FROM absensi a JOIN karyawan k ON a.karyawan_id=k.id WHERE a.tanggal=? ORDER BY a.jam_masuk ASC',[t]);
    res.json({success:true,data,tanggal:t});
  }catch(e){res.json({success:false,message:e.message});}
});

router.get('/api/stats', requireAuth, async (req,res)=>{
  try{
    const t=moment().format('YYYY-MM-DD');
    const[tot,had,tel,pul]=await Promise.all([
      db.get('SELECT COUNT(*) as n FROM karyawan WHERE aktif=1'),
      db.get('SELECT COUNT(*) as n FROM absensi WHERE tanggal=? AND jam_masuk IS NOT NULL',[t]),
      db.get("SELECT COUNT(*) as n FROM absensi WHERE tanggal=? AND status='terlambat'",[t]),
      db.get('SELECT COUNT(*) as n FROM absensi WHERE tanggal=? AND jam_pulang IS NOT NULL',[t]),
    ]);
    const total=Number(tot?.n||0),hadir=Number(had?.n||0),terlambat=Number(tel?.n||0),pulang=Number(pul?.n||0);
    res.json({success:true,data:{total_karyawan:total,hadir,belum_absen:total-hadir,terlambat,sudah_pulang:pulang,tanggal:t}});
  }catch(e){res.json({success:false,message:e.message});}
});

router.get('/api/cek/:karyawan_id', async (req,res)=>{
  try{
    const t=moment().format('YYYY-MM-DD');
    const[ab,k]=await Promise.all([
      db.get('SELECT * FROM absensi WHERE karyawan_id=? AND tanggal=?',[req.params.karyawan_id,t]),
      db.get('SELECT nama,nip FROM karyawan WHERE id=?',[req.params.karyawan_id]),
    ]);
    res.json({success:true,data:{karyawan:k,absensi:ab||null,sudah_masuk:!!ab?.jam_masuk,sudah_pulang:!!ab?.jam_pulang}});
  }catch(e){res.json({success:false,message:e.message});}
});

module.exports = router;
