/* ============================================================
   ARRZ MARKET — sell.js
   Form pengajuan Jual Akun: upload multi foto (drag & drop),
   validasi, submit ke backend, buka WhatsApp dengan pesan siap pakai.
   ============================================================ */

(function () {
  const form = document.querySelector('[data-sell-form]');
  if (!form) return;

  const dropzone = document.querySelector('[data-dropzone]');
  const fileInput = document.querySelector('[data-photo-input]');
  const previewGrid = document.querySelector('[data-photo-preview]');
  const categorySelect = document.querySelector('[name="category_id"]');

  let selectedFiles = [];
  const MAX_FILES = 8;

  // ── Load kategori untuk dropdown ────────────────────────────
  (async function loadCategories() {
    if (!categorySelect) return;
    try {
      const { data } = await ARRZ.apiFetch('/categories');
      categorySelect.innerHTML =
        '<option value="">Pilih kategori</option>' +
        (data || []).map((cat) => `<option value="${cat.id}">${ARRZ.escapeAttr(cat.name)}</option>`).join('');
    } catch (e) {
      categorySelect.innerHTML = '<option value="">Gagal memuat kategori</option>';
    }
  })();

  // ── Dropzone: klik & drag-drop ──────────────────────────────
  dropzone?.addEventListener('click', () => fileInput.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput?.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  function handleFiles(fileList) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

    for (const file of Array.from(fileList)) {
      if (selectedFiles.length >= MAX_FILES) {
        ARRZ.toast(`Maksimal ${MAX_FILES} foto.`, 'error');
        break;
      }
      if (!validTypes.includes(file.type)) {
        ARRZ.toast(`${file.name}: format tidak didukung (gunakan JPG/PNG/WEBP).`, 'error');
        continue;
      }
      if (file.size > maxSize) {
        ARRZ.toast(`${file.name}: ukuran melebihi 5MB.`, 'error');
        continue;
      }
      selectedFiles.push(file);
    }
    renderPreviews();
  }

  function renderPreviews() {
    previewGrid.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      const url = URL.createObjectURL(file);
      const item = document.createElement('div');
      item.className = 'photo-preview-item';
      item.innerHTML = `<img src="${url}" alt="Foto ${idx + 1}" /><button type="button" class="photo-preview-item__remove" aria-label="Hapus foto">×</button>`;
      item.querySelector('button').addEventListener('click', () => {
        selectedFiles.splice(idx, 1);
        renderPreviews();
      });
      previewGrid.appendChild(item);
    });
  }

  // ── Submit ───────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const confirmCheckbox = form.querySelector('[name="confirmed"]');

    if (!confirmCheckbox.checked) {
      ARRZ.toast('Kamu harus menyetujui bahwa informasi yang diberikan benar.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengirim...';

    try {
      let photoUrls = [];

      if (selectedFiles.length > 0) {
        const formData = new FormData();
        selectedFiles.forEach((file) => formData.append('photos', file));

        const uploadRes = await fetch('/api/uploads', { method: 'POST', body: formData });
        const uploadBody = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadBody.message || uploadBody.error || 'Upload foto gagal.');
        }
        photoUrls = uploadBody.urls || [];
        if (uploadBody.warning) {
          ARRZ.toast(uploadBody.warning, 'error', 6000);
        }
      }

      const payload = {
        seller_name: form.querySelector('[name="seller_name"]').value.trim(),
        seller_whatsapp: form.querySelector('[name="seller_whatsapp"]').value.trim(),
        seller_email: form.querySelector('[name="seller_email"]').value.trim(),
        account_name: form.querySelector('[name="account_name"]').value.trim(),
        platform: form.querySelector('[name="platform"]').value.trim(),
        category_id: categorySelect?.value || null,
        username: form.querySelector('[name="username"]').value.trim(),
        desired_price: form.querySelector('[name="desired_price"]').value || null,
        description: form.querySelector('[name="description"]').value.trim(),
        details: form.querySelector('[name="details"]').value.trim(),
        features: form.querySelector('[name="features"]').value.trim(),
        additional_info: form.querySelector('[name="additional_info"]').value.trim(),
        photo_urls: photoUrls,
        confirmed: true,
      };

      const { whatsapp } = await ARRZ.apiFetch('/sell-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      ARRZ.openWhatsApp(whatsapp.adminNumber, whatsapp.message);
      ARRZ.toast('Pengajuan terkirim! Kamu akan diarahkan ke WhatsApp admin.', 'success');
      form.reset();
      selectedFiles = [];
      renderPreviews();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      ARRZ.toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Kirim Pengajuan';
    }
  });
})();
