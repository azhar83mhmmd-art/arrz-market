/* ============================================================
   ARRZ MARKET — shop.js
   Halaman Beli Akun: filter kategori/harga/status, search, sort,
   pagination, dan render grid akun.
   ============================================================ */

(function () {
  const grid = document.querySelector('[data-shop-grid]');
  if (!grid) return; // bukan halaman shop

  const countEl = document.querySelector('[data-shop-count]');
  const sortSelect = document.querySelector('[data-sort-select]');
  const searchInput = document.querySelector('[data-shop-search]');
  const categoryList = document.querySelector('[data-category-filter-list]');
  const minPriceInput = document.querySelector('[data-min-price]');
  const maxPriceInput = document.querySelector('[data-max-price]');
  const applyPriceBtn = document.querySelector('[data-apply-price]');
  const resetBtn = document.querySelector('[data-reset-filters]');
  const loadMoreBtn = document.querySelector('[data-load-more]');
  const filterPanel = document.querySelector('[data-filter-panel]');
  const filterToggle = document.querySelector('[data-filter-toggle]');
  const filterClose = document.querySelector('[data-filter-close]');
  const filterBackdrop = document.querySelector('[data-filter-backdrop]');

  const params = new URLSearchParams(window.location.search);
  const state = {
    category: params.get('category') || '',
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
    if (state.search) qp.set('search', state.search);
    const qs = qp.toString();
    window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
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
    if (state.search) qp.set('search', state.search);
    if (state.minPrice) qp.set('minPrice', state.minPrice);
    if (state.maxPrice) qp.set('maxPrice', state.maxPrice);
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

  loadCategories();
  fetchAccounts();
})();
