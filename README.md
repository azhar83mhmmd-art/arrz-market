# ARRZ MARKET — Setup Awal

Marketplace jual beli akun digital. Node.js + Express + Socket.IO + Supabase.

## 1. Install dependencies

```bash
npm install
```

## 2. Konfigurasi environment

Salin `.env.example` menjadi `.env`, lalu isi kredensial Supabase kamu:

```bash
cp .env.example .env
```

Isi `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` dari
Project Settings → API di dashboard Supabase kamu. Isi juga `ADMIN_WHATSAPP`,
`SESSION_SECRET` (string acak panjang), dan `ADMIN_USERNAME`/`ADMIN_PASSWORD`
untuk seed admin awal.

## 3. Buat skema database

Buka Supabase → SQL Editor → jalankan isi file `supabase/schema.sql`.
Ini akan membuat semua tabel (`accounts`, `categories`, `offers`,
`sell_requests`, `transactions`, `site_settings`, `admin_profiles`, dll),
trigger `updated_at`, dan RLS policy dasar (publik hanya bisa **membaca**
data marketplace; semua tulis lewat backend pakai service role key).

## 4. Buat bucket Storage

Di Supabase → Storage, buat bucket bernama `account-images` (public read).

## 5. Seed admin awal

```bash
node lib/seedAdmin.js
```

Ini membuat akun admin dengan username/password dari `.env`, password
disimpan sebagai **bcrypt hash** — tidak pernah plaintext di database.

## 6. Jalankan server

```bash
npm run dev   # dengan nodemon, auto-restart
# atau
npm start
```

Buka `http://localhost:3000` — dan cek `http://localhost:3000/api/health`
untuk memastikan server hidup.

## Struktur proyek saat ini

```
arrz-market/
├── server.js              # Express + Socket.IO + middleware keamanan
├── lib/
│   ├── supabase.js         # koneksi Supabase (client publik + admin)
│   ├── socket.js            # instance Socket.IO terpusat
│   └── seedAdmin.js         # script seed admin awal (bcrypt)
├── routes/                  # placeholder — diisi di tahap berikutnya
│   ├── accounts.js
│   ├── offers.js
│   ├── sellers.js
│   ├── transactions.js
│   ├── categories.js
│   ├── settings.js
│   └── admin.js
├── supabase/
│   └── schema.sql           # skema lengkap database + RLS
└── public/
    └── index.html            # placeholder homepage
```

## Yang sudah jalan di tahap ini

- Express server dengan Helmet, CORS, rate limiting, session admin
- Socket.IO siap pakai (room `admin-room` untuk notifikasi khusus admin)
- Koneksi Supabase (client publik & admin/service-role terpisah)
- Skema database lengkap sesuai PRD, dengan RLS
- Seed admin dengan password ter-hash

## Belum dibangun (tahap berikutnya)

- Isi endpoint di setiap file routes/ (masih placeholder)
- Halaman publik (homepage, shop, product, sell, admin)
- Fungsi WhatsApp generator (`generateWhatsAppMessage`, `openWhatsApp`)
- Upload gambar ke Supabase Storage
- Admin authentication middleware & dashboard
