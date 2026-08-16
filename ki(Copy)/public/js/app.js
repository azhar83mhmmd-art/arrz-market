/* ============================================================
   ARRZ MARKET — app.js
   Shared utilities: navbar, toast, WhatsApp helper, settings,
   dan logika khusus homepage (featured accounts, kategori, hero).
   ============================================================ */

const ARRZ = (function () {
  const state = {
    settings: null,
  };

  // ── Fetch helper terpusat ──────────────────────────────────
  async function apiFetch(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options,
    });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }
    if (!res.ok) {
      const err = new Error((body && (body.message || body.error)) || 'Terjadi kesalahan.');
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  // ── Toast ────────────────────────────────────────────────────
  function ensureToastStack() {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, type = 'info', duration = 4200) {
    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.2s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, duration);
  }

  // ── Format harga ────────────────────────────────────────────
  function formatRupiah(value) {
    const n = Number(value) || 0;
    return 'Rp' + n.toLocaleString('id-ID');
  }

  // ── WhatsApp helper terpusat ──────────────────────────────
  // Semua flow (beli/tawar/jual) memanggil openWhatsApp() dengan pesan
  // yang SUDAH dibuat backend (server yang isi template, bukan hardcode
  // di frontend). Fungsi ini hanya bertugas encode & buka WhatsApp.
  function openWhatsApp(adminNumber, message) {
    const number = (adminNumber || '').replace(/\D/g, '');
    if (!number) {
      toast('Nomor WhatsApp admin belum diatur. Hubungi kami lewat kontak lain.', 'error');
      return;
    }
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener');
  }

  // ── Settings (nama situs, whatsapp admin, footer, dst) ─────
  async function loadSettings() {
    if (state.settings) return state.settings;
    try {
      const { data } = await apiFetch('/settings');
      state.settings = data || {};
    } catch (e) {
      state.settings = {};
    }
    applySettingsToDom();
    return state.settings;
  }

  function applySettingsToDom() {
    const s = state.settings || {};
    document.querySelectorAll('[data-site-name]').forEach((el) => {
      el.textContent = s.site_name || 'ARRZ MARKET';
    });
    document.querySelectorAll('[data-footer-text]').forEach((el) => {
      el.textContent = s.footer_text || `© ${new Date().getFullYear()} ARRZ MARKET. Seluruh hak cipta dilindungi.`;
    });
  }

  // ── Navbar mobile drawer ────────────────────────────────────
  function initNavbar() {
    const menuToggle = document.querySelector('[data-menu-toggle]');
    const drawer = document.querySelector('[data-mobile-drawer]');
    const closeBtn = document.querySelector('[data-drawer-close]');
    const backdrop = document.querySelector('[data-drawer-backdrop]');

    function openDrawer() {
      drawer?.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
      drawer?.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    menuToggle?.addEventListener('click', openDrawer);
    closeBtn?.addEventListener('click', closeDrawer);
    backdrop?.addEventListener('click', closeDrawer);

    // Tandai link aktif berdasarkan halaman saat ini
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.navbar__link, .mobile-drawer__link').forEach((link) => {
      const href = link.getAttribute('href');
      if (href === currentPage || (currentPage === '' && href === 'index.html')) {
        link.classList.add('is-active');
      }
    });
  }

  // ── Skeleton generator ──────────────────────────────────────
  function skeletonCards(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="account-card-skeleton">
          <div class="skeleton skeleton-media"></div>
          <div class="skeleton skeleton-line" style="width: 40%"></div>
          <div class="skeleton skeleton-line" style="width: 80%"></div>
          <div class="skeleton skeleton-line" style="width: 55%"></div>
        </div>`;
    }
    return html;
  }

  // ── Render satu account card (dipakai homepage & shop) ──────
  // Card = <div> (bukan <a>) supaya tombol Beli/Tawar bisa berdiri sendiri
  // di dalamnya tanpa nested-anchor. Area foto + info tetap bisa diklik
  // untuk masuk ke halaman detail lewat .account-card__link.
  function renderAccountCard(account) {
    const images = account.account_images || [];
    const primary = images.find((img) => img.is_primary) || images[0];
    const isSold = account.status === 'SOLD';
    const categoryName = account.categories?.name || '';
    const productUrl = `product.html?id=${encodeURIComponent(account.id)}`;

    const mediaHtml = primary
      ? `<img src="${escapeAttr(primary.image_url)}" alt="${escapeAttr(account.name)}" loading="lazy" onerror="this.closest('.account-card__media').innerHTML='<div class=&quot;account-card__media-fallback&quot;>ARRZ MARKET</div>'" />`
      : `<div class="account-card__media-fallback">ARRZ MARKET</div>`;

    return `
      <div class="account-card ${isSold ? 'is-sold' : ''}" data-account-id="${escapeAttr(account.id)}">
        <a class="account-card__link" href="${productUrl}">
          <div class="account-card__media">
            ${mediaHtml}
            <div class="account-card__badges">
              <span class="badge ${isSold ? 'badge--sold' : 'badge--available'}" data-card-status-badge>${isSold ? 'Sold' : 'Available'}</span>
            </div>
            ${account.featured ? '<div class="account-card__stamp">Featured</div>' : ''}
          </div>
          <div class="account-card__perforation"></div>
          <div class="account-card__body">
            <span class="account-card__code">${escapeAttr(account.account_code || '')}</span>
            ${categoryName ? `<span class="account-card__category">${escapeAttr(categoryName)}</span>` : ''}
            <h3 class="account-card__name">${escapeAttr(account.name)}</h3>
            <p class="account-card__platform">${escapeAttr(account.platform)}</p>
            <p class="account-card__desc">${escapeAttr(account.description || '')}</p>
            <div class="account-card__price">${formatRupiah(account.price)}</div>
          </div>
        </a>
        <div class="account-card__actions">
          <button type="button" class="btn btn-sm btn-primary" data-card-buy="${escapeAttr(account.id)}" ${isSold ? 'disabled' : ''}>Beli</button>
          <button type="button" class="btn btn-sm" data-card-offer="${escapeAttr(account.id)}" ${isSold ? 'disabled' : ''}>Tawar</button>
        </div>
      </div>`;
  }

  // ── Delegasi klik Beli/Tawar dari card (homepage & shop) ─────
  // Card hanya menampilkan aksi; validasi status & modal sesungguhnya
  // terjadi di product.html (product.js), jadi di sini cukup arahkan
  // dengan parameter ?action= supaya modal yang tepat langsung terbuka.
  function initCardActions() {
    document.addEventListener('click', (e) => {
      const buyBtn = e.target.closest('[data-card-buy]');
      if (buyBtn) {
        if (buyBtn.disabled) return;
        e.preventDefault();
        window.location.href = `product.html?id=${encodeURIComponent(buyBtn.dataset.cardBuy)}&action=buy`;
        return;
      }
      const offerBtn = e.target.closest('[data-card-offer]');
      if (offerBtn) {
        if (offerBtn.disabled) return;
        e.preventDefault();
        window.location.href = `product.html?id=${encodeURIComponent(offerBtn.dataset.cardOffer)}&action=offer`;
      }
    });
  }

  function escapeAttr(str) {
    if (typeof str !== 'string') return str ?? '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Homepage: featured accounts, kategori, hero search, stat ──
  async function initHomepage() {
    const featuredContainer = document.querySelector('[data-featured-accounts]');
    const categoryContainer = document.querySelector('[data-category-grid]');
    const heroSearchForm = document.querySelector('[data-hero-search]');
    const statTotal = document.querySelector('[data-stat-total]');
    const statCategory = document.querySelector('[data-stat-category]');

    if (!featuredContainer && !categoryContainer) return; // bukan homepage

    if (featuredContainer) {
      featuredContainer.innerHTML = skeletonCards(4);
      try {
        const { data, pagination } = await apiFetch('/accounts?featured=true&limit=8');
        if (!data || data.length === 0) {
          featuredContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
              <h3>Belum Ada Akun</h3>
              <p>Saat ini belum ada akun yang tersedia.</p>
            </div>`;
        } else {
          featuredContainer.innerHTML = data.map(renderAccountCard).join('');
        }
        if (statTotal) {
          const { pagination: allPagination } = await apiFetch('/accounts?limit=1');
          statTotal.textContent = allPagination?.total ?? data.length;
        }
      } catch (e) {
        featuredContainer.innerHTML = `
          <div class="empty-state" style="grid-column: 1/-1;">
            <h3>Terjadi Kesalahan</h3>
            <p>Data belum dapat dimuat. Silakan coba lagi.</p>
          </div>`;
      }
    }

    if (categoryContainer) {
      try {
        const { data } = await apiFetch('/categories');
        if (statCategory) statCategory.textContent = data?.length ?? 0;
        categoryContainer.innerHTML = (data || [])
          .map(
            (cat) => `
            <a class="category-chip" href="shop.html?category=${encodeURIComponent(cat.id)}">
              <span class="category-chip__name">${escapeAttr(cat.name)}</span>
              <span class="category-chip__count">Lihat akun →</span>
            </a>`
          )
          .join('');
      } catch (e) {
        categoryContainer.innerHTML = '';
      }
    }

    heroSearchForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = heroSearchForm.querySelector('input[name="q"]').value.trim();
      window.location.href = `shop.html${q ? `?search=${encodeURIComponent(q)}` : ''}`;
    });
  }

  // ── Init umum di semua halaman ──────────────────────────────
  function init() {
    initNavbar();
    initCardActions();
    loadSettings();
    initHomepage();

    // footer tahun & fallback jika tidak lewat settings
    document.querySelectorAll('[data-current-year]').forEach((el) => {
      el.textContent = new Date().getFullYear();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    apiFetch,
    toast,
    formatRupiah,
    openWhatsApp,
    loadSettings,
    getSettings: () => state.settings,
    renderAccountCard,
    skeletonCards,
    escapeAttr,
  };
})();
