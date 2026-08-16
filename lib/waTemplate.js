// Mengganti placeholder [NAMA AKUN], [HARGA], dst pada template pesan
// WhatsApp dengan data sesungguhnya. Dipakai oleh offers.js, sellers.js,
// dan endpoint terkait transaksi beli di accounts.js/transactions.js.

function formatRupiah(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('id-ID');
}

function fillTemplate(template, data) {
  if (typeof template !== 'string' || !template) return '';
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `[${key}]`;
    result = result.split(placeholder).join(value !== undefined && value !== null ? String(value) : '');
  }
  return result;
}

const DEFAULT_TEMPLATE_BUY = `Halo Admin ARRZ MARKET.

Saya ingin membeli akun berikut:

DETAIL AKUN
━━━━━━━━━━━━━━━━
Nama: [NAMA AKUN]
ID: [ID AKUN]
Platform: [PLATFORM]
Kategori: [KATEGORI]
Harga: Rp[HARGA]
━━━━━━━━━━━━━━━━

DATA PEMBELI
Nama: [NAMA PEMBELI]
WhatsApp: [NOMOR PEMBELI]

Saya tertarik untuk membeli akun tersebut.

Mohon informasi mengenai proses pembayaran dan penyerahan akun.

Terima kasih.`;

const DEFAULT_TEMPLATE_OFFER = `Halo Admin ARRZ MARKET.

Saya ingin mengajukan tawaran untuk akun berikut:

DETAIL AKUN
━━━━━━━━━━━━━━━━
Nama: [NAMA AKUN]
ID: [ID AKUN]
Platform: [PLATFORM]
Kategori: [KATEGORI]
Harga asli: Rp[HARGA ASLI]
━━━━━━━━━━━━━━━━

PENAWARAN
Harga tawaran:
Rp[HARGA TAWARAN]

DATA PEMBELI
Nama: [NAMA]
WhatsApp: [NOMOR]

Catatan:
[CATATAN]

Saya ingin melakukan negosiasi untuk akun tersebut.

Terima kasih.`;

const DEFAULT_TEMPLATE_SELL = `Halo Admin ARRZ MARKET.

Saya ingin mengajukan akun untuk dijual.

DATA PENJUAL
━━━━━━━━━━━━━━━━
Nama: [NAMA]
WhatsApp: [WHATSAPP]
Email: [EMAIL]
━━━━━━━━━━━━━━━━

DATA AKUN
Nama: [NAMA AKUN]
Platform: [PLATFORM]
Kategori: [KATEGORI]
Username: [USERNAME]
Harga yang diinginkan: Rp[HARGA]

Deskripsi:
[DESKRIPSI]

Detail:
[DETAIL]

Saya ingin menjual akun tersebut melalui ARRZ MARKET.

Mohon dilakukan pengecekan.

Terima kasih.`;

module.exports = {
  formatRupiah,
  fillTemplate,
  DEFAULT_TEMPLATE_BUY,
  DEFAULT_TEMPLATE_OFFER,
  DEFAULT_TEMPLATE_SELL,
};
