const express = require('express');
const router = express.Router();

const { supabasePublic, supabaseAdmin } = require('../lib/supabase');
const { requireAdminAuth } = require('../lib/authMiddleware');
const {
  isNonEmptyString,
  isValidPositiveNumber,
  sanitizeText,
} = require('../lib/validators');

// ── GET /api/accounts ──────────────────────────────────────
// Query publik: list akun dengan filter, sort, search, pagination
router.get('/', async (req, res) => {
  try {
    const {
      category,
      platform,
      minPrice,
      maxPrice,
      status,
      featured,
      search,
      sort, // newest | price_asc | price_desc | popular
      page = 1,
      limit = 24,
    } = req.query;

    let query = supabasePublic
      .from('accounts')
      .select('*, account_images(id, image_url, is_primary)', { count: 'exact' });

    // Default publik hanya lihat AVAILABLE kecuali diminta status lain secara eksplisit
    if (isNonEmptyString(status)) {
      query = query.eq('status', status.toUpperCase());
    } else {
      query = query.eq('status', 'AVAILABLE');
    }

    if (isNonEmptyString(category)) query = query.eq('category_id', category);
    if (isNonEmptyString(platform)) query = query.ilike('platform', `%${platform}%`);
    if (minPrice !== undefined && isValidPositiveNumber(minPrice)) {
      query = query.gte('price', Number(minPrice));
    }
    if (maxPrice !== undefined && isValidPositiveNumber(maxPrice)) {
      query = query.lte('price', Number(maxPrice));
    }
    if (featured !== undefined) {
      query = query.eq('featured', featured === 'true');
    }
    if (isNonEmptyString(search)) {
      const s = sanitizeText(search, 200);
      query = query.or(
        `name.ilike.%${s}%,platform.ilike.%${s}%,username.ilike.%${s}%,description.ilike.%${s}%`
      );
    }

    switch (sort) {
      case 'price_asc':
        query = query.order('price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false });
        break;
      case 'popular':
        query = query.order('featured', { ascending: false }).order('created_at', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, pagination: { page: pageNum, limit: limitNum, total: count || 0 } });
  } catch (err) {
    console.error('[GET /api/accounts]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dimuat. Silakan coba lagi.' });
  }
});

// ── GET /api/accounts/:id ──────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabasePublic
      .from('accounts')
      .select('*, account_images(id, image_url, is_primary)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

    delete data.password;
    delete data.otp;
    delete data.recovery_code;

    res.json({ data });
  } catch (err) {
    console.error('[GET /api/accounts/:id]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dimuat. Silakan coba lagi.' });
  }
});

// ── POST /api/accounts/:id/check-status ────────────────────
// Dipanggil sebelum membuka WhatsApp "Beli Sekarang" untuk memvalidasi
// status terbaru (menghindari race condition akun sudah SOLD).
router.post('/:id/check-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabasePublic
      .from('accounts')
      .select('id, status, price, name')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

    if (data.status === 'SOLD') {
      return res.status(409).json({
        available: false,
        error: 'Akun Sudah Terjual',
        message: 'Akun ini baru saja terjual. Silakan pilih akun lainnya.',
      });
    }

    res.json({ available: true, data });
  } catch (err) {
    console.error('[POST /api/accounts/:id/check-status]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dimuat. Silakan coba lagi.' });
  }
});

// ── Semua route di bawah ini butuh admin login ─────────────

router.post('/', requireAdminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const {
      name,
      platform,
      category_id,
      username,
      price,
      description,
      details,
      features,
      status,
      featured,
      images,
    } = body;

    if (!isNonEmptyString(name) || !isNonEmptyString(platform)) {
      return res.status(400).json({ error: 'Nama akun dan platform wajib diisi.' });
    }
    if (price !== undefined && !isValidPositiveNumber(price)) {
      return res.status(400).json({ error: 'Harga harus berupa angka positif.' });
    }

    const insertPayload = {
      name: sanitizeText(name, 200),
      platform: sanitizeText(platform, 100),
      category_id: category_id || null,
      username: username ? sanitizeText(username, 200) : null,
      price: price !== undefined ? Number(price) : 0,
      description: sanitizeText(description, 3000),
      details: sanitizeText(details, 3000),
      features: sanitizeText(features, 3000),
      status: status === 'SOLD' ? 'SOLD' : 'AVAILABLE',
      featured: Boolean(featured),
    };

    const { data: account, error: insertErr } = await supabaseAdmin
      .from('accounts')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    if (Array.isArray(images) && images.length > 0) {
      const imageRows = images
        .filter((img) => isNonEmptyString(img.image_url))
        .map((img) => ({
          account_id: account.id,
          image_url: img.image_url,
          is_primary: Boolean(img.is_primary),
        }));
      if (imageRows.length > 0) {
        const { error: imgErr } = await supabaseAdmin.from('account_images').insert(imageRows);
        if (imgErr) console.error('[POST /api/accounts] gagal simpan gambar:', imgErr.message);
      }
    }

    const io = req.app.get('io');
    io.emit('account:created', { id: account.id, account });
    io.to('admin-room').emit('account:created', { id: account.id, account });

    res.status(201).json({ data: account });
  } catch (err) {
    console.error('[POST /api/accounts]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

router.put('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const allowedFields = [
      'name',
      'platform',
      'category_id',
      'username',
      'price',
      'description',
      'details',
      'features',
      'status',
      'featured',
    ];

    const updatePayload = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'price' && !isValidPositiveNumber(body.price)) {
          return res.status(400).json({ error: 'Harga harus berupa angka positif.' });
        }
        if (field === 'status' && !['AVAILABLE', 'SOLD'].includes(body.status)) {
          return res.status(400).json({ error: 'Status tidak valid.' });
        }
        updatePayload[field] =
          typeof body[field] === 'string' ? sanitizeText(body[field], 3000) : body[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'Tidak ada data untuk diperbarui.' });
    }

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .update(updatePayload)
      .eq('id', id)
      .select('*, account_images(id, image_url, is_primary), categories(name)')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

    const io = req.app.get('io');
    io.emit('account:updated', { id: data.id, account: data });
    if (updatePayload.status !== undefined) {
      io.emit('account:statusChanged', { id: data.id, status: data.status, account: data });
    }

    res.json({ data });
  } catch (err) {
    console.error('[PUT /api/accounts/:id]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

router.delete('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('accounts').delete().eq('id', id);
    if (error) throw error;

    const io = req.app.get('io');
    io.emit('account:deleted', { id });

    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/accounts/:id]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dihapus. Silakan coba lagi.' });
  }
});

router.post('/:id/images', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { image_url, is_primary } = req.body || {};

    if (!isNonEmptyString(image_url)) {
      return res.status(400).json({ error: 'URL gambar wajib diisi.' });
    }

    const { data, error } = await supabaseAdmin
      .from('account_images')
      .insert({ account_id: id, image_url, is_primary: Boolean(is_primary) })
      .select('*')
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    io.emit('account:updated', { id, imageAdded: data });

    res.status(201).json({ data });
  } catch (err) {
    console.error('[POST /api/accounts/:id/images]', err.message);
    res.status(500).json({ error: 'Upload Gagal', message: 'Pastikan file sesuai format dan ukuran yang diperbolehkan.' });
  }
});

router.delete('/:id/images/:imageId', requireAdminAuth, async (req, res) => {
  try {
    const { id, imageId } = req.params;
    const { error } = await supabaseAdmin
      .from('account_images')
      .delete()
      .eq('id', imageId)
      .eq('account_id', id);

    if (error) throw error;

    const io = req.app.get('io');
    io.emit('account:updated', { id, imageDeleted: imageId });

    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/accounts/:id/images/:imageId]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dihapus. Silakan coba lagi.' });
  }
});

module.exports = router;
