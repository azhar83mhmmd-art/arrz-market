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
const { fillTemplate, formatRupiah, DEFAULT_TEMPLATE_SELL } = require('../lib/waTemplate');

// ── POST /api/sell-requests ─────────────────────────────────
// Publik mengajukan akun untuk dijual
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const {
      seller_name,
      seller_whatsapp,
      seller_email,
      account_name,
      platform,
      category_id,
      username,
      desired_price,
      description,
      details,
      features,
      additional_info,
      photo_urls,
      confirmed, // checkbox "Saya memastikan informasi yang saya berikan benar."
    } = body;

    if (!isNonEmptyString(seller_name)) {
      return res.status(400).json({ error: 'Nama wajib diisi.' });
    }
    if (!isValidWhatsApp(seller_whatsapp)) {
      return res.status(400).json({ error: 'Nomor WhatsApp wajib diisi dengan format yang benar.' });
    }
    if (!isNonEmptyString(account_name) || !isNonEmptyString(platform)) {
      return res.status(400).json({ error: 'Nama akun dan platform wajib diisi.' });
    }
    if (desired_price !== undefined && desired_price !== null && desired_price !== '' && !isValidPositiveNumber(desired_price)) {
      return res.status(400).json({ error: 'Harga yang diinginkan harus berupa angka positif.' });
    }
    if (!confirmed) {
      return res.status(400).json({ error: 'Kamu harus menyetujui bahwa informasi yang diberikan benar.' });
    }

    const insertPayload = {
      seller_name: sanitizeText(seller_name, 200),
      seller_whatsapp: sanitizeText(seller_whatsapp, 30),
      seller_email: seller_email ? sanitizeText(seller_email, 200) : null,
      account_name: sanitizeText(account_name, 200),
      platform: sanitizeText(platform, 100),
      category_id: category_id || null,
      username: username ? sanitizeText(username, 200) : null,
      desired_price: desired_price ? Number(desired_price) : null,
      description: sanitizeText(description, 3000),
      details: sanitizeText(details, 3000),
      features: sanitizeText(features, 3000),
      additional_info: sanitizeText(additional_info, 3000),
      photo_urls: Array.isArray(photo_urls) ? photo_urls.filter((u) => isNonEmptyString(u)) : [],
      status: 'PENDING',
    };

    const { data: sellRequest, error: insertErr } = await supabaseAdmin
      .from('sell_requests')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    let categoryName = '-';
    if (category_id) {
      const { data: cat } = await supabasePublic.from('categories').select('name').eq('id', category_id).maybeSingle();
      categoryName = cat?.name || '-';
    }

    const { data: settings } = await supabasePublic
      .from('site_settings')
      .select('wa_template_sell, admin_whatsapp')
      .eq('id', 1)
      .maybeSingle();

    const template = settings?.wa_template_sell || DEFAULT_TEMPLATE_SELL;
    const message = fillTemplate(template, {
      NAMA: insertPayload.seller_name,
      WHATSAPP: insertPayload.seller_whatsapp,
      EMAIL: insertPayload.seller_email || '-',
      'NAMA AKUN': insertPayload.account_name,
      PLATFORM: insertPayload.platform,
      KATEGORI: categoryName,
      USERNAME: insertPayload.username || '-',
      HARGA: insertPayload.desired_price ? formatRupiah(insertPayload.desired_price) : '-',
      DESKRIPSI: insertPayload.description || '-',
      DETAIL: insertPayload.details || '-',
    });

    const io = req.app.get('io');
    io.to('admin-room').emit('sellRequest:created', { id: sellRequest.id, sellRequest });

    res.status(201).json({
      data: sellRequest,
      whatsapp: {
        adminNumber: settings?.admin_whatsapp || process.env.ADMIN_WHATSAPP || '',
        message,
      },
    });
  } catch (err) {
    console.error('[POST /api/sell-requests]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

// ── GET /api/sell-requests ──────────────────────────────────
// Khusus admin
router.get('/', requireAdminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    let query = supabaseAdmin
      .from('sell_requests')
      .select('*, categories(name)', { count: 'exact' })
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
    console.error('[GET /api/sell-requests]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dimuat. Silakan coba lagi.' });
  }
});

// ── PUT /api/sell-requests/:id ───────────────────────────────
// Admin ubah status: PENDING | REVIEW | ACCEPTED | REJECTED
router.put('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!['PENDING', 'REVIEW', 'ACCEPTED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Status tidak valid.' });
    }

    const { data, error } = await supabaseAdmin
      .from('sell_requests')
      .update({ status })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });

    const io = req.app.get('io');
    io.to('admin-room').emit('sellRequest:updated', { id: data.id, sellRequest: data });

    res.json({ data });
  } catch (err) {
    console.error('[PUT /api/sell-requests/:id]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

// ── POST /api/sell-requests/:id/convert ─────────────────────
// "TAMBAHKAN KE MARKETPLACE" — hanya boleh untuk pengajuan berstatus ACCEPTED.
// Data otomatis masuk sebagai akun baru di tabel accounts.
router.post('/:id/convert', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { price, featured } = req.body || {};

    const { data: sellRequest, error: fetchErr } = await supabaseAdmin
      .from('sell_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!sellRequest) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    if (sellRequest.status !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Pengajuan harus berstatus ACCEPTED sebelum ditambahkan ke marketplace.' });
    }

    const finalPrice = price !== undefined && isValidPositiveNumber(price) ? Number(price) : sellRequest.desired_price || 0;

    const { data: account, error: insertErr } = await supabaseAdmin
      .from('accounts')
      .insert({
        name: sellRequest.account_name,
        platform: sellRequest.platform,
        category_id: sellRequest.category_id,
        username: sellRequest.username,
        price: finalPrice,
        description: sellRequest.description,
        details: sellRequest.details,
        features: sellRequest.features,
        status: 'AVAILABLE',
        featured: Boolean(featured),
      })
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    if (Array.isArray(sellRequest.photo_urls) && sellRequest.photo_urls.length > 0) {
      const imageRows = sellRequest.photo_urls.map((url, idx) => ({
        account_id: account.id,
        image_url: url,
        is_primary: idx === 0,
      }));
      const { error: imgErr } = await supabaseAdmin.from('account_images').insert(imageRows);
      if (imgErr) console.error('[POST /api/sell-requests/:id/convert] gagal salin gambar:', imgErr.message);
    }

    const io = req.app.get('io');
    io.emit('account:created', { id: account.id, account });
    io.to('admin-room').emit('sellRequest:updated', { id: sellRequest.id, sellRequest, convertedAccountId: account.id });

    res.status(201).json({ data: account });
  } catch (err) {
    console.error('[POST /api/sell-requests/:id/convert]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

module.exports = router;
