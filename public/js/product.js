/* ============================================================
   ARRZ MARKET — product.js
   Halaman detail akun: galeri foto, modal Beli Sekarang & Tawar
   Harga, generate pesan WhatsApp dari backend, buka WhatsApp.
   ============================================================ */

(function () {
  const root = document.querySelector('[data-product-root]');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const accountId = params.get('id');

  const notFoundEl = document.querySelector('[data-product-not-found]');
  const loadingEl = document.querySelector('[data-product-loading]');

  if (!accountId) {
    root.style.display = 'none';
    loadingEl?.remove();
    if (notFoundEl) notFoundEl.style.display = 'block';
    return;
  }

  let currentAccount = null;

  // Jika datang dari tombol "Beli"/"Tawar" di card (shop/homepage), langsung
  // buka modal yang sesuai begitu data akun selesai dimuat.
  const pendingAction = params.get('action');

  async function loadProduct() {
    try {
      const { data } = await ARRZ.apiFetch(`/accounts/${encodeURIComponent(accountId)}`);
      currentAccount = data;
      window.ARRZ_PRODUCT_ID = data.id;
      renderProduct(data);
      loadingEl?.remove();
      root.style.display = '';

      if (pendingAction === 'buy' || pendingAction === 'offer') {
        // Bersihkan ?action= dari URL agar refresh/back tidak membuka modal berulang
        params.delete('action');
        const qs = params.toString();
        window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);

        if (data.status !== 'SOLD') {
          const targetBtn = document.querySelector(pendingAction === 'buy' ? '[data-buy-btn]' : '[data-offer-btn]');
          targetBtn?.click();
        } else {
          ARRZ.toast('Akun ini baru saja terjual. Silakan pilih akun lainnya.', 'error');
        }
      }
    } catch (e) {
      loadingEl?.remove();
      root.style.display = 'none';
      if (notFoundEl) notFoundEl.style.display = 'block';
    }
  }

  function renderProduct(account) {
    document.title = `${account.name} — ARRZ MARKET`;

    const images = account.account_images || [];
    const sorted = [...images].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
    const mainImg = document.querySelector('[data-gallery-main]');
    const thumbsWrap = document.querySelector('[data-gallery-thumbs]');

    if (sorted.length > 0) {
      mainImg.innerHTML = `<img src="${ARRZ.escapeAttr(sorted[0].image_url)}" alt="${ARRZ.escapeAttr(account.name)}" />`;
      thumbsWrap.innerHTML = sorted
        .map(
          (img, idx) => `
        <div class="product-gallery__thumb ${idx === 0 ? 'is-active' : ''}" data-thumb data-src="${ARRZ.escapeAttr(img.image_url)}">
          <img src="${ARRZ.escapeAttr(img.image_url)}" alt="" />
        </div>`
        )
        .join('');

      thumbsWrap.querySelectorAll('[data-thumb]').forEach((thumb) => {
        thumb.addEventListener('click', () => {
          mainImg.innerHTML = `<img src="${thumb.dataset.src}" alt="${ARRZ.escapeAttr(account.name)}" />`;
          thumbsWrap.querySelectorAll('[data-thumb]').forEach((t) => t.classList.remove('is-active'));
          thumb.classList.add('is-active');
        });
      });
    } else {
      mainImg.innerHTML = `<div class="account-card__media-fallback" style="height:100%;">ARRZ MARKET</div>`;
      thumbsWrap.innerHTML = '';
    }

    const isSold = account.status === 'SOLD';

    document.querySelector('[data-product-code]').textContent = account.account_code || '';
    document.querySelector('[data-product-name]').textContent = account.name;
    document.querySelector('[data-product-platform]').textContent = account.platform;
    document.querySelector('[data-product-price]').textContent = ARRZ.formatRupiah(account.price);
    document.querySelector('[data-product-description]').textContent = account.description || '-';

    const detailsEl = document.querySelector('[data-product-details]');
    const detailsBlock = document.querySelector('[data-product-details-block]');
    if (account.details) {
      detailsEl.textContent = account.details;
    } else {
      detailsBlock?.remove();
    }

    const featuresEl = document.querySelector('[data-product-features]');
    const featuresBlock = document.querySelector('[data-product-features-block]');
    if (account.features) {
      featuresEl.textContent = account.features;
    } else {
      featuresBlock?.remove();
    }

    const statusBadge = document.querySelector('[data-product-status-badge]');
    statusBadge.textContent = isSold ? 'Sold' : 'Available';
    statusBadge.classList.add(isSold ? 'badge--sold' : 'badge--available');

    const categoryBadge = document.querySelector('[data-product-category-badge]');
    if (account.categories?.name) {
      categoryBadge.textContent = account.categories.name;
    } else {
      categoryBadge.remove();
    }

    const buyBtn = document.querySelector('[data-buy-btn]');
    const offerBtn = document.querySelector('[data-offer-btn]');
    if (isSold) {
      buyBtn.disabled = true;
      offerBtn.disabled = true;
      buyBtn.textContent = 'Sudah Terjual';
    }

    document.querySelectorAll('[data-modal-account-name]').forEach((el) => (el.textContent = account.name));
    document.querySelectorAll('[data-modal-account-price]').forEach((el) => (el.textContent = ARRZ.formatRupiah(account.price)));
  }

  const buyModal = document.querySelector('[data-buy-modal]');
  const buyForm = document.querySelector('[data-buy-form]');

  document.querySelector('[data-buy-btn]')?.addEventListener('click', async () => {
    if (!currentAccount) return;
    try {
      const { available } = await ARRZ.apiFetch(`/accounts/${accountId}/check-status`, { method: 'POST' });
      if (!available) {
        ARRZ.toast('Akun ini baru saja terjual. Silakan pilih akun lainnya.', 'error');
        return;
      }
      openModal(buyModal);
    } catch (e) {
      ARRZ.toast(e.message, 'error');
    }
  });

  buyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = buyForm.querySelector('button[type="submit"]');
    const name = buyForm.querySelector('[name="buyer_name"]').value.trim();
    const wa = buyForm.querySelector('[name="buyer_whatsapp"]').value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Memproses...';

    try {
      const { whatsapp } = await ARRZ.apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify({ account_id: accountId, buyer_name: name, buyer_whatsapp: wa }),
      });
      ARRZ.openWhatsApp(whatsapp.adminNumber, whatsapp.message);
      closeModal(buyModal);
      ARRZ.toast('Berhasil! Kamu akan diarahkan ke WhatsApp admin.', 'success');
      buyForm.reset();
    } catch (err) {
      ARRZ.toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Lanjutkan ke WhatsApp';
    }
  });

  const offerModal = document.querySelector('[data-offer-modal]');
  const offerForm = document.querySelector('[data-offer-form]');

  document.querySelector('[data-offer-btn]')?.addEventListener('click', async () => {
    if (!currentAccount) return;
    try {
      const { available } = await ARRZ.apiFetch(`/accounts/${accountId}/check-status`, { method: 'POST' });
      if (!available) {
        ARRZ.toast('Akun ini baru saja terjual. Silakan pilih akun lainnya.', 'error');
        return;
      }
      openModal(offerModal);
    } catch (e) {
      ARRZ.toast(e.message, 'error');
    }
  });

  offerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = offerForm.querySelector('button[type="submit"]');
    const offerPrice = offerForm.querySelector('[name="offer_price"]').value;
    const name = offerForm.querySelector('[name="buyer_name"]').value.trim();
    const wa = offerForm.querySelector('[name="buyer_whatsapp"]').value.trim();
    const note = offerForm.querySelector('[name="note"]').value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Memproses...';

    try {
      const { whatsapp } = await ARRZ.apiFetch('/offers', {
        method: 'POST',
        body: JSON.stringify({
          account_id: accountId,
          offer_price: Number(offerPrice),
          buyer_name: name,
          buyer_whatsapp: wa,
          note,
        }),
      });
      ARRZ.openWhatsApp(whatsapp.adminNumber, whatsapp.message);
      closeModal(offerModal);
      ARRZ.toast('Tawaran terkirim! Kamu akan diarahkan ke WhatsApp admin.', 'success');
      offerForm.reset();
    } catch (err) {
      ARRZ.toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ajukan Tawaran';
    }
  });

  function openModal(modal) {
    modal?.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(modal) {
    modal?.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  document.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay')));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  loadProduct();
})();
