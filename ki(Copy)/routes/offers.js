const express = require('express');
const router = express.Router();

const { supabasePublic, supabaseAdmin } = require('../lib/supabase');
const { requireAdminAuth } = require('../lib/authMiddleware');
const {
  isNonEmptyString,
  isValidPositiveNumber,
  isValidWhatsApp,
  sanitizeText,
} = require('../lib/validators');
const { fillTemplate, formatRupiah, DEFAULT_TEMPLATE_OFFER } = require('../lib/waTemplate');

// ── POST /api/offers ────────────────────────────────────────
// Publik mengajukan tawaran harga untuk sebuah akun
router.post('/', async (req, res) => {
  try {
    const { account_id, offer_price, buyer_name, buyer_whatsapp, note } = req.body || {};

    if (!isNonEmptyString(account_id)) {
      return res.status(400).json({ error: 'Akun tidak valid.' });
    }
    if (!isValidPositiveNumber(offer_price) || Number(offer_price) <= 0) {
      return res.status(400).json({ error: 'Harga tawaran harus berupa angka dan tidak boleh kosong.' });
    }
    if (!isNonEmptyString(buyer_name)) {
      return res.status(400).json({ error: 'Nama wajib diisi.' });
    }
    if (!isValidWhatsApp(buyer_whatsapp)) {
      return res.status(400).json({ error: 'Nomor WhatsApp wajib diisi dengan format yang benar.' });
    }

    // Validasi akun masih AVAILABLE sebelum menyimpan tawaran
    const { data: account, error: accErr } = await supabasePublic
      .from('accounts')
      .select('id, name, platform, category_id, price, status, account_code, categories(name)')
      .eq('id', account_id)
      .maybeSingle();

    if (accErr) throw accErr;
    if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    if (account.status === 'SOLD') {
      return res.status(409).json({ error: 'Akun Sudah Terjual', message: 'Akun ini baru saja terjual. Silakan pilih akun lainnya.' });
    }

    const insertPayload = {
      account_id,
      original_price: account.price,
      offer_price: Number(offer_price),
      buyer_name: sanitizeText(buyer_name, 200),
      buyer_whatsapp: sanitizeText(buyer_whatsapp, 30),
      note: sanitizeText(note, 1000),
      status: 'PENDING',
    };

    const { data: offer, error: insertErr } = await supabaseAdmin
      .from('offers')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    // Ambil template dari site_settings jika ada, fallback ke default
    const { data: settings } = await supabasePublic
      .from('site_settings')
      .select('wa_template_offer, admin_whatsapp')
      .eq('id', 1)
      .maybeSingle();

    const template = settings?.wa_template_offer || DEFAULT_TEMPLATE_OFFER;
    const message = fillTemplate(template, {
      'NAMA AKUN': account.name,
      'ID AKUN': account.account_code,
      PLATFORM: account.platform,
      KATEGORI: account.categories?.name || '-',
      'HARGA ASLI': formatRupiah(account.price),
      'HARGA TAWARAN': formatRupiah(offer_price),
      NAMA: insertPayload.buyer_name,
      NOMOR: insertPayload.buyer_whatsapp,
      CATATAN: insertPayload.note || '-',
    });

    const io = req.app.get('io');
    io.to('admin-room').emit('offer:created', { id: offer.id, offer });

    res.status(201).json({
      data: offer,
      whatsapp: {
        adminNumber: settings?.admin_whatsapp || process.env.ADMIN_WHATSAPP || '',
        message,
      },
    });
  } catch (err) {
    console.error('[POST /api/offers]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

// ── GET /api/offers ──────────────────────────────────────────
// Khusus admin: lihat semua tawaran
router.get('/', requireAdminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    let query = supabaseAdmin
      .from('offers')
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
    console.error('[GET /api/offers]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dimuat. Silakan coba lagi.' });
  }
});

// ── PUT /api/offers/:id ──────────────────────────────────────
// Admin mengubah status tawaran: PENDING | ACCEPTED | REJECTED | COMPLETED
router.put('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ error: 'Status tidak valid.' });
    }

    const { data, error } = await supabaseAdmin
      .from('offers')
      .update({ status })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tawaran tidak ditemukan.' });

    const io = req.app.get('io');
    io.to('admin-room').emit('offer:updated', { id: data.id, offer: data });

    res.json({ data });
  } catch (err) {
    console.error('[PUT /api/offers/:id]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

module.exports = router;
