import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { $, $$, cleanObject, escapeHtml, firebaseErrorMessage, formToObject, mountView, setButtonLoading } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyRoutes() { unsubscribers.splice(0).forEach(unsub => unsub()); }

// Cities must match the tabs on the public site exactly — a typo in a free-text
// field would make the route invisible, so the form only offers these values.
const CITIES = ['Київ', 'Львів', 'Вінниця'];

/** @param {Record<string, unknown>} [data] @param {string} [id] */
function routeForm(data = {}, id = '') {
  const city = String(data.city || 'Київ');
  const direction = String(data.direction || 'ТУДИ');
  return `
    <form class="entity-form" id="routeForm">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <label>Місто (вкладка на сайті)
        <select name="city">${CITIES.map(name => `<option value="${name}" ${name === city ? 'selected' : ''}>${name}</option>`).join('')}</select>
      </label>
      <label>Напрямок
        <select name="direction">
          <option value="ТУДИ" ${direction === 'ТУДИ' ? 'selected' : ''}>ТУДИ — 23 серпня, до Нетішина</option>
          <option value="НАЗАД" ${direction === 'НАЗАД' ? 'selected' : ''}>НАЗАД — 24 серпня, з Нетішина</option>
        </select>
      </label>
      <label>Звідки (станція)<input name="from" required placeholder="Київ-Пасажирський" value="${escapeHtml(String(data.from || ''))}"></label>
      <label>Куди (станція)<input name="to" required placeholder="Нетішин" value="${escapeHtml(String(data.to || ''))}"></label>
      <label>Дата<input name="date" required placeholder="23.08.2026" value="${escapeHtml(String(data.date || ''))}"></label>
      <label>Номер потяга<input name="trainNumber" required placeholder="143К" value="${escapeHtml(String(data.trainNumber || ''))}"></label>
      <label>Відправлення<input name="departure" required placeholder="07:32" value="${escapeHtml(String(data.departure || ''))}"></label>
      <label>Прибуття<input name="arrival" required placeholder="12:45" value="${escapeHtml(String(data.arrival || ''))}"></label>
      <label>У дорозі<input name="duration" required placeholder="5 год 13 хв" value="${escapeHtml(String(data.duration || ''))}"></label>
      <label>Пересадки<input name="transfers" required placeholder="Прямий" value="${escapeHtml(String(data.transfers || 'Прямий'))}"></label>
      <label>Ціна (необов'язково)<input name="price" placeholder="від 350 ₴" value="${escapeHtml(String(data.price || ''))}"></label>
      <label>Посилання на купівлю квитка<input name="bookingUrl" type="url" value="${escapeHtml(String(data.bookingUrl || 'https://booking.uz.gov.ua/'))}"></label>
      <label class="checkbox"><input name="recommended" type="checkbox" ${data.recommended ? 'checked' : ''}> ⭐ Найкращий варіант — підсвітити картку золотом</label>
      <p class="form-hint">Маршрут одразу з'явиться на сайті у вкладці обраного міста. Порядок карток міняється стрілками ↑↓ у списку.</p>
    </form>
  `;
}

/**
 * For new routes: pre-fill «Звідки/Куди/Дата» from the selected city & direction,
 * but never overwrite a field the admin already typed in by hand.
 * @param {HTMLElement} panel
 */
function bindRouteAutofill(panel) {
  const form = panel.querySelector('#routeForm');
  if (form.querySelector('[name="id"]').value) return; // editing — leave data alone
  const fields = ['from', 'to', 'date'].map(name => form.querySelector(`[name="${name}"]`));
  fields.forEach(field => field.addEventListener('input', () => { field.dataset.touched = '1'; }));
  const apply = () => {
    const city = form.querySelector('[name="city"]').value;
    const away = form.querySelector('[name="direction"]').value === 'ТУДИ';
    const values = { from: away ? city : 'Нетішин', to: away ? 'Нетішин' : city, date: away ? '23.08.2026' : '24.08.2026' };
    fields.forEach(field => { if (!field.dataset.touched) field.value = values[field.name]; });
  };
  form.querySelector('[name="city"]').addEventListener('change', apply);
  form.querySelector('[name="direction"]').addEventListener('change', apply);
  apply();
}

async function saveRoute(form) {
  const raw = formToObject(form);
  const payload = cleanObject({
    city: raw.city,
    direction: raw.direction,
    from: raw.from.trim(),
    to: raw.to.trim(),
    date: raw.date.trim(),
    trainNumber: raw.trainNumber.trim(),
    departure: raw.departure.trim(),
    arrival: raw.arrival.trim(),
    duration: raw.duration.trim(),
    transfers: raw.transfers.trim(),
    price: (raw.price || '').trim(),
    bookingUrl: raw.bookingUrl || 'https://booking.uz.gov.ua/',
    recommended: raw.recommended === 'on'
  });
  if (raw.id) {
    await updateDoc(doc(db, 'transport', raw.id), { ...payload, updatedAt: serverTimestamp() });
    toast.success('Маршрут оновлено');
  } else {
    // New routes go to the end of the list; reorder with the ↑↓ buttons.
    await addDoc(collection(db, 'transport'), { ...payload, sortOrder: Date.now(), createdAt: serverTimestamp() });
    toast.success('Маршрут додано — вже на сайті');
  }
}

async function reorderRoutes(id, direction, routes) {
  const sorted = [...routes].sort((a, b) => (a.sortOrder ?? a.order ?? 0) - (b.sortOrder ?? b.order ?? 0));
  const index = sorted.findIndex(item => item.id === id);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= sorted.length) return;
  const batch = writeBatch(db);
  const current = sorted[index];
  const target = sorted[swapIndex];
  batch.update(doc(db, 'transport', current.id), { sortOrder: target.sortOrder ?? target.order ?? swapIndex });
  batch.update(doc(db, 'transport', target.id), { sortOrder: current.sortOrder ?? current.order ?? index });
  await batch.commit();
  toast.success('Порядок оновлено');
}

export function renderRoutes() {
  mountView(`
    <section class="view view-routes">
      <header class="view-header">
        <div><p class="eyebrow">ДОЇЗД</p><h1>Маршрути</h1><p class="muted">Потяги до Нетішина й назад. Все, що додаси тут, одразу з'явиться на сайті.</p></div>
        <button class="button primary" id="addRouteBtn" type="button">+ Додати маршрут</button>
      </header>
      <div class="entity-list" id="routesList"><div class="skeleton-card"></div></div>
    </section>
  `);

  $('#addRouteBtn').addEventListener('click', () => {
    modal.open({
      title: 'Новий маршрут',
      body: routeForm(),
      footer: '<button class="button ghost" data-modal-close type="button">Скасувати</button><button class="button primary" id="saveRouteBtn" type="button">Зберегти</button>',
      onMount: panel => {
        bindRouteAutofill(panel);
        panel.querySelector('#saveRouteBtn').addEventListener('click', async () => {
          const form = panel.querySelector('#routeForm');
          const button = panel.querySelector('#saveRouteBtn');
          if (!form.reportValidity()) return;
          setButtonLoading(button, true, 'Зберігаю...');
          try {
            await saveRoute(form);
            modal.close();
          } catch (error) {
            toast.error(firebaseErrorMessage(error));
          } finally {
            setButtonLoading(button, false);
          }
        });
      }
    });
  });

  track(onSnapshot(collection(db, 'transport'), snapshot => {
    const routes = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.sortOrder ?? a.order ?? 0) - (b.sortOrder ?? b.order ?? 0));
    const root = $('#routesList');
    if (!routes.length) {
      root.innerHTML = '<div class="empty-state">Маршрутів ще немає. Натисни «+ Додати маршрут» — форма сама підставить станції й дати.</div>';
      return;
    }
    root.innerHTML = routes.map(route => `
      <article class="route-admin-card ${route.recommended ? 'is-recommended' : ''}">
        <div>
          <span class="badge">${route.recommended ? '⭐ Найкращий' : escapeHtml(route.direction || '')}</span>
          <h3>${escapeHtml(route.city)} · №${escapeHtml(route.trainNumber)}</h3>
          <p>${escapeHtml(route.from)} → ${escapeHtml(route.to)}</p>
          <small>${escapeHtml(route.date)} · ${escapeHtml(route.departure)} → ${escapeHtml(route.arrival)} · ${escapeHtml(route.duration)} · ${escapeHtml(route.transfers || 'Прямий')}</small>
        </div>
        <div class="entity-card-actions">
          <button class="button ghost move-route" data-id="${route.id}" data-dir="up" type="button" aria-label="Пересунути вище">↑</button>
          <button class="button ghost move-route" data-id="${route.id}" data-dir="down" type="button" aria-label="Пересунути нижче">↓</button>
          <button class="button ghost edit-route" data-id="${route.id}" type="button">Редагувати</button>
          <button class="button danger delete-route" data-id="${route.id}" type="button">Видалити</button>
        </div>
      </article>
    `).join('');

    const map = Object.fromEntries(routes.map(item => [item.id, item]));

    $$('.edit-route', root).forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        modal.open({
          title: 'Редагувати маршрут',
          body: routeForm(map[id], id),
          footer: '<button class="button ghost" data-modal-close type="button">Скасувати</button><button class="button primary" id="saveRouteBtn" type="button">Зберегти</button>',
          onMount: panel => {
            panel.querySelector('#saveRouteBtn').addEventListener('click', async () => {
              const form = panel.querySelector('#routeForm');
              const saveBtn = panel.querySelector('#saveRouteBtn');
              if (!form.reportValidity()) return;
              setButtonLoading(saveBtn, true, 'Зберігаю...');
              try {
                await saveRoute(form);
                modal.close();
              } catch (error) {
                toast.error(firebaseErrorMessage(error));
              } finally {
                setButtonLoading(saveBtn, false);
              }
            });
          }
        });
      });
    });

    $$('.move-route', root).forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await reorderRoutes(button.dataset.id, button.dataset.dir, routes);
        } catch (error) {
          toast.error(firebaseErrorMessage(error));
        }
      });
    });

    $$('.delete-route', root).forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await modal.confirm({ title: 'Видалити маршрут', body: 'Маршрут зникне з сайту назавжди. Видалити?', danger: true, confirmLabel: 'Видалити' });
        if (!confirmed) return;
        try {
          await deleteDoc(doc(db, 'transport', button.dataset.id));
          toast.success('Маршрут видалено');
        } catch (error) {
          toast.error(firebaseErrorMessage(error));
        }
      });
    });
  }, () => toast.error('Не вдалося завантажити маршрути. Перевір інтернет і Firestore Rules.')));
}
