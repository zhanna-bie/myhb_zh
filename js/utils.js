export const $ = (selector, parent = document) => parent.querySelector(selector);
export const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

/** @param {string} [value] */
export function escapeHtml(value = '') {
  const node = document.createElement('span');
  node.textContent = String(value);
  return node.innerHTML;
}

/** @param {import('firebase/firestore').Timestamp | Date | string | number | null | undefined} timestamp */
export function relativeTime(timestamp) {
  const date = timestamp?.toDate?.() || (timestamp ? new Date(timestamp) : null);
  if (!date || Number.isNaN(date.getTime())) return 'щойно';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'щойно';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} хв тому`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} год тому`;
  return `${Math.floor(seconds / 86400)} дн тому`;
}

/** @param {File} file */
export function imageDimensions(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.width, height: image.height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image-read'));
    };
    image.src = url;
  });
}

/**
 * Compress image before upload when beneficial.
 * @param {File} file
 * @param {number} [maxWidth]
 * @param {number} [quality]
 */
export async function compressImage(file, maxWidth = 1920, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < 400000) return file;

  const dimensions = await imageDimensions(file);
  const scale = Math.min(1, maxWidth / dimensions.width);
  if (scale >= 1 && file.size < 1200000) return file;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(dimensions.width * scale);
    canvas.height = Math.round(dimensions.height * scale);
    const ctx = canvas.getContext('2d');
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        blob => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() }) : file),
        'image/jpeg',
        quality
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('compress'));
    };
    image.src = url;
  });
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

/** @param {HTMLButtonElement} button @param {boolean} loading @param {string} [label] */
export function setButtonLoading(button, loading, label = 'Loading...') {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${label}`;
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

/** @param {Record<string, unknown>[]} rows @param {string} filename */
export function exportCsv(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(key => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
