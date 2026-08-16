const express = require('express');
const router = express.Router();

const { supabasePublic, supabaseAdmin } = require('../lib/supabase');
const { requireAdminAuth } = require('../lib/authMiddleware');
const { sanitizeText } = require('../lib/validators');

// ── GET /api/settings ─────────────────────────────────────────
// Publik: dipakai frontend untuk nama situs, logo, whatsapp admin, dsb.
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabasePublic.from('site_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    res.json({ data: data || {} });
  } catch (err) {
    console.error('[GET /api/settings]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dimuat. Silakan coba lagi.' });
  }
});

// ── PUT /api/settings ─────────────────────────────────────────
// Admin: update pengaturan situs (nama, logo, whatsapp, social media, footer,
// template pesan beli/tawar/jual)
router.put('/', requireAdminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const allowedFields = [
      'site_name',
      'logo_url',
      'admin_whatsapp',
      'admin_email',
      'social_media',
      'footer_text',
      'wa_template_buy',
      'wa_template_offer',
      'wa_template_sell',
    ];

    const updatePayload = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updatePayload[field] =
          typeof body[field] === 'string' ? sanitizeText(body[field], 5000) : body[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'Tidak ada data untuk diperbarui.' });
    }

    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .update(updatePayload)
      .eq('id', 1)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    const io = req.app.get('io');
    io.emit('settings:updated', { settings: data });

    res.json({ data });
  } catch (err) {
    console.error('[PUT /api/settings]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

module.exports = router;
