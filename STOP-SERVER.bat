@echo off
title Menghentikan Server Absensi
color 0C
cls
echo.
echo  Menghentikan Server Absensi Desa Paraili...
echo.
taskkill /IM node.exe /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 "') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo  Server berhasil dihentikan.
echo.
timeout /t 2 >nul
