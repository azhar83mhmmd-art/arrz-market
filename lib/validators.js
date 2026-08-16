// Util validasi & helper kecil dipakai lintas routes

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidNumber(v) {
  const n = Number(v);
  return typeof v !== 'boolean' && !Number.isNaN(n) && Number.isFinite(n);
}

function isValidPositiveNumber(v) {
  return isValidNumber(v) && Number(v) >= 0;
}

// Validasi longgar nomor WhatsApp: hanya digit, panjang wajar (8-15 digit)
function isValidWhatsApp(v) {
  if (!isNonEmptyString(v)) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function sanitizeText(v, maxLen = 5000) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, maxLen);
}

// Escape sederhana untuk mencegah nilai aneh masuk sebagai HTML jika suatu
// saat dirender di admin (defense-in-depth, di luar output-encoding di frontend)
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  isNonEmptyString,
  isValidNumber,
  isValidPositiveNumber,
  isValidWhatsApp,
  sanitizeText,
  escapeHtml,
};
