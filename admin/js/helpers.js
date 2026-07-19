export { $, $$, escapeHtml, relativeTime, formatBytes, setButtonLoading, exportCsv, compressImage, imageDimensions } from '../../js/utils.js';

/** @param {import('firebase/firestore').Timestamp | Date | string | number | null | undefined} value */
export function formatDateTime(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** @param {unknown} error */
export function firebaseErrorMessage(error) {
  if (!error || typeof error !== 'object') return 'Невідома помилка';
  const code = /** @type {{ code?: string, message?: string }} */ (error).code || '';
  const map = {
    'permission-denied': 'Немає доступу. Перевір Firestore Rules.',
    'unavailable': 'Firebase тимчасово недоступний.',
    'not-found': 'Документ не знайдено.',
    'already-exists': 'Запис уже існує.',
    'auth/invalid-credential': 'Невірний email або пароль.',
    'auth/too-many-requests': 'Забагато спроб. Спробуй пізніше.'
  };
  return map[code] || /** @type {{ message?: string }} */ (error).message || 'Сталася помилка';
}

/** @param {HTMLElement} container @param {number} [count] */
export function renderSkeletons(container, count = 3) {
  container.innerHTML = Array.from({ length: count }, () => '<div class="skeleton-card"></div>').join('');
}

/** @param {HTMLElement} element @param {string} view */
export function setActiveNav(element, view) {
  document.querySelectorAll('[data-view]').forEach(link => {
    link.classList.toggle('active', link.dataset.view === view);
    link.setAttribute('aria-current', link.dataset.view === view ? 'page' : 'false');
  });
  if (element) element.classList.add('active');
}

/** @param {string} html */
export function mountView(html) {
  const root = document.getElementById('view-root');
  root.innerHTML = html;
  return root;
}

/** @param {FormData | HTMLFormElement} source */
export function formToObject(source) {
  const data = source instanceof FormData ? Object.fromEntries(source.entries()) : Object.fromEntries(new FormData(source).entries());
  return data;
}

/** @param {Record<string, unknown>} data */
export function cleanObject(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== '' && value !== null && value !== undefined));
}

/** @param {string} text */
export function truncate(text, max = 120) {
  if (!text || text.length <= max) return text || '';
  return `${text.slice(0, max).trim()}…`;
}
