const express = require('express');
const router = express.Router();

const { supabasePublic, supabaseAdmin } = require('../lib/supabase');
const { requireAdminAuth } = require('../lib/authMiddleware');
const { isNonEmptyString, sanitizeText } = require('../lib/validators');

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ── GET /api/categories ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabasePublic.from('categories').select('*').order('name', { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[GET /api/categories]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dimuat. Silakan coba lagi.' });
  }
});

// ── POST /api/categories ────────────────────────────────────
router.post('/', requireAdminAuth, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!isNonEmptyString(name)) {
      return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
    }

    const cleanName = sanitizeText(name, 100);
    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert({ name: cleanName, slug: slugify(cleanName) })
      .select('*')
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    io.emit('category:created', { id: data.id, category: data });

    res.status(201).json({ data });
  } catch (err) {
    console.error('[POST /api/categories]', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Kategori dengan nama tersebut sudah ada.' });
    }
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

// ── PUT /api/categories/:id ──────────────────────────────────
router.put('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body || {};
    if (!isNonEmptyString(name)) {
      return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
    }

    const cleanName = sanitizeText(name, 100);
    const { data, error } = await supabaseAdmin
      .from('categories')
      .update({ name: cleanName, slug: slugify(cleanName) })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });

    const io = req.app.get('io');
    io.emit('category:updated', { id: data.id, category: data });

    res.json({ data });
  } catch (err) {
    console.error('[PUT /api/categories/:id]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat disimpan. Silakan coba lagi.' });
  }
});

// ── DELETE /api/categories/:id ───────────────────────────────
router.delete('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('categories').delete().eq('id', id);
    if (error) throw error;

    const io = req.app.get('io');
    io.emit('category:deleted', { id });

    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/categories/:id]', err.message);
    res.status(500).json({ error: 'Terjadi Kesalahan', message: 'Data belum dapat dihapus. Silakan coba lagi.' });
  }
});

module.exports = router;
