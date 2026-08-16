/* ============================================================
   ARRZ MARKET — admin.js
   Dashboard admin: auth guard, tab switching, CRUD akun/tawaran/
   pengajuan/transaksi/kategori, pengaturan situs, realtime notif.
   ============================================================ */

(function () {
  const shell = document.querySelector('[data-admin-shell]');
  if (!shell) return; // bukan halaman admin.html

  let categoriesCache = [];

  // ── Auth guard ───────────────────────────────────────────────
  async function checkAuth() {
    try {
      const res = await fetch('/api/admin/session', { credentials: 'same-origin' });
      const body = await res.json();
      if (!body.authenticated) {
        window.location.href = 'login.html';
        return false;
      }
      shell.style.display = '';
      return true;
    } catch (e) {
      window.location.href = 'login.html';
      return false;
    }
  }

  async function adminFetch(path, options = {}) {
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
    if (res.status === 401) {
      window.location.href = 'login.html';
      throw new Error('Sesi berakhir.');
    }
    if (!res.ok) {
      throw new Error((body && (body.message || body.error)) || 'Terjadi kesalahan.');
    }
    return body;
  }

  // ── Logout ───────────────────────────────────────────────────
  document.querySelector('[data-logout-btn]')?.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.href = 'login.html';
    }
  });

  // ── Tab switching ────────────────────────────────────────────
  const tabButtons = document.querySelectorAll('[data-tab-btn]');
  const tabPanels = document.querySelectorAll('[data-tab-panel]');
  const loadedTabs = new Set();

  function switchTab(tabName) {
    tabButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tabBtn === tabName));
    tabPanels.forEach((panel) => {
      panel.style.display = panel.dataset.tabPanel === tabName ? '' : 'none';
    });
    loadTabData(tabName);
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tabBtn));
  });

  function loadTabData(tabName) {
    switch (tabName) {
      case 'dashboard':
        loadDashboard();
        break;
      case 'accounts':
        loadAccountsTable();
        if (!loadedTabs.has('categories-cache')) loadCategoriesCache();
        break;
      case 'offers':
        loadOffersTable();
        break;
      case 'sell-requests':
        loadSellRequestsTable();
        break;
      case 'transactions':
        loadTransactionsTable();
        break;
      case 'categories':
        loadCategoriesTable();
        break;
      case 'settings':
        loadSettingsForm();
        break;
    }
  }

  // ── Dashboard stats ──────────────────────────────────────────
  async function loadDashboard() {
    const grid = document.querySelector('[data-dashboard-stats]');
    try {
      const { data } = await adminFetch('/admin/dashboard');
      const cards = grid.querySelectorAll('.stat-card__value');
      const values = [
        data.totalAccounts,
        data.availableAccounts,
        data.soldAccounts,
        data.pendingSellRequests,
        data.pendingOffers,
        data.totalTransactions,
      ];
      cards.forEach((el, idx) => (el.textContent = values[idx] ?? '—'));
    } catch (e) {
      ARRZ.toast(e.message, 'error');
    }
  }

  // ── Kategori cache (dipakai dropdown akun) ──────────────────
  async function loadCategoriesCache() {
    try {
      const { data } = await adminFetch('/categories');
      categoriesCache = data || [];
      loadedTabs.add('categories-cache');
      const select = document.getElementById('acc-category');
      if (select) {
        select.innerHTML =
          '<option value="">Pilih kategori</option>' +
          categoriesCache.map((c) => `<option value="${c.id}">${ARRZ.escapeAttr(c.name)}</option>`).join('');
      }
    } catch (e) {
      // diamkan, dropdown tetap kosong
    }
  }

  // ══════════════════════════════════════════════════════════
  // AKUN
  // ══════════════════════════════════════════════════════════

  async function loadAccountsTable() {
    const tbody = document.querySelector('[data-accounts-table]');
    tbody.innerHTML = `<tr><td colspan="8" class="admin-empty">Memuat...</td></tr>`;
    try {
      const { data } = await adminFetch('/accounts?status=AVAILABLE&limit=100');
      const { data: soldData } = await adminFetch('/accounts?status=SOLD&limit=100');
      const all = [...data, ...soldData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (all.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="admin-empty">Belum ada akun. Klik "+ Tambah Akun" untuk memulai.</td></tr>`;
        return;
      }

      tbody.innerHTML = all
        .map((acc) => {
          const primary = (acc.account_images || []).find((i) => i.is_primary) || acc.account_images?.[0];
          return `
          <tr data-account-row="${acc.id}">
            <td>${primary ? `<img class="table-thumb" src="${ARRZ.escapeAttr(primary.image_url)}" alt="" />` : `<div class="table-thumb"></div>`}</td>
            <td class="mono">${ARRZ.escapeAttr(acc.account_code || '')}</td>
            <td>${ARRZ.escapeAttr(acc.name)}</td>
            <td>${ARRZ.escapeAttr(acc.platform)}</td>
            <td class="mono">${ARRZ.formatRupiah(acc.price)}</td>
            <td><span class="badge ${acc.status === 'SOLD' ? 'badge--sold' : 'badge--available'}">${acc.status}</span></td>
            <td>${acc.featured ? '<span class="badge badge--featured">Featured</span>' : '-'}</td>
            <td class="admin-table__actions">
              <button class="btn btn-sm" data-edit-account="${acc.id}">Edit</button>
              <button class="btn btn-sm" data-toggle-status="${acc.id}" data-current-status="${acc.status}">${acc.status === 'SOLD' ? 'Tandai Available' : 'Tandai Sold'}</button>
              <button class="btn btn-sm" style="background:var(--danger-soft); color:var(--danger);" data-delete-account="${acc.id}">Hapus</button>
            </td>
          </tr>`;
        })
        .join('');

      tbody.querySelectorAll('[data-edit-account]').forEach((btn) => {
        btn.addEventListener('click', () => openAccountDrawer(btn.dataset.editAccount));
      });
      tbody.querySelectorAll('[data-toggle-status]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const newStatus = btn.dataset.currentStatus === 'SOLD' ? 'AVAILABLE' : 'SOLD';
          try {
            await adminFetch(`/accounts/${btn.dataset.toggleStatus}`, {
              method: 'PUT',
              body: JSON.stringify({ status: newStatus }),
            });
            ARRZ.toast('Status akun diperbarui.', 'success');
            loadAccountsTable();
            loadDashboard();
          } catch (e) {
            ARRZ.toast(e.message, 'error');
          }
        });
      });
      tbody.querySelectorAll('[data-delete-account]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hapus akun ini secara permanen?')) return;
          try {
            await adminFetch(`/accounts/${btn.dataset.deleteAccount}`, { method: 'DELETE' });
            ARRZ.toast('Akun dihapus.', 'success');
            loadAccountsTable();
            loadDashboard();
          } catch (e) {
            ARRZ.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  // ── Drawer tambah/edit akun ─────────────────────────────────
  const drawer = document.querySelector('[data-account-drawer]');
  const accountForm = document.querySelector('[data-account-form]');
  const drawerTitle = document.querySelector('[data-drawer-title]');
  const imagesGrid = document.querySelector('[data-account-images]');
  let pendingNewImages = []; // { file, previewUrl } untuk akun baru (belum ada id)
  let editingAccountId = null;

  function openAccountDrawer(accountId = null) {
    editingAccountId = accountId;
    pendingNewImages = [];
    accountForm.reset();
    imagesGrid.innerHTML = '';
    drawerTitle.textContent = accountId ? 'Edit Akun' : 'Tambah Akun';

    if (categoriesCache.length === 0) loadCategoriesCache();

    if (accountId) {
      adminFetch(`/accounts/${accountId}`)
        .then(({ data }) => {
          accountForm.id.value = data.id;
          accountForm.name.value = data.name;
          accountForm.platform.value = data.platform;
          accountForm.category_id.value = data.category_id || '';
          accountForm.price.value = data.price;
          accountForm.username.value = data.username || '';
          accountForm.description.value = data.description || '';
          accountForm.details.value = data.details || '';
          accountForm.features.value = data.features || '';
          accountForm.status.value = data.status;
          accountForm.featured.checked = Boolean(data.featured);
          renderExistingImages(data.account_images || [], data.id);
        })
        .catch((e) => ARRZ.toast(e.message, 'error'));
    }

    drawer.classList.add('is-open');
  }

  function closeAccountDrawer() {
    drawer.classList.remove('is-open');
  }

  document.querySelector('[data-open-account-drawer]')?.addEventListener('click', () => openAccountDrawer());
  document.querySelector('[data-close-drawer]')?.addEventListener('click', closeAccountDrawer);
  drawer?.addEventListener('click', (e) => {
    if (e.target === drawer) closeAccountDrawer();
  });

  function renderExistingImages(images, accountId) {
    imagesGrid.innerHTML = images
      .map(
        (img) => `
      <div class="image-manage-item ${img.is_primary ? 'is-primary' : ''}" data-existing-image="${img.id}">
        <img src="${ARRZ.escapeAttr(img.image_url)}" alt="" />
        <button type="button" class="image-manage-item__remove" data-remove-existing-image="${img.id}">×</button>
      </div>`
      )
      .join('');

    imagesGrid.querySelectorAll('[data-remove-existing-image]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await adminFetch(`/accounts/${accountId}/images/${btn.dataset.removeExistingImage}`, { method: 'DELETE' });
          btn.closest('.image-manage-item').remove();
          ARRZ.toast('Foto dihapus.', 'success');
        } catch (e) {
          ARRZ.toast(e.message, 'error');
        }
      });
    });
  }

  function renderPendingImages() {
    // Render foto baru yang menunggu diupload (dipakai saat tambah akun baru)
    const pendingHtml = pendingNewImages
      .map(
        (item, idx) => `
      <div class="image-manage-item" data-pending-image="${idx}">
        <img src="${item.previewUrl}" alt="" />
        <button type="button" class="image-manage-item__remove" data-remove-pending-image="${idx}">×</button>
      </div>`
      )
      .join('');
    // Gabungkan dengan foto existing yang sudah ada di grid (untuk mode edit)
    const existingHtml = Array.from(imagesGrid.querySelectorAll('[data-existing-image]'))
      .map((el) => el.outerHTML)
      .join('');
    imagesGrid.innerHTML = existingHtml + pendingHtml;

    imagesGrid.querySelectorAll('[data-remove-pending-image]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingNewImages.splice(Number(btn.dataset.removePendingImage), 1);
        renderPendingImages();
      });
    });
    imagesGrid.querySelectorAll('[data-remove-existing-image]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await adminFetch(`/accounts/${editingAccountId}/images/${btn.dataset.removeExistingImage}`, { method: 'DELETE' });
          btn.closest('.image-manage-item').remove();
          ARRZ.toast('Foto dihapus.', 'success');
        } catch (e) {
          ARRZ.toast(e.message, 'error');
        }
      });
    });
  }

  const accountDropzone = document.querySelector('[data-account-dropzone]');
  const accountPhotoInput = document.querySelector('[data-account-photo-input]');

  accountDropzone?.addEventListener('click', () => accountPhotoInput.click());
  accountDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    accountDropzone.classList.add('is-dragover');
  });
  accountDropzone?.addEventListener('dragleave', () => accountDropzone.classList.remove('is-dragover'));
  accountDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    accountDropzone.classList.remove('is-dragover');
    handleAccountPhotos(e.dataTransfer.files);
  });
  accountPhotoInput?.addEventListener('change', () => {
    handleAccountPhotos(accountPhotoInput.files);
    accountPhotoInput.value = '';
  });

  function handleAccountPhotos(fileList) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    for (const file of Array.from(fileList)) {
      if (!validTypes.includes(file.type)) {
        ARRZ.toast(`${file.name}: format tidak didukung.`, 'error');
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        ARRZ.toast(`${file.name}: ukuran melebihi 5MB.`, 'error');
        continue;
      }
      pendingNewImages.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    renderPendingImages();
  }

  async function uploadPendingImages(accountId) {
    if (pendingNewImages.length === 0) return;
    const formData = new FormData();
    pendingNewImages.forEach((item) => formData.append('photos', item.file));

    const res = await fetch('/api/uploads?context=accounts', { method: 'POST', body: formData, credentials: 'same-origin' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || body.error || 'Upload foto gagal.');

    if (body.warning) {
      ARRZ.toast(body.warning, 'error', 6000);
    }

    const urls = body.urls || [];
    const hasExistingImages = imagesGrid.querySelectorAll('[data-existing-image]').length > 0;
    for (let i = 0; i < urls.length; i++) {
      await adminFetch(`/accounts/${accountId}/images`, {
        method: 'POST',
        body: JSON.stringify({ image_url: urls[i], is_primary: !hasExistingImages && i === 0 }),
      });
    }
    pendingNewImages = [];
  }

  accountForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = accountForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    try {
      const payload = {
        name: accountForm.name.value.trim(),
        platform: accountForm.platform.value.trim(),
        category_id: accountForm.category_id.value || null,
        price: Number(accountForm.price.value),
        username: accountForm.username.value.trim(),
        description: accountForm.description.value.trim(),
        details: accountForm.details.value.trim(),
        features: accountForm.features.value.trim(),
        status: accountForm.status.value,
        featured: accountForm.featured.checked,
      };

      let accountId = editingAccountId;

      if (accountId) {
        await adminFetch(`/accounts/${accountId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        const { data } = await adminFetch('/accounts', { method: 'POST', body: JSON.stringify(payload) });
        accountId = data.id;
      }

      await uploadPendingImages(accountId);

      ARRZ.toast('Akun berhasil disimpan.', 'success');
      closeAccountDrawer();
      loadAccountsTable();
      loadDashboard();
    } catch (err) {
      ARRZ.toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Simpan Akun';
    }
  });

  // ══════════════════════════════════════════════════════════
  // TAWARAN
  // ══════════════════════════════════════════════════════════

  let currentOffersFilter = '';

  async function loadOffersTable() {
    const tbody = document.querySelector('[data-offers-table]');
    tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Memuat...</td></tr>`;
    try {
      const qs = currentOffersFilter ? `?status=${currentOffersFilter}` : '';
      const { data } = await adminFetch(`/offers${qs}`);

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Tidak ada tawaran.</td></tr>`;
        return;
      }

      tbody.innerHTML = data
        .map(
          (offer) => `
        <tr>
          <td>${ARRZ.escapeAttr(offer.accounts?.name || '-')}</td>
          <td class="mono">${ARRZ.formatRupiah(offer.original_price)}</td>
          <td class="mono">${ARRZ.formatRupiah(offer.offer_price)}</td>
          <td>${ARRZ.escapeAttr(offer.buyer_name)}</td>
          <td class="mono">${ARRZ.escapeAttr(offer.buyer_whatsapp)}</td>
          <td><span class="badge badge--neutral">${offer.status}</span></td>
          <td class="admin-table__actions">
            ${offer.status === 'PENDING' ? `
              <button class="btn btn-sm" data-offer-action="${offer.id}" data-offer-status="ACCEPTED">Terima</button>
              <button class="btn btn-sm" data-offer-action="${offer.id}" data-offer-status="REJECTED">Tolak</button>
            ` : ''}
            ${offer.status === 'ACCEPTED' ? `<button class="btn btn-sm" data-offer-action="${offer.id}" data-offer-status="COMPLETED">Selesai</button>` : ''}
          </td>
        </tr>`
        )
        .join('');

      tbody.querySelectorAll('[data-offer-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await adminFetch(`/offers/${btn.dataset.offerAction}`, {
              method: 'PUT',
              body: JSON.stringify({ status: btn.dataset.offerStatus }),
            });
            ARRZ.toast('Status tawaran diperbarui.', 'success');
            loadOffersTable();
            loadDashboard();
          } catch (e) {
            ARRZ.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  document.querySelectorAll('[data-offers-filter] .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-offers-filter] .tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentOffersFilter = btn.dataset.status;
      loadOffersTable();
    });
  });

  // ══════════════════════════════════════════════════════════
  // PENGAJUAN JUAL
  // ══════════════════════════════════════════════════════════

  let currentSellRequestsFilter = '';

  async function loadSellRequestsTable() {
    const tbody = document.querySelector('[data-sell-requests-table]');
    tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Memuat...</td></tr>`;
    try {
      const qs = currentSellRequestsFilter ? `?status=${currentSellRequestsFilter}` : '';
      const { data } = await adminFetch(`/sell-requests${qs}`);

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Tidak ada pengajuan.</td></tr>`;
        return;
      }

      tbody.innerHTML = data
        .map(
          (req) => `
        <tr>
          <td>${ARRZ.escapeAttr(req.account_name)}<br/><span style="font-size:0.78rem; color:var(--ink-soft);">${ARRZ.escapeAttr(req.platform)}</span></td>
          <td>${ARRZ.escapeAttr(req.seller_name)}</td>
          <td class="mono">${ARRZ.escapeAttr(req.seller_whatsapp)}</td>
          <td class="mono">${req.desired_price ? ARRZ.formatRupiah(req.desired_price) : '-'}</td>
          <td><span class="badge badge--neutral">${req.status}</span></td>
          <td class="admin-table__actions">
            ${req.status === 'PENDING' ? `<button class="btn btn-sm" data-sr-action="${req.id}" data-sr-status="REVIEW">Review</button>` : ''}
            ${req.status !== 'ACCEPTED' && req.status !== 'REJECTED' ? `
              <button class="btn btn-sm" data-sr-action="${req.id}" data-sr-status="ACCEPTED">Terima</button>
              <button class="btn btn-sm" data-sr-action="${req.id}" data-sr-status="REJECTED">Tolak</button>
            ` : ''}
            ${req.status === 'ACCEPTED' ? `<button class="btn btn-sm btn-primary" data-sr-convert="${req.id}">+ Marketplace</button>` : ''}
          </td>
        </tr>`
        )
        .join('');

      tbody.querySelectorAll('[data-sr-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await adminFetch(`/sell-requests/${btn.dataset.srAction}`, {
              method: 'PUT',
              body: JSON.stringify({ status: btn.dataset.srStatus }),
            });
            ARRZ.toast('Status pengajuan diperbarui.', 'success');
            loadSellRequestsTable();
            loadDashboard();
          } catch (e) {
            ARRZ.toast(e.message, 'error');
          }
        });
      });

      tbody.querySelectorAll('[data-sr-convert]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Tambahkan pengajuan ini sebagai akun baru di marketplace?')) return;
          try {
            await adminFetch(`/sell-requests/${btn.dataset.srConvert}/convert`, { method: 'POST', body: JSON.stringify({}) });
            ARRZ.toast('Akun berhasil ditambahkan ke marketplace.', 'success');
            loadSellRequestsTable();
            loadDashboard();
          } catch (e) {
            ARRZ.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  document.querySelectorAll('[data-sell-requests-filter] .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sell-requests-filter] .tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentSellRequestsFilter = btn.dataset.status;
      loadSellRequestsTable();
    });
  });

  // ══════════════════════════════════════════════════════════
  // TRANSAKSI
  // ══════════════════════════════════════════════════════════

  let currentTransactionsFilter = '';

  async function loadTransactionsTable() {
    const tbody = document.querySelector('[data-transactions-table]');
    tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Memuat...</td></tr>`;
    try {
      const qs = currentTransactionsFilter ? `?status=${currentTransactionsFilter}` : '';
      const { data } = await adminFetch(`/transactions${qs}`);

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Tidak ada transaksi.</td></tr>`;
        return;
      }

      tbody.innerHTML = data
        .map(
          (tx) => `
        <tr>
          <td>${ARRZ.escapeAttr(tx.accounts?.name || '-')}</td>
          <td>${ARRZ.escapeAttr(tx.buyer_name)}</td>
          <td class="mono">${ARRZ.escapeAttr(tx.buyer_whatsapp)}</td>
          <td class="mono">${ARRZ.formatRupiah(tx.price)}</td>
          <td>
            <select data-tx-status-select="${tx.id}" style="padding:6px 8px; font-size:0.82rem;">
              <option value="PENDING" ${tx.status === 'PENDING' ? 'selected' : ''}>Pending</option>
              <option value="PROCESSING" ${tx.status === 'PROCESSING' ? 'selected' : ''}>Diproses</option>
              <option value="COMPLETED" ${tx.status === 'COMPLETED' ? 'selected' : ''}>Selesai</option>
              <option value="CANCELLED" ${tx.status === 'CANCELLED' ? 'selected' : ''}>Dibatalkan</option>
            </select>
          </td>
          <td></td>
        </tr>`
        )
        .join('');

      tbody.querySelectorAll('[data-tx-status-select]').forEach((select) => {
        select.addEventListener('change', async () => {
          try {
            await adminFetch(`/transactions/${select.dataset.txStatusSelect}`, {
              method: 'PUT',
              body: JSON.stringify({ status: select.value }),
            });
            ARRZ.toast('Status transaksi diperbarui.', 'success');
            if (select.value === 'COMPLETED') loadAccountsTable();
            loadDashboard();
          } catch (e) {
            ARRZ.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  document.querySelectorAll('[data-transactions-filter] .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-transactions-filter] .tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentTransactionsFilter = btn.dataset.status;
      loadTransactionsTable();
    });
  });

  // ══════════════════════════════════════════════════════════
  // KATEGORI
  // ══════════════════════════════════════════════════════════

  async function loadCategoriesTable() {
    const tbody = document.querySelector('[data-categories-table]');
    tbody.innerHTML = `<tr><td colspan="3" class="admin-empty">Memuat...</td></tr>`;
    try {
      const { data } = await adminFetch('/categories');
      categoriesCache = data || [];

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="admin-empty">Belum ada kategori.</td></tr>`;
        return;
      }

      tbody.innerHTML = data
        .map(
          (cat) => `
        <tr>
          <td>${ARRZ.escapeAttr(cat.name)}</td>
          <td class="mono">${ARRZ.escapeAttr(cat.slug)}</td>
          <td class="admin-table__actions">
            <button class="btn btn-sm" style="background:var(--danger-soft); color:var(--danger);" data-delete-category="${cat.id}">Hapus</button>
          </td>
        </tr>`
        )
        .join('');

      tbody.querySelectorAll('[data-delete-category]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hapus kategori ini?')) return;
          try {
            await adminFetch(`/categories/${btn.dataset.deleteCategory}`, { method: 'DELETE' });
            ARRZ.toast('Kategori dihapus.', 'success');
            loadCategoriesTable();
          } catch (e) {
            ARRZ.toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="admin-empty">Data belum dapat dimuat. Silakan coba lagi.</td></tr>`;
    }
  }

  document.querySelector('[data-add-category-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await adminFetch('/categories', { method: 'POST', body: JSON.stringify({ name: form.name.value.trim() }) });
      ARRZ.toast('Kategori ditambahkan.', 'success');
      form.reset();
      loadCategoriesTable();
    } catch (e) {
      ARRZ.toast(e.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ══════════════════════════════════════════════════════════
  // PENGATURAN
  // ══════════════════════════════════════════════════════════

  async function loadSettingsForm() {
    const form = document.querySelector('[data-settings-form]');
    try {
      const { data } = await adminFetch('/settings');
      form.site_name.value = data.site_name || '';
      form.admin_whatsapp.value = data.admin_whatsapp || '';
      form.footer_text.value = data.footer_text || '';
      form.wa_template_buy.value = data.wa_template_buy || '';
      form.wa_template_offer.value = data.wa_template_offer || '';
      form.wa_template_sell.value = data.wa_template_sell || '';
    } catch (e) {
      ARRZ.toast(e.message, 'error');
    }
  }

  document.querySelector('[data-settings-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';
    try {
      await adminFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          site_name: form.site_name.value.trim(),
          admin_whatsapp: form.admin_whatsapp.value.trim(),
          footer_text: form.footer_text.value.trim(),
          wa_template_buy: form.wa_template_buy.value,
          wa_template_offer: form.wa_template_offer.value,
          wa_template_sell: form.wa_template_sell.value,
        }),
      });
      ARRZ.toast('Pengaturan disimpan.', 'success');
    } catch (e) {
      ARRZ.toast(e.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Simpan Pengaturan';
    }
  });

  // ══════════════════════════════════════════════════════════
  // Realtime notifikasi (admin room)
  // ══════════════════════════════════════════════════════════

  function initRealtime() {
    if (typeof io === 'undefined') return;
    const socket = io();
    socket.emit('admin:join');

    socket.on('offer:created', () => {
      ARRZ.toast('Tawaran baru masuk!', 'info');
      loadDashboard();
    });
    socket.on('sellRequest:created', () => {
      ARRZ.toast('Pengajuan jual akun baru masuk!', 'info');
      loadDashboard();
    });
    socket.on('transaction:created', () => {
      ARRZ.toast('Ada permintaan pembelian baru!', 'info');
      loadDashboard();
    });
  }

  // ── Init ─────────────────────────────────────────────────────
  (async function init() {
    const ok = await checkAuth();
    if (!ok) return;
    switchTab('dashboard');
    initRealtime();
  })();
})();
