@echo off
title Push ke GitHub - Absensi Paraili
color 0A
cls
echo.
echo  ================================================
echo    UPLOAD KE GITHUB - ABSENSI DESA PARAILI
echo  ================================================
echo.
echo  Langkah:
echo  1. Browser akan terbuka untuk login GitHub
echo  2. Login dengan akun GitHub Anda
echo  3. Klik "Authorize Git Credential Manager"
echo  4. Kembali ke jendela ini - upload akan berjalan otomatis
echo.
echo  Tekan sembarang tombol untuk mulai...
pause >nul

set "PATH=C:\Program Files\Git\cmd;%PATH%"
cd /d "%~dp0"

echo.
echo  Sedang menghubungi GitHub...
git push -u origin main

echo.
if %errorlevel% == 0 (
  color 0A
  echo  ================================================
  echo    BERHASIL UPLOAD KE GITHUB!
  echo  ================================================
  echo.
  echo  Cek repository di:
  echo  https://github.com/hajrawatitobadak-rgb/absensi-paraili
  echo.
) else (
  color 0C
  echo  Upload gagal. Pastikan Anda sudah login GitHub.
)
echo.
pause
