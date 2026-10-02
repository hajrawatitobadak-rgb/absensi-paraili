@echo off
title Absensi Desa Paraili - Mamuju Tengah
color 0A
cls

echo.
echo  ================================================================
echo    SISTEM ABSENSI DESA PARAILI - KAB. MAMUJU TENGAH
echo  ================================================================
echo.

:: ── Cari Node.js ────────────────────────────────────────────────────────────
set "NODE_EXE="

if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    set "PATH=C:\Program Files\nodejs;%PATH%"
    goto :cek_port
)
if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
    set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
    goto :cek_port
)
where node >nul 2>&1
if %errorlevel%==0 (
    set "NODE_EXE=node"
    goto :cek_port
)

:: Node tidak ditemukan
echo  [ERROR] Node.js tidak ditemukan di komputer ini!
echo.
echo  Silakan download dan install Node.js dari:
echo    https://nodejs.org/en/download
echo.
echo  Pilih versi LTS (Long Term Support), lalu jalankan ulang file ini.
echo.
pause
exit /b 1

:cek_port
:: ── Matikan proses lama di port 3000 ────────────────────────────────────────
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: ── Buka firewall untuk Node.js (agar HP bisa akses) ────────────────────────
netsh advfirewall firewall show rule name="NodeJS-Absensi" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="NodeJS-Absensi" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
)

:: ── Ambil IP lokal ───────────────────────────────────────────────────────────
set "LOCAL_IP=tidak diketahui"
for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| findstr /i "IPv4"') do (
    set "RAW_IP=%%a"
    goto :gotip
)
:gotip
if defined RAW_IP (
    :: Hapus spasi di awal
    for /f "tokens=* delims= " %%b in ("%RAW_IP%") do set "LOCAL_IP=%%b"
)

:: ── Pindah ke direktori aplikasi ────────────────────────────────────────────
cd /d "%~dp0"

:: ── Tampilkan info akses ─────────────────────────────────────────────────────
echo.
echo  ================================================================
echo    SERVER AKTIF - JANGAN TUTUP JENDELA INI!
echo  ================================================================
echo.
echo  [Dari komputer ini]
echo    http://localhost:3000/absensi/scan
echo    http://localhost:3000/login
echo.
echo  [Dari HP Android / iPhone - WiFi yang sama]
echo    http://%LOCAL_IP%:3000/absensi/scan
echo    http://%LOCAL_IP%:3000/login
echo.
echo  [Panduan akses HP]
echo    http://%LOCAL_IP%:3000/panduan
echo.
echo  Akun Admin  :  username=admin  password=admin123
echo.
echo  ================================================================
echo    Tekan Ctrl+C untuk menghentikan server
echo  ================================================================
echo.

:: ── Jalankan Node.js ────────────────────────────────────────────────────────
"%NODE_EXE%" server.js

echo.
echo  [!] Server berhenti. Tekan tombol apa saja untuk keluar...
pause >nul
