/**
 * app.js — Shared utilities untuk semua halaman admin
 */

// ─── Toast Notification ──────────────────────────────────────────
window.showToast = function(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className   = `toast toast-${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 3500);
};

// ─── Format tanggal Indonesia ────────────────────────────────────
window.formatTanggal = function(dateStr) {
  if (!dateStr) return '-';
  const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  return new Date(dateStr).toLocaleDateString('id-ID', opts);
};

// ─── Format waktu 24 jam → "HH.mm" ─────────────────────────────
// Input: "08:30:00" atau "08:30" dari database
// Output: "08.30" (format 24 jam dengan titik)
window.formatJam = function(timeStr) {
  if (!timeStr || timeStr === '-') return '-';
  // Ambil jam dan menit saja, ganti : dengan .
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return timeStr;
  return `${parts[0].padStart(2,'0')}.${parts[1].padStart(2,'0')}`;
};

// Format lengkap dengan detik: "08.30.00"
window.formatJamDetik = function(timeStr) {
  if (!timeStr || timeStr === '-') return '-';
  const parts = String(timeStr).trim().split(':');
  const h = (parts[0]||'00').padStart(2,'0');
  const m = (parts[1]||'00').padStart(2,'0');
  const s = (parts[2]||'00').padStart(2,'0');
  return `${h}.${m}.${s}`;
};

// ─── Konfirmasi hapus ────────────────────────────────────────────
window.konfirmasi = function(pesan) {
  return confirm(pesan);
};

// ─── Fetch helper dengan error handling ──────────────────────────
window.apiFetch = async function(url, options = {}) {
  try {
    const res  = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const json = await res.json();
    return json;
  } catch (e) {
    console.error('API Error:', e);
    return { success: false, message: 'Gagal terhubung ke server' };
  }
};

// ─── Debounce ────────────────────────────────────────────────────
window.debounce = function(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// ─── Format angka ────────────────────────────────────────────────
window.formatAngka = function(n) {
  return new Intl.NumberFormat('id-ID').format(n);
};

// ─── Cek session saat halaman load ───────────────────────────────
window.cekSession = async function() {
  const res = await fetch('/auth/me');
  const json = await res.json();
  if (!json.success) {
    window.location.href = '/login';
    return null;
  }
  return json.user;
};

// ─── Auto-redirect jika session habis ────────────────────────────
window.addEventListener('load', () => {
  // Hanya untuk halaman admin (tidak termasuk login & absensi scan)
  const skipPages = ['/login', '/absensi/scan'];
  const isAdminPage = !skipPages.some(p => window.location.pathname.startsWith(p));

  if (isAdminPage && window.location.pathname !== '/') {
    // Session check sudah dilakukan di tiap halaman
  }
});
