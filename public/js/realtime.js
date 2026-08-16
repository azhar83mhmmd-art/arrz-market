/* ============================================================
   ARRZ MARKET — realtime.js
   Koneksi Socket.IO publik: dengarkan perubahan status akun
   agar homepage/shop/product ikut update tanpa reload.
   ============================================================ */

(function () {
  if (typeof io === 'undefined') return;

  const socket = io();

  // Di homepage/shop, kartu akun SOLD tidak boleh nongkrong di grid utama —
  // dipindah (dihapus dari grid AVAILABLE) sementara badge & tombolnya tetap
  // di-nonaktifkan untuk halaman lain (mis. product.html) yang tidak punya grid SOLD.
  function markCardSold(accountId) {
    document.querySelectorAll(`.account-card[data-account-id="${accountId}"]`).forEach((card) => {
      const inMainGrid = card.closest('[data-shop-grid], [data-featured-accounts]');
      if (inMainGrid) {
        card.remove();
        return;
      }
      card.classList.add('is-sold');
      const badge = card.querySelector('[data-card-status-badge], .badge--available');
      if (badge) {
        badge.textContent = 'Sold';
        badge.classList.remove('badge--available');
        badge.classList.add('badge--sold');
      }
      card.querySelectorAll('[data-card-buy], [data-card-offer]').forEach((btn) => {
        btn.disabled = true;
      });
    });
  }

  // Jika halaman shop punya bagian "Akun Terjual", tambahkan akun yang baru
  // saja SOLD ke sana secara realtime (tanpa reload).
  function addToSoldSection(account) {
    const soldGrid = document.querySelector('[data-sold-grid]');
    const soldSection = document.querySelector('[data-sold-section]');
    if (!soldGrid || !account) return;
    if (soldGrid.querySelector(`[data-account-id="${account.id}"]`)) return;
    if (typeof ARRZ === 'undefined' || !ARRZ.renderAccountCard) return;

    soldGrid.insertAdjacentHTML('afterbegin', ARRZ.renderAccountCard(account));
    if (soldSection) soldSection.style.display = '';
    const countBadge = document.querySelector('[data-sold-count]');
    if (countBadge) countBadge.textContent = String((Number(countBadge.textContent) || 0) + 1);
  }

  socket.on('account:statusChanged', (payload) => {
    if (!payload || !payload.id) return;
    if (payload.status === 'SOLD') {
      const cardOnPage = document.querySelector(`.account-card[data-account-id="${payload.id}"]`);
      markCardSold(payload.id);
      addToSoldSection(payload.account);
      if (cardOnPage && !(window.ARRZ_PRODUCT_ID && window.ARRZ_PRODUCT_ID === payload.id)) {
        ARRZ.toast('Sebuah akun baru saja terjual.', 'info');
      }
      if (window.ARRZ_PRODUCT_ID && window.ARRZ_PRODUCT_ID === payload.id) {
        ARRZ.toast('Akun ini baru saja terjual.', 'info');
        const badge = document.querySelector('[data-product-status-badge]');
        if (badge) {
          badge.textContent = 'Sold';
          badge.classList.remove('badge--available');
          badge.classList.add('badge--sold');
        }
        document.querySelectorAll('[data-buy-btn], [data-offer-btn]').forEach((btn) => {
          btn.disabled = true;
        });
        const buyBtn = document.querySelector('[data-buy-btn]');
        if (buyBtn) buyBtn.textContent = 'Sudah Terjual';
      }
    } else if (payload.status === 'AVAILABLE') {
      // Admin membatalkan status SOLD → hapus dari grid "Akun Terjual" jika ada,
      // grid utama akan mengambilnya lagi lewat fetch berikutnya / reload halaman.
      document.querySelectorAll(`[data-sold-grid] .account-card[data-account-id="${payload.id}"]`).forEach((card) => card.remove());
    }
  });

  socket.on('account:deleted', (payload) => {
    if (!payload || !payload.id) return;
    document.querySelectorAll(`.account-card[data-account-id="${payload.id}"]`).forEach((card) => card.remove());
  });
})();
