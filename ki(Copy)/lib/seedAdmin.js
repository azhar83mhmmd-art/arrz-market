// Jalankan sekali: node lib/seedAdmin.js
// Membuat akun admin awal dengan password ter-hash (bcrypt), diambil dari .env
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('./supabase');

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'kenzstr';
  const password = process.env.ADMIN_PASSWORD || 'qwerty';

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('admin_profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (findErr) {
    console.error('Gagal cek admin existing:', findErr.message);
    process.exit(1);
  }

  if (existing) {
    console.log(`Admin dengan username "${username}" sudah ada. Tidak ada perubahan.`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { error: insertErr } = await supabaseAdmin.from('admin_profiles').insert({
    username,
    password_hash: passwordHash,
    full_name: 'Administrator',
  });

  if (insertErr) {
    console.error('Gagal membuat admin awal:', insertErr.message);
    process.exit(1);
  }

  console.log(`Admin awal berhasil dibuat dengan username "${username}".`);
  console.log('Ganti password ini setelah login pertama kali demi keamanan.');
  process.exit(0);
}

seedAdmin();
