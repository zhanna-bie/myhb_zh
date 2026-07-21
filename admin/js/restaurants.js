import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase-admin.js';
import { DEFAULT_LOCATIONS } from '../../js/defaults.js';
import { $, $$, cleanObject, compressImage, escapeHtml, firebaseErrorMessage, formToObject, mountView, setButtonLoading } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const CLOUDINARY_CLOUD_NAME = 'mh1qp8ls';
const CLOUDINARY_UPLOAD_PRESET = 'gallery_upload';
// List keys double as the field names on settings/votingOrder — 'venue' is the
// "held at a restaurant" category (mirrors the old venue:'out' value), 'home'
// is delivery. A restaurant's presence in one or both arrays *is* its category
// now — there's no separate venue field on the restaurant doc to keep in sync.
const LISTS = { venue: '🍽 У закладі', home: '🏠 Вдома · доставка' };
const ORDER_PATH = ['settings', 'votingOrder'];

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyRestaurants() { unsubscribers.splice(0).forEach(unsub => unsub()); }

/** @param {Record<string, unknown>} [data] @param {string} [id] */
function restaurantForm(data = {}, id = '') {
  return `
    <form class="entity-form" id="restaurantForm">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <label>Назва<input name="name" required placeholder="Дрова" value="${escapeHtml(String(data.name || ''))}"></label>
      <label>Кухня<input name="category" required placeholder="Гриль · піца" value="${escapeHtml(String(data.category || ''))}"></label>
      <label>Посилання на меню<input name="menuUrl" type="url" required placeholder="https://…" value="${escapeHtml(String(data.menuUrl || ''))}"></label>
      <label>Google Maps (необов'язково)<input name="mapsUrl" type="url" placeholder="https://maps.app.goo.gl/…" value="${escapeHtml(String(data.mapsUrl || ''))}"></label>
      <label>Фото закладу
        <input name="photos" placeholder="Завантаж файл нижче або встав URL" value="${escapeHtml((data.photos || []).join(', '))}">
      </label>
      <label class="upload-photo-label">📷 Завантажити фото з комп'ютера
        <input type="file" id="restaurantPhotoFile" accept="image/*" hidden>
      </label>
      <p class="form-hint" id="restaurantPhotoStatus">Фото з'явиться на картці закладу на сайті. Можна кілька — через кому, перше буде головним.</p>
      <label class="checkbox"><input name="enabled" type="checkbox" ${data.enabled !== false ? 'checked' : ''}> Показувати на сайті</label>
    </form>
  `;
}

/** Wire the "upload from computer" button inside the restaurant modal. */
function bindPhotoUpload(panel) {
  const input = panel.querySelector('#restaurantPhotoFile');
  const urls = panel.querySelector('[name="photos"]');
  const status = panel.querySelector('#restaurantPhotoStatus');
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    status.textContent = 'Завантажую фото…';
    try {
      const compressed = await compressImage(file, 1600, 0.85);
      const body = new FormData();
      body.append('file', compressed);
      body.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body });
      if (!response.ok) throw new Error('upload');
      const uploaded = await response.json();
      urls.value = [...urls.value.split(',').map(value => value.trim()).filter(Boolean), uploaded.secure_url].join(', ');
      status.textContent = '✓ Фото завантажено й додано в поле вище. Натисни «Зберегти».';
    } catch {
      status.textContent = '✕ Не вдалося завантажити фото. Спробуй ще раз або встав URL вручну.';
    } finally {
      input.value = '';
    }
  });
}

function restaurantPayload(form) {
  const raw = formToObject(form);
  return cleanObject({
    name: raw.name.trim(),
    category: raw.category.trim(),
    menuUrl: raw.menuUrl,
    mapsUrl: raw.mapsUrl || '',
    photos: String(raw.photos || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 3),
    enabled: raw.enabled === 'on'
  });
}

/** Opens the create/edit modal. `onSaved(id)` fires after a successful save (id is the new doc id when creating). */
function openRestaurantEditor({ title, data, id, onSaved }) {
  modal.open({
    title,
    body: restaurantForm(data, id),
    footer: '<button class="button ghost" data-modal-close type="button">Скасувати</button><button class="button primary" id="saveRestaurantBtn" type="button">Зберегти</button>',
    onMount: panel => {
      bindPhotoUpload(panel);
      panel.querySelector('#saveRestaurantBtn').addEventListener('click', async () => {
        const form = panel.querySelector('#restaurantForm');
        const button = panel.querySelector('#saveRestaurantBtn');
        if (!form.reportValidity()) return;
        setButtonLoading(button, true, 'Зберігаю...');
        try {
          const payload = restaurantPayload(form);
          let savedId = id;
          if (id) {
            await updateDoc(doc(db, 'restaurants', id), { ...payload, updatedAt: serverTimestamp() });
          } else {
            savedId = (await addDoc(collection(db, 'restaurants'), { ...payload, createdAt: serverTimestamp() })).id;
          }
          modal.close();
          await onSaved?.(savedId);
        } catch (error) {
          toast.error(firebaseErrorMessage(error));
        } finally {
          setButtonLoading(button, false);
        }
      });
    }
  });
}

// Mirrors DEFAULT_LOCATIONS on the public site — one click copies them into
// Firestore (restaurant docs + their venue/home list membership) so
// photos/edits can be managed per-place without retyping.
const SEED_PLACES = DEFAULT_LOCATIONS;

export function renderRestaurants() {
  mountView(`
    <section class="view view-restaurants">
      <header class="view-header">
        <div><p class="eyebrow">ГОЛОСУВАННЯ</p><h1>Заклади</h1><p class="muted">Перетягни картку, щоб змінити порядок. Заклад може бути в обох списках незалежно — просто додай його в кожен окремо.</p></div>
        <div><button class="button ghost" id="seedRestaurantsBtn" type="button">Імпортувати стандартний список</button></div>
      </header>
      ${Object.entries(LISTS).map(([key, label]) => `
        <div class="panel voting-order-panel">
          <div class="panel-head"><h2>${label}</h2></div>
          <ul class="voting-order-list" id="list-${key}" data-list="${key}"></ul>
          <div class="voting-order-actions">
            <button class="button ghost add-existing" data-list="${key}" type="button">+ Додати наявний заклад</button>
            <button class="button ghost add-new" data-list="${key}" type="button">+ Додати новий заклад</button>
          </div>
        </div>
      `).join('')}
    </section>
  `);

  let restaurants = {};
  let order = { venue: [], home: [] };
  let votes = {};

  const itemTemplate = (id, data, listKey, count, total) => {
    const percent = Math.round((count / total) * 100);
    const photo = data.photos?.[0] ? `style="background-image:url('${escapeHtml(data.photos[0])}')"` : '';
    return `
      <li class="voting-order-item ${data.enabled === false ? 'is-disabled' : ''}" draggable="true" data-id="${id}">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <div class="voting-order-thumb" ${photo}></div>
        <div class="voting-order-body">
          <b>${escapeHtml(data.name)}</b>
          <span class="muted">${escapeHtml(data.category)}${data.enabled === false ? ' · приховано' : ''}</span>
          <div class="vote-bar"><i style="width:${percent}%"></i><span>${count} голос(ів) · ${percent}%</span></div>
        </div>
        <div class="voting-order-item-actions">
          <button class="button ghost edit-item" data-id="${id}" type="button">Редагувати</button>
          <button class="button ghost toggle-item" data-id="${id}" data-enabled="${data.enabled !== false}" type="button">${data.enabled === false ? 'Показати' : 'Приховати'}</button>
          <button class="button ghost remove-from-list" data-id="${id}" data-list="${listKey}" type="button">Прибрати зі списку</button>
          <button class="button danger delete-item" data-id="${id}" type="button">Видалити</button>
        </div>
      </li>
    `;
  };

  const bindItemActions = (listEl, listKey) => {
    $$('.edit-item', listEl).forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        openRestaurantEditor({ title: 'Редагувати заклад', data: restaurants[id], id });
      });
    });
    $$('.toggle-item', listEl).forEach(button => {
      button.addEventListener('click', async () => {
        const enabled = button.dataset.enabled !== 'true';
        try {
          await updateDoc(doc(db, 'restaurants', button.dataset.id), { enabled, updatedAt: serverTimestamp() });
          toast.success(enabled ? 'Заклад показується на сайті' : 'Заклад приховано');
        } catch (error) {
          toast.error(firebaseErrorMessage(error));
        }
      });
    });
    $$('.remove-from-list', listEl).forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await setDoc(doc(db, ...ORDER_PATH), { [button.dataset.list]: arrayRemove(button.dataset.id) }, { merge: true });
          toast.success('Прибрано зі списку');
        } catch (error) {
          toast.error(firebaseErrorMessage(error));
        }
      });
    });
    $$('.delete-item', listEl).forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await modal.confirm({ title: 'Видалити заклад', body: 'Заклад зникне з голосування назавжди (з обох списків). Видалити?', danger: true, confirmLabel: 'Видалити' });
        if (!confirmed) return;
        try {
          await deleteDoc(doc(db, 'restaurants', button.dataset.id));
          await setDoc(doc(db, ...ORDER_PATH), { venue: arrayRemove(button.dataset.id), home: arrayRemove(button.dataset.id) }, { merge: true });
          toast.success('Заклад видалено');
        } catch (error) {
          toast.error(firebaseErrorMessage(error));
        }
      });
    });
  };

  const paint = () => {
    const total = Object.values(votes).reduce((sum, value) => sum + value, 0) || 1;
    Object.keys(LISTS).forEach(listKey => {
      const listEl = $(`#list-${listKey}`);
      const ids = (order[listKey] || []).filter(id => restaurants[id]);
      listEl.innerHTML = ids.length
        ? ids.map(id => itemTemplate(id, restaurants[id], listKey, votes[id] || 0, total)).join('')
        : '<li class="voting-order-empty muted">Ще порожньо — додай заклад нижче.</li>';
      bindItemActions(listEl, listKey);
    });
  };

  // Native HTML5 drag-and-drop, bound once per list container so it survives
  // paint() re-rendering the <ul>'s innerHTML (listeners live on the <ul> itself).
  const bindDragAndDrop = (listEl, listKey) => {
    let draggedId = null;
    const items = () => [...listEl.querySelectorAll('.voting-order-item')];
    listEl.addEventListener('dragstart', event => {
      const li = event.target.closest('.voting-order-item');
      if (!li) return;
      draggedId = li.dataset.id;
      li.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
    });
    listEl.addEventListener('dragend', () => {
      items().forEach(li => li.classList.remove('dragging', 'drag-before', 'drag-after'));
      draggedId = null;
    });
    listEl.addEventListener('dragover', event => {
      if (!draggedId) return;
      event.preventDefault();
      const li = event.target.closest('.voting-order-item');
      if (!li || li.dataset.id === draggedId) return;
      const before = event.clientY - li.getBoundingClientRect().top < li.offsetHeight / 2;
      items().forEach(item => item.classList.remove('drag-before', 'drag-after'));
      li.classList.add(before ? 'drag-before' : 'drag-after');
    });
    listEl.addEventListener('drop', event => {
      event.preventDefault();
      const li = event.target.closest('.voting-order-item');
      const before = li ? event.clientY - li.getBoundingClientRect().top < li.offsetHeight / 2 : null;
      items().forEach(item => item.classList.remove('dragging', 'drag-before', 'drag-after'));
      const dragged = draggedId;
      draggedId = null;
      if (!dragged) return;
      if (li && li.dataset.id === dragged) return; // dropped back onto itself — no-op
      const ids = items().map(item => item.dataset.id);
      const from = ids.indexOf(dragged);
      if (from === -1) return;
      ids.splice(from, 1);
      if (li) {
        let to = ids.indexOf(li.dataset.id);
        if (!before) to += 1;
        ids.splice(to, 0, dragged);
      } else {
        // Dropped outside any row (e.g. empty space below the last item) — send it to the end.
        ids.push(dragged);
      }
      setDoc(doc(db, ...ORDER_PATH), { [listKey]: ids }, { merge: true }).catch(error => toast.error(firebaseErrorMessage(error)));
    });
  };

  Object.keys(LISTS).forEach(listKey => bindDragAndDrop($(`#list-${listKey}`), listKey));

  $$('.add-existing').forEach(button => {
    button.addEventListener('click', () => {
      const listKey = button.dataset.list;
      const currentIds = new Set(order[listKey] || []);
      const candidates = Object.entries(restaurants).filter(([id]) => !currentIds.has(id));
      modal.open({
        title: `Додати наявний заклад — ${LISTS[listKey]}`,
        body: candidates.length
          ? `<div class="picker-list">${candidates.map(([id, data]) => `<button class="picker-row" data-id="${id}" type="button"><b>${escapeHtml(data.name)}</b><span class="muted">${escapeHtml(data.category)}</span></button>`).join('')}</div>`
          : '<p class="muted">Усі заклади вже в цьому списку. Додай новий кнопкою «Додати новий заклад».</p>',
        footer: '<button class="button ghost" data-modal-close type="button">Закрити</button>',
        onMount: panel => {
          $$('.picker-row', panel).forEach(row => {
            row.addEventListener('click', async () => {
              try {
                await setDoc(doc(db, ...ORDER_PATH), { [listKey]: arrayUnion(row.dataset.id) }, { merge: true });
                toast.success('Додано в список');
                modal.close();
              } catch (error) {
                toast.error(firebaseErrorMessage(error));
              }
            });
          });
        }
      });
    });
  });

  $$('.add-new').forEach(button => {
    button.addEventListener('click', () => {
      const listKey = button.dataset.list;
      openRestaurantEditor({
        title: `Новий заклад — ${LISTS[listKey]}`,
        data: {},
        id: '',
        onSaved: async newId => {
          await setDoc(doc(db, ...ORDER_PATH), { [listKey]: arrayUnion(newId) }, { merge: true });
          toast.success('Заклад додано в список');
        }
      });
    });
  });

  $('#seedRestaurantsBtn').addEventListener('click', async () => {
    const confirmed = await modal.confirm({ title: 'Імпорт закладів', body: `Додати/оновити стандартний список із ${SEED_PLACES.length} закладів (як на сайті зараз)? Уже додані тобою заклади не постраждають. Далі зможеш редагувати кожен і додати фото.`, confirmLabel: 'Імпортувати' });
    if (!confirmed) return;
    try {
      const batch = writeBatch(db);
      SEED_PLACES.forEach(place => {
        const { id, venue, ...data } = place;
        // No `enabled` here on purpose: merge:true must not silently re-show a
        // place she already hid if this import is ever run a second time.
        batch.set(doc(db, 'restaurants', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      });
      const orderPayload = {};
      const venueIds = SEED_PLACES.filter(place => ['out', 'both'].includes(place.venue)).map(place => place.id);
      const homeIds = SEED_PLACES.filter(place => ['home', 'both'].includes(place.venue)).map(place => place.id);
      if (venueIds.length) orderPayload.venue = arrayUnion(...venueIds);
      if (homeIds.length) orderPayload.home = arrayUnion(...homeIds);
      if (Object.keys(orderPayload).length) batch.set(doc(db, ...ORDER_PATH), orderPayload, { merge: true });
      await batch.commit();
      toast.success('Стандартний список імпортовано');
    } catch (error) {
      toast.error(firebaseErrorMessage(error));
    }
  });

  track(onSnapshot(collection(db, 'restaurants'), snapshot => {
    restaurants = Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]));
    paint();
  }, () => toast.error('Restaurants listener failed')));

  track(onSnapshot(doc(db, ...ORDER_PATH), snapshot => {
    const data = snapshot.data() || {};
    order = { venue: Array.isArray(data.venue) ? data.venue : [], home: Array.isArray(data.home) ? data.home : [] };
    paint();
  }, () => toast.error('Voting order listener failed')));

  track(onSnapshot(collection(db, 'votes'), snapshot => {
    votes = {};
    snapshot.forEach(item => {
      const id = item.data().placeId;
      if (id) votes[id] = (votes[id] || 0) + 1;
    });
    paint();
  }));
}
