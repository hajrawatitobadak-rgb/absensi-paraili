/**
 * Middleware autentikasi — cek session aktif
 */
function requireAuth(req, res, next) {
  if (req.session?.isAuthenticated && req.session?.user) {
    return next();
  }
  // API request → kembalikan JSON
  const isApi = req.path.startsWith('/api') ||
                req.xhr ||
                (req.headers.accept || '').includes('application/json');
  if (isApi) {
    return res.status(401).json({ success: false, message: 'Sesi habis, silakan login kembali' });
  }
  // Halaman HTML → redirect ke login
  res.redirect('/login');
}

/**
 * Middleware role admin
 */
function requireAdmin(req, res, next) {
  if (req.session?.isAuthenticated && req.session?.user?.role === 'admin') {
    return next();
  }
  res.status(403).json({ success: false, message: 'Akses ditolak — hanya admin' });
}

module.exports = { requireAuth, requireAdmin };
