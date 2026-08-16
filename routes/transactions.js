const express = require('express');
const router = express.Router();

const { supabasePublic, supabaseAdmin } = require('../lib/supabase');
const { requireAdminAuth } = require('../lib/authMiddleware');
const {
  isNonEmptyString,
  isValidWhatsApp,
  sanitizeText,
} = require('../lib/validators');
const { fillTemplate, formatRupiah, DEFAULT_TEMPLATE_BUY } = require('../lib/waTemplate');

// ── POST /api/transactions ──────────────────────────────────
// Dipanggil saat user klik "Beli Sekarang" dan mengonfirmasi modal.
// Backend memvalidasi status terbaru akun sebelum membuat request & pesan WA.
router.post('/', async (req, res) => {
  try {
    const { account_id, buyer_name, buyer_whatsapp } = req.body || {};

    if (!isNonEmptyString(account_id)) {
      return res.status(400).json({ error: 'Akun tidak valid.' });
    }
    if (!isNonEmptyString(buyer_name)) {
      return res.status(400).json({ error: 'Nama pembeli wajib diisi.' });
    }
    if (!isValidWhatsApp(buyer_whatsapp)) {
      return res.status(400).json({ error: 'Nomor WhatsApp wajib diisi dengan format yang benar.' });
    }

    const { data: account, error: accErr } = await supabasePublic
      .from('accounts')
      .select('id, name, platform, price, status, account_code, categories(name)')
      .eq('id', account_id)
      .maybeSingle();

    if (accErr) throw accErr;
    if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

    if (account.status === 'SOLD') {
      return res.status(409).json({
        error: 'Akun Sudah Terjual',
        message: 'Akun ini baru saja terjual. Silakan pilih akun lainnya.',
      });
    }

    const insertPayload = {
      account_id,
      buyer_name: sanitizeText(buyer_name, 200),
      buyer_whatsapp: sanitizeText(buyer_whatsapp, 30),
      price: account.price,
      status: 'PENDING',
    };

    const { data: transaction, error: insertErr } = await supabaseAdmin
      .from('transactions')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    const { data: settings } = await supabasePublic
      .from('site_settings')
      .select('wa_template_buy, admin_whatsapp')
      .eq('id', 1)
      .maybeSingle();

    const template = settings?.wa_template_buy || DEFAULT_TEMPLATE_BUY;
    const message = fillTemplate(template, {
      'NAMA AKUN': account.name,
      'ID AKUN': account.account_code,
      PLATFORM: account.platform,
      KATEGORI: account.categories?.name || '-',
      HARGA: formatRupiah(account.price),
      'NAMA PEMBELI': insertPayload.buyer_name,
      'NOMOR PEMBELI': insertPayload.buyer_whatsapp,
    });

    const io = req.app.get('io');
    io.to('admin-room').emit('transaction:created', { id: transaction.id, transaction });

    res.status(201).json({
      data: transaction,
      whatsapp: {
        adminNumber: settings?.admin_whatsapp || process.env.ADMIN_WHATSAPP || '',
        message,
      },
    });
  } catch (err) {
    console.error('[POST /api/transactions]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

// ── GET /api/transactions ────────────────────────────────────
// Khusus admin
router.get('/', requireAdminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    let query = supabaseAdmin
      .from('transactions')
      .select('*, accounts(name, account_code, platform)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (isNonEmptyString(status)) {
      query = query.eq('status', status.toUpperCase());
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, pagination: { page: pageNum, limit: limitNum, total: count || 0 } });
  } catch (err) {
    console.error('[GET /api/transactions]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dimuat. Silakan coba lagi.' });
  }
});

// ── PUT /api/transactions/:id ─────────────────────────────────
// Admin mencatat/ubah status transaksi: PENDING | PROCESSING | COMPLETED | CANCELLED
// Catatan: ini pencatatan manual, bukan payment gateway otomatis.
router.put('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body || {};

    if (status !== undefined && !['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'Status tidak valid.' });
    }

    const updatePayload = {};
    if (status !== undefined) updatePayload.status = status;
    if (note !== undefined) updatePayload.note = sanitizeText(note, 2000);

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'Tidak ada data untuk diperbarui.' });
    }

    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!transaction) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });

    // Jika transaksi selesai, tandai akun terkait sebagai SOLD otomatis
    if (status === 'COMPLETED' && transaction.account_id) {
      const { data: updatedAccount, error: accUpdateErr } = await supabaseAdmin
        .from('accounts')
        .update({ status: 'SOLD' })
        .eq('id', transaction.account_id)
        .select('*, account_images(id, image_url, is_primary), categories(name)')
        .maybeSingle();

      if (!accUpdateErr && updatedAccount) {
        const io = req.app.get('io');
        io.emit('account:statusChanged', { id: updatedAccount.id, status: 'SOLD', account: updatedAccount });
      }
    }

    const io = req.app.get('io');
    io.to('admin-room').emit('transaction:updated', { id: transaction.id, transaction });

    res.json({ data: transaction });
  } catch (err) {
    console.error('[PUT /api/transactions/:id]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

module.exports = router;
