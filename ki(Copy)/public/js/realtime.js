/* ============================================================
   ARRZ MARKET — realtime.js
   Koneksi Socket.IO publik: dengarkan perubahan status akun
   agar homepage/shop/product ikut update tanpa reload.
   ============================================================ */

(function () {
  if (typeof io === 'undefined') return;

  const socket = io();

  function markCardSold(accountId) {
    document.querySelectorAll(`.account-card[data-account-id="${accountId}"]`).forEach((card) => {
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

  socket.on('account:statusChanged', (payload) => {
    if (!payload || !payload.id) return;
    if (payload.status === 'SOLD') {
      const cardOnPage = document.querySelector(`.account-card[data-account-id="${payload.id}"]`);
      markCardSold(payload.id);
      if (cardOnPage && !(window.ARRZ_PRODUCT_ID && window.ARRZ_PRODUCT_ID === payload.id)) {
        ARRZ.toast('Akun ini baru saja terjual.', 'info');
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
      }
    }
  });

  socket.on('account:deleted', (payload) => {
    if (!payload || !payload.id) return;
    document.querySelectorAll(`.account-card[data-account-id="${payload.id}"]`).forEach((card) => card.remove());
  });
})();
