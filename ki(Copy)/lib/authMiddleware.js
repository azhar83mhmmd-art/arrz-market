// Middleware untuk melindungi route admin. Wajib sudah login (session aktif).
function requireAdminAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Silakan login terlebih dahulu.' });
}

module.exports = { requireAdminAuth };
