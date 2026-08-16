const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

const { supabaseAdmin } = require('../lib/supabase');
const { requireAdminAuth } = require('../lib/authMiddleware');
const { isNonEmptyString } = require('../lib/validators');

// ── POST /api/admin/login ───────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'Username dan password wajib diisi.' });
    }

    const { data: admin, error } = await supabaseAdmin
      .from('admin_profiles')
      .select('id, username, password_hash')
      .eq('username', username.trim())
      .maybeSingle();

    if (error) throw error;

    // Pesan error sengaja dibuat generik (tidak membedakan "username salah"
    // vs "password salah") untuk mencegah enumerasi username.
    if (!admin) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;

    res.json({ success: true, admin: { id: admin.id, username: admin.username } });
  } catch (err) {
    console.error('[POST /api/admin/login]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Tidak dapat memproses login. Silakan coba lagi.' });
  }
});

// ── POST /api/admin/logout ───────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[POST /api/admin/logout]', err.message);
      return res.status(500).json({ error: 'Gagal logout. Silakan coba lagi.' });
    }
    res.clearCookie('arrz.sid');
    res.json({ success: true });
  });
});

// ── GET /api/admin/session ───────────────────────────────────
router.get('/session', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({
      authenticated: true,
      admin: { id: req.session.adminId, username: req.session.adminUsername },
    });
  }
  res.json({ authenticated: false });
});

// ── GET /api/admin/dashboard ─────────────────────────────────
// Ringkasan angka untuk dashboard cards: Total Akun, Tersedia, Sold,
// Pengajuan, Tawaran, Transaksi
router.get('/dashboard', requireAdminAuth, async (req, res) => {
  try {
    const [
      totalAccounts,
      availableAccounts,
      soldAccounts,
      pendingSellRequests,
      pendingOffers,
      totalTransactions,
    ] = await Promise.all([
      supabaseAdmin.from('accounts').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('accounts').select('id', { count: 'exact', head: true }).eq('status', 'AVAILABLE'),
      supabaseAdmin.from('accounts').select('id', { count: 'exact', head: true }).eq('status', 'SOLD'),
      supabaseAdmin.from('sell_requests').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabaseAdmin.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabaseAdmin.from('transactions').select('id', { count: 'exact', head: true }),
    ]);

    res.json({
      data: {
        totalAccounts: totalAccounts.count || 0,
        availableAccounts: availableAccounts.count || 0,
        soldAccounts: soldAccounts.count || 0,
        pendingSellRequests: pendingSellRequests.count || 0,
        pendingOffers: pendingOffers.count || 0,
        totalTransactions: totalTransactions.count || 0,
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/dashboard]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dimuat. Silakan coba lagi.' });
  }
});

module.exports = router;
