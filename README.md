# 🏢 Aplikasi Absensi Berbasis Wajah & Lokasi
**Sekretariat Daerah — Face Recognition + Geolocation Attendance System**

---

## 📋 Fitur Utama

| Fitur | Keterangan |
|---|---|
| 👤 **Face Recognition** | Deteksi & pencocokan wajah real-time menggunakan face-api.js |
| 📍 **Geolocation** | Validasi lokasi absensi dengan radius kantor (Haversine formula) |
| ⏰ **Absen Masuk & Pulang** | Dua mode dengan deteksi keterlambatan otomatis |
| 📊 **Dashboard Admin** | Statistik real-time + grafik kehadiran bulanan |
| 👥 **Manajemen Karyawan** | CRUD karyawan + registrasi wajah (5 sampel) |
| 📈 **Laporan Lengkap** | Laporan bulanan, rekap per karyawan, export CSV |
| ⚙️ **Pengaturan** | Jam kerja, toleransi, koordinat kantor, ganti password |

---

## 🛠️ Persyaratan Sistem

- **Node.js** v18 atau lebih baru (https://nodejs.org/en/download)
- **npm** (sudah termasuk dalam Node.js)
- Browser modern: Chrome, Edge, Firefox (mendukung WebRTC untuk kamera)
- **HTTPS atau localhost** (diperlukan untuk akses kamera & GPS)

---

## 🚀 Cara Instalasi & Menjalankan

### Langkah 1: Install Node.js
Download dan install Node.js dari https://nodejs.org/en/download
Pilih versi **LTS (Long Term Support)**

Verifikasi instalasi:
```
node --version
npm --version
```

### Langkah 2: Install Dependencies
Buka terminal/command prompt, masuk ke folder ini:
```
cd "d:\SOURCODE WEBSITE\Website Sekertariat\mateng_sekda_update\mateng_sekda\absensi-app"
npm install
```

### Langkah 3: Konfigurasi Lokasi Kantor
Edit file `.env` dan sesuaikan koordinat kantor Anda:
```env
OFFICE_LAT=-6.2088        # Latitude kantor
OFFICE_LNG=106.8456       # Longitude kantor
OFFICE_RADIUS=100         # Radius absensi dalam meter
JAM_MASUK=08:00
JAM_PULANG=17:00
TOLERANSI_MENIT=30
```

> **Tips:** Buka Google Maps, klik kanan pada lokasi kantor → "What's here?" untuk mendapatkan koordinat.

### Langkah 4: Jalankan Aplikasi
```
npm start
```
atau untuk development dengan auto-reload:
```
npm run dev
```

### Langkah 5: Buka Browser
- **Panel Admin:** http://localhost:3000/login
- **Halaman Absensi Karyawan:** http://localhost:3000/absensi/scan

---

## 🔑 Akun Default

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Administrator |

> ⚠️ **Segera ganti password** setelah login pertama kali melalui menu Pengaturan.

---

## 📱 Alur Penggunaan

### Admin (Setup Awal)
1. Login di `/login` → `admin / admin123`
2. Pergi ke **Pengaturan** → set koordinat kantor yang benar
3. Buka **Karyawan** → tambah data karyawan
4. Pergi ke **Registrasi Wajah** → ambil 5 foto wajah tiap karyawan
5. Selesai! Karyawan sudah bisa absen

### Karyawan (Absensi Harian)
1. Buka `http://localhost:3000/absensi/scan`
2. Pilih mode: **Absen Masuk** atau **Absen Pulang**
3. Izinkan akses kamera & lokasi saat diminta browser
4. Arahkan wajah ke kamera → sistem otomatis mengenali
5. Klik tombol **Absen** → selesai!

---

## 🗂️ Struktur Folder

```
absensi-app/
├── server.js              # Entry point aplikasi
├── .env                   # Konfigurasi environment
├── package.json
│
├── database/
│   ├── db.js              # Inisialisasi SQLite + seed data
│   └── absensi.db         # Database (dibuat otomatis)
│
├── routes/
│   ├── auth.js            # Login, logout, ganti password
│   ├── karyawan.js        # CRUD karyawan + face descriptor
│   ├── absensi.js         # Proses absensi masuk & pulang
│   ├── laporan.js         # Laporan & export CSV
│   └── pengaturan.js      # Pengaturan sistem & lokasi
│
├── middleware/
│   └── auth.js            # Session authentication
│
├── views/                 # Halaman HTML
│   ├── login.html
│   ├── dashboard.html
│   ├── karyawan.html
│   ├── registrasi-wajah.html
│   ├── absensi.html       # Halaman kiosk absensi
│   ├── laporan.html
│   ├── pengaturan.html
│   └── 404.html
│
└── public/
    ├── css/
    │   ├── style.css      # Style global admin
    │   └── absensi.css    # Style halaman absensi
    ├── js/
    │   └── app.js         # Utility JS frontend
    ├── images/            # Foto karyawan & absensi
    └── models/            # (opsional) model face-api lokal
```

---

## ⚙️ Konfigurasi Lanjutan

### Menggunakan Model face-api.js Secara Lokal (Opsional)
Jika koneksi internet lambat, download model ke folder `public/models/`:
```
https://github.com/justadudewhohacks/face-api.js/tree/master/weights
```
File yang dibutuhkan:
- `tiny_face_detector_model-weights_manifest.json` + shard
- `face_landmark_68_model-weights_manifest.json` + shard
- `face_recognition_model-weights_manifest.json` + shard

Lalu ubah `MODEL_URL` di `registrasi-wajah.html` dan `absensi.html` menjadi:
```javascript
const MODEL_URL = '/models';
```

### Port Berbeda
Edit `.env`:
```env
PORT=8080
```

---

## 🔒 Keamanan Produksi

Sebelum deploy ke server produksi:
1. Ubah `SESSION_SECRET` di `.env` menjadi string acak yang panjang
2. Set `secure: true` pada cookie session (gunakan HTTPS)
3. Tambahkan rate limiting pada endpoint absensi
4. Backup database `absensi.db` secara berkala

---

## 🌐 Akses dari Perangkat Lain (LAN)

Agar bisa diakses dari HP atau komputer lain di jaringan yang sama:
1. Cari IP lokal komputer server: `ipconfig` (Windows)
2. Akses dari HP: `http://192.168.x.x:3000/absensi/scan`
3. **Penting:** Kamera HP memerlukan HTTPS. Untuk LAN, gunakan ngrok atau setup SSL.

---

## 📞 Troubleshooting

| Masalah | Solusi |
|---|---|
| Kamera tidak muncul | Pastikan browser diberi izin kamera; gunakan HTTPS atau localhost |
| "Lokasi ditolak" | Izinkan akses lokasi di browser; gunakan HTTPS |
| "Wajah tidak dikenal" | Pastikan wajah sudah diregistrasi; coba registrasi ulang dengan pencahayaan lebih baik |
| Model AI lama loading | Gunakan model lokal (lihat bagian Konfigurasi Lanjutan) |
| GPS tidak akurat | Gunakan HP dengan GPS aktif; tunggu beberapa saat agar GPS lock |
