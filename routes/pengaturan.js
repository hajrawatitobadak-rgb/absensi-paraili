const express = require('express');
const router  = express.Router();
const db      = require('../database/db-adapter');
const { requireAuth } = require('../middleware/auth');

router.get('/api/semua', requireAuth, async (req,res)=>{
  try{
    const data=await db.all('SELECT * FROM pengaturan');
    const obj={};
    data.forEach(d=>obj[d.kunci]=d.nilai);
    res.json({success:true,data:obj});
  }catch(e){res.json({success:false,message:e.message});}
});

router.post('/api/simpan', requireAuth, async (req,res)=>{
  try{
    for(const[k,v] of Object.entries(req.body))
      await db.upsertSetting(k, String(v));
    res.json({success:true,message:'Pengaturan berhasil disimpan'});
  }catch(e){res.json({success:false,message:e.message});}
});

router.get('/api/lokasi', async (req,res)=>{
  try{
    res.json({success:true,data:await db.get('SELECT * FROM lokasi_kantor WHERE aktif=1 LIMIT 1')});
  }catch(e){res.json({success:false,message:e.message});}
});

router.post('/api/lokasi', requireAuth, async (req,res)=>{
  try{
    const{nama,lat,lng,radius}=req.body;
    if(!lat||!lng) return res.json({success:false,message:'Koordinat tidak valid'});
    const ex=await db.get('SELECT id FROM lokasi_kantor WHERE aktif=1 LIMIT 1');
    if(ex) await db.run('UPDATE lokasi_kantor SET nama=?,lat=?,lng=?,radius=? WHERE id=?',[nama||'Kantor Desa Paraili',lat,lng,radius||200,ex.id]);
    else   await db.run('INSERT INTO lokasi_kantor(nama,lat,lng,radius,aktif) VALUES(?,?,?,?,1)',[nama||'Kantor Desa Paraili',lat,lng,radius||200]);
    res.json({success:true,message:'Lokasi kantor diperbarui'});
  }catch(e){res.json({success:false,message:e.message});}
});

module.exports = router;
