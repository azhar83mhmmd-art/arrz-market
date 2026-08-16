/* ============================================================
   ARRZ MARKET — shop.js
   Halaman Beli Akun: filter kategori/harga/status, search, sort,
   pagination, dan render grid akun.
   ============================================================ */

(function () {
  const grid = document.querySelector('[data-shop-grid]');
  if (!grid) return; // bukan halaman shop

  // Daftar platform tetap (banner klik-untuk-filter, mirip Jubel Akun MLBB dsb).
  // Cocok dengan `platform` yang diketik admin di form Tambah Akun (case-insensitive, partial match).
  const PLATFORMS = [
    { key: 'Mobile Legends', label: 'Mobile Legends' },
    { key: 'Free Fire', label: 'Free Fire' },
    { key: 'PUBG', label: 'PUBG Mobile' },
    { key: 'Genshin Impact', label: 'Genshin Impact' },
    { key: 'eFootball', label: 'eFootball' },
    { key: 'Valorant', label: 'Valorant' },
    { key: 'Instagram', label: 'Instagram' },
    { key: 'Netflix', label: 'Netflix' },
  ];

  const countEl = document.querySelector('[data-shop-count]');
  const sortSelect = document.querySelector('[data-sort-select]');
  const searchInput = document.querySelector('[data-shop-search]');
  const categoryList = document.querySelector('[data-category-filter-list]');
  const platformList = document.querySelector('[data-platform-filter-list]');
  const platformBanner = document.querySelector('[data-platform-banner]');
  const minPriceInput = document.querySelector('[data-min-price]');
  const maxPriceInput = document.querySelector('[data-max-price]');
  const applyPriceBtn = document.querySelector('[data-apply-price]');
  const resetBtn = document.querySelector('[data-reset-filters]');
  const loadMoreBtn = document.querySelector('[data-load-more]');
  const filterPanel = document.querySelector('[data-filter-panel]');
  const filterToggle = document.querySelector('[data-filter-toggle]');
  const filterClose = document.querySelector('[data-filter-close]');
  const filterBackdrop = document.querySelector('[data-filter-backdrop]');
  const soldSection = document.querySelector('[data-sold-section]');
  const soldGrid = document.querySelector('[data-sold-grid]');
  const soldToggle = document.querySelector('[data-sold-toggle]');

  const params = new URLSearchParams(window.location.search);
  const state = {
    category: params.get('category') || '',
    platform: params.get('platform') || '',
    search: params.get('search') || '',
    minPrice: '',
    maxPrice: '',
    sort: 'newest',
    page: 1,
    limit: 12,
    accumulated: [],
  };

  if (searchInput && state.search) searchInput.value = state.search;

  function updateUrl() {
    const qp = new URLSearchParams();
    if (state.category) qp.set('category', state.category);
    if (state.platform) qp.set('platform', state.platform);
    if (state.search) qp.set('search', state.search);
    const qs = qp.toString();
    window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
  }

  // ── Banner platform (klik untuk filter, mirip referensi Jubel) ──────
  function renderPlatformBanner() {
    if (!platformBanner) return;
    platformBanner.innerHTML = `
      <button type="button" class="platform-chip ${!state.platform ? 'is-active' : ''}" data-platform-value="">Semua Platform</button>
      ${PLATFORMS.map(
        (p) => `<button type="button" class="platform-chip ${state.platform === p.key ? 'is-active' : ''}" data-platform-value="${ARRZ.escapeAttr(p.key)}">${ARRZ.escapeAttr(p.label)}</button>`
      ).join('')}`;

    platformBanner.querySelectorAll('[data-platform-value]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.platform = btn.dataset.platformValue;
        state.page = 1;
        state.accumulated = [];
        updateUrl();
        renderPlatformBanner();
        syncPlatformFilterList();
        fetchAccounts();
      });
    });
  }

  function syncPlatformFilterList() {
    platformList?.querySelectorAll('input[name="platform"]').forEach((input) => {
      input.checked = input.value === state.platform;
    });
  }

  function renderPlatformFilterList() {
    if (!platformList) return;
    platformList.innerHTML = `
      <label>
        <input type="radio" name="platform" value="" ${!state.platform ? 'checked' : ''} />
        Semua Platform
      </label>
      ${PLATFORMS.map(
        (p) => `
      <label>
        <input type="radio" name="platform" value="${ARRZ.escapeAttr(p.key)}" ${state.platform === p.key ? 'checked' : ''} />
        ${ARRZ.escapeAttr(p.label)}
      </label>`
      ).join('')}`;

    platformList.querySelectorAll('input[name="platform"]').forEach((input) => {
      input.addEventListener('change', () => {
        state.platform = input.value;
        state.page = 1;
        state.accumulated = [];
        updateUrl();
        renderPlatformBanner();
        fetchAccounts();
      });
    });
  }

  async function loadCategories() {
    if (!categoryList) return;
    try {
      const { data } = await ARRZ.apiFetch('/categories');
      categoryList.innerHTML = `
        <label>
          <input type="radio" name="category" value="" ${!state.category ? 'checked' : ''} />
          Semua Kategori
        </label>
        ${(data || [])
          .map(
            (cat) => `
          <label>
            <input type="radio" name="category" value="${cat.id}" ${state.category === cat.id ? 'checked' : ''} />
            ${ARRZ.escapeAttr(cat.name)}
          </label>`
          )
          .join('')}`;

      categoryList.querySelectorAll('input[name="category"]').forEach((input) => {
        input.addEventListener('change', () => {
          state.category = input.value;
          state.page = 1;
          state.accumulated = [];
          updateUrl();
          fetchAccounts();
        });
      });
    } catch (e) {
      categoryList.innerHTML = '';
    }
  }

  function buildQuery(forCount = false) {
    const qp = new URLSearchParams();
    if (state.category) qp.set('category', state.category);
    if (state.platform) qp.set('platform', state.platform);
    if (state.search) qp.set('search', state.search);
    if (state.minPrice) qp.set('minPrice', state.minPrice);
    if (state.maxPrice) qp.set('maxPrice', state.maxPrice);
    // Listing utama HANYA menampilkan akun AVAILABLE — akun SOLD dipindahkan
    // ke bagian "Akun Terjual" terpisah (lihat fetchSoldAccounts), bukan hilang begitu saja.
    qp.set('status', 'AVAILABLE');
    qp.set('sort', state.sort);
    qp.set('page', forCount ? 1 : state.page);
    qp.set('limit', state.limit);
    return qp.toString();
  }

  async function fetchAccounts(append = false) {
    grid.setAttribute('aria-busy', 'true');
    if (!append) {
      grid.innerHTML = ARRZ.skeletonCards(6);
    }
    try {
      const { data, pagination } = await ARRZ.apiFetch(`/accounts?${buildQuery()}`);

      if (append) {
        state.accumulated = state.accumulated.concat(data || []);
      } else {
        state.accumulated = data || [];
      }

      renderGrid(state.accumulated);

      if (countEl) {
        countEl.textContent = `${pagination.total} akun ditemukan`;
      }

      const loaded = state.accumulated.length;
      if (loadMoreBtn) {
        loadMoreBtn.style.display = loaded < pagination.total ? 'inline-flex' : 'none';
      }
    } catch (e) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <h3>Terjadi Kesalahan</h3>
          <p>Data belum dapat dimuat. Silakan coba lagi.</p>
        </div>`;
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    } finally {
      grid.setAttribute('aria-busy', 'false');
    }
  }

  function renderGrid(accounts) {
    if (!accounts || accounts.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <h3>Akun Tidak Ditemukan</h3>
          <p>Coba ubah kata kunci atau filter pencarianmu.</p>
        </div>`;
      return;
    }
    grid.innerHTML = accounts.map(ARRZ.renderAccountCard).join('');
  }

  // ── Bagian "Akun Terjual" (SOLD) — terpisah dari listing utama ──────
  // Ditutup (collapsed) secara default; admin bisa mengubah status kapan
  // saja dan card akan otomatis pindah ke sini secara realtime (lihat realtime.js).
  async function fetchSoldAccounts() {
    if (!soldGrid) return;
    soldGrid.innerHTML = ARRZ.skeletonCards(3);
    try {
      const { data, pagination } = await ARRZ.apiFetch('/accounts?status=SOLD&sort=newest&limit=24');
      if (!data || data.length === 0) {
        soldSection.style.display = 'none';
        return;
      }
      soldSection.style.display = '';
      soldGrid.innerHTML = data.map(ARRZ.renderAccountCard).join('');
      const countBadge = document.querySelector('[data-sold-count]');
      if (countBadge) countBadge.textContent = pagination.total;
    } catch (e) {
      soldSection.style.display = 'none';
    }
  }

  soldToggle?.addEventListener('click', () => {
    soldGrid.classList.toggle('is-collapsed');
    soldToggle.setAttribute('aria-expanded', soldGrid.classList.contains('is-collapsed') ? 'false' : 'true');
    soldToggle.textContent = soldGrid.classList.contains('is-collapsed') ? 'Tampilkan' : 'Sembunyikan';
  });

  // ── Event bindings ──────────────────────────────────────────
  let searchDebounce;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      state.accumulated = [];
      updateUrl();
      fetchAccounts();
    }, 400);
  });

  sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    state.page = 1;
    state.accumulated = [];
    fetchAccounts();
  });

  applyPriceBtn?.addEventListener('click', () => {
    state.minPrice = minPriceInput?.value || '';
    state.maxPrice = maxPriceInput?.value || '';
    state.page = 1;
    state.accumulated = [];
    fetchAccounts();
  });

  resetBtn?.addEventListener('click', () => {
    state.category = '';
    state.platform = '';
    state.search = '';
    state.minPrice = '';
    state.maxPrice = '';
    state.sort = 'newest';
    state.page = 1;
    state.accumulated = [];
    if (searchInput) searchInput.value = '';
    if (minPriceInput) minPriceInput.value = '';
    if (maxPriceInput) maxPriceInput.value = '';
    if (sortSelect) sortSelect.value = 'newest';
    categoryList?.querySelectorAll('input[name="category"]').forEach((i) => (i.checked = i.value === ''));
    syncPlatformFilterList();
    renderPlatformBanner();
    updateUrl();
    fetchAccounts();
  });

  loadMoreBtn?.addEventListener('click', () => {
    state.page += 1;
    fetchAccounts(true);
  });

  filterToggle?.addEventListener('click', () => {
    filterPanel?.classList.add('is-open');
    filterBackdrop?.classList.add('is-open');
  });
  filterClose?.addEventListener('click', closeFilterDrawer);
  filterBackdrop?.addEventListener('click', closeFilterDrawer);
  function closeFilterDrawer() {
    filterPanel?.classList.remove('is-open');
    filterBackdrop?.classList.remove('is-open');
  }

  renderPlatformBanner();
  renderPlatformFilterList();
  loadCategories();
  fetchAccounts();
  fetchSoldAccounts();
})();
