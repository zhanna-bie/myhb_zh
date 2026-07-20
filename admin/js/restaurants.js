import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { $, $$, cleanObject, compressImage, escapeHtml, firebaseErrorMessage, formToObject, mountView, setButtonLoading } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const CLOUDINARY_CLOUD_NAME = 'mh1qp8ls';
const CLOUDINARY_UPLOAD_PRESET = 'gallery_upload';
const VENUES = { out: '🍽 У закладі', home: '🏠 Доставка додому', both: '🍽+🏠 І те, і те' };

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyRestaurants() { unsubscribers.splice(0).forEach(unsub => unsub()); }

/** @param {Record<string, unknown>} [data] @param {string} [id] */
function restaurantForm(data = {}, id = '') {
  const venue = String(data.venue || 'out');
  return `
    <form class="entity-form" id="restaurantForm">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <label>Назва<input name="name" required placeholder="Дрова" value="${escapeHtml(String(data.name || ''))}"></label>
      <label>Кухня<input name="category" required placeholder="Гриль · піца" value="${escapeHtml(String(data.category || ''))}"></label>
      <label>Формат (у якому кроці голосування показувати)
        <select name="venue">${Object.entries(VENUES).map(([value, label]) => `<option value="${value}" ${value === venue ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </label>
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

async function saveRestaurant(form) {
  const raw = formToObject(form);
  const payload = cleanObject({
    name: raw.name.trim(),
    category: raw.category.trim(),
    venue: ['out', 'home', 'both'].includes(raw.venue) ? raw.venue : 'out',
    menuUrl: raw.menuUrl,
    mapsUrl: raw.mapsUrl || '',
    photos: String(raw.photos || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 3),
    enabled: raw.enabled === 'on'
  });
  if (raw.id) {
    await updateDoc(doc(db, 'restaurants', raw.id), { ...payload, updatedAt: serverTimestamp() });
    toast.success('Заклад оновлено');
  } else {
    await addDoc(collection(db, 'restaurants'), { ...payload, sortOrder: Date.now(), createdAt: serverTimestamp() });
    toast.success('Заклад додано — вже на сайті');
  }
}

// Mirrors DEFAULT_LOCATIONS on the public site — one click copies them into
// Firestore so photos/edits can be managed per-place without retyping.
const SEED_PLACES = [
  { id: 'drova', name: 'Дрова', category: 'Гриль · піца', venue: 'out', menuUrl: 'https://piceriya-drova-netishyn.choiceqr.com/online-menu', mapsUrl: 'https://maps.app.goo.gl/VKrPLR8kP5mp2xsW6' },
  { id: 'la-famiglia', name: 'La Familia', category: 'Італійська', venue: 'out', menuUrl: 'https://expz.menu/091d3b4d-23bb-4965-93d8-4e2602f732b3' },
  { id: 'nonstop', name: 'Non Stop', category: 'Європейська', venue: 'both', menuUrl: 'https://nonstop.choiceqr.com/' },
  { id: 'lisovyi', name: 'Лісовий', category: 'Українська', venue: 'both', menuUrl: 'https://rest-lisovyi-netishyn.choiceqr.com/section:menyu' },
  { id: 'craft-pizza', name: 'Craft', category: 'Піца · суші · бургери', venue: 'home', menuUrl: 'https://menu.ps.me/eYPqnK2Jxq4' },
  { id: 'hamster-kebab', name: 'HAMSTER Кебаб', category: 'Кебаб · шаурма', venue: 'home', menuUrl: 'https://hamster-kebab1.ps.me/' }
];

export function renderRestaurants() {
  mountView(`
    <section class="view view-restaurants">
      <header class="view-header">
        <div><p class="eyebrow">ГОЛОСУВАННЯ</p><h1>Заклади</h1><p class="muted">Фото, посилання, формат (заклад/доставка) і живі голоси.</p></div>
        <div><button class="button ghost" id="seedRestaurantsBtn" type="button">Імпортувати стандартний список</button>
        <button class="button primary" id="addRestaurantBtn" type="button">+ Додати заклад</button></div>
      </header>
      <div class="entity-grid" id="restaurantsGrid"><div class="skeleton-card"></div><div class="skeleton-card"></div></div>
    </section>
  `);

  $('#seedRestaurantsBtn').addEventListener('click', async () => {
    const confirmed = await modal.confirm({ title: 'Імпорт закладів', body: 'Додати/оновити стандартний список із 8 закладів (як на сайті зараз)? Далі зможеш редагувати кожен і додати фото.', confirmLabel: 'Імпортувати' });
    if (!confirmed) return;
    try {
      const { writeBatch, doc: docRef } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const batch = writeBatch(db);
      SEED_PLACES.forEach((place, index) => {
        const { id, ...data } = place;
        batch.set(docRef(db, 'restaurants', id), { ...data, enabled: true, sortOrder: index, updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      toast.success('Стандартний список імпортовано');
    } catch (error) {
      toast.error(firebaseErrorMessage(error));
    }
  });

  $('#addRestaurantBtn').addEventListener('click', () => {
    modal.open({
      title: 'Новий заклад',
      body: restaurantForm(),
      footer: '<button class="button ghost" data-modal-close type="button">Скасувати</button><button class="button primary" id="saveRestaurantBtn" type="button">Зберегти</button>',
      onMount: panel => {
        bindPhotoUpload(panel);
        panel.querySelector('#saveRestaurantBtn').addEventListener('click', async () => {
          const form = panel.querySelector('#restaurantForm');
          const button = panel.querySelector('#saveRestaurantBtn');
          if (!form.reportValidity()) return;
          setButtonLoading(button, true, 'Зберігаю...');
          try {
            await saveRestaurant(form);
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

  let votes = {};
  let restaurantsSnapshot = null;

  const paintRestaurants = snapshot => {
    restaurantsSnapshot = snapshot;
    if (!snapshot) return;
    const root = $('#restaurantsGrid');
    const totalVotes = Object.values(votes).reduce((sum, value) => sum + value, 0) || 1;
    if (snapshot.empty) {
      root.innerHTML = '<div class="empty-state">У базі поки порожньо — сайт показує стандартний список. Натисни «Імпортувати стандартний список», щоб керувати закладами й додати фото.</div>';
      return;
    }
    const orderedDocs = [...snapshot.docs].sort((a, b) => (a.data().sortOrder ?? a.data().order ?? 0) - (b.data().sortOrder ?? b.data().order ?? 0));
    root.innerHTML = orderedDocs.map(item => {
        const data = item.data();
        const count = votes[item.id] || 0;
        const percent = Math.round((count / totalVotes) * 100);
        const photo = data.photos?.[0] ? `style="background-image:url('${escapeHtml(data.photos[0])}')"` : '';
        return `
          <article class="entity-card ${data.enabled === false ? 'is-disabled' : ''}" ${photo}>
            <div class="entity-card-body">
              <span class="badge">${data.enabled === false ? 'Приховано' : VENUES[data.venue] || VENUES.out}</span>
              <h3>${escapeHtml(data.name)}</h3>
              <p>${escapeHtml(data.category)}${data.photos?.length ? '' : ' · <b>без фото</b>'}</p>
              <div class="vote-bar"><i style="width:${percent}%"></i><span>${count} голос(ів) · ${percent}%</span></div>
            </div>
            <footer class="entity-card-actions">
              <button class="button ghost edit-restaurant" data-id="${item.id}" type="button">Редагувати</button>
              <button class="button ghost preview-restaurant" data-id="${item.id}" type="button">Перегляд</button>
              <button class="button ghost toggle-restaurant" data-id="${item.id}" data-enabled="${data.enabled !== false}" type="button">${data.enabled === false ? 'Показати' : 'Приховати'}</button>
              <button class="button danger delete-restaurant" data-id="${item.id}" type="button">Видалити</button>
            </footer>
          </article>
        `;
    }).join('');

    const docs = Object.fromEntries(orderedDocs.map(item => [item.id, item.data()]));

    $$('.edit-restaurant', root).forEach(button => {
        button.addEventListener('click', () => {
          const id = button.dataset.id;
          modal.open({
            title: 'Редагувати заклад',
            body: restaurantForm(docs[id], id),
            footer: '<button class="button ghost" data-modal-close type="button">Скасувати</button><button class="button primary" id="saveRestaurantBtn" type="button">Зберегти</button>',
            onMount: panel => {
              bindPhotoUpload(panel);
              panel.querySelector('#saveRestaurantBtn').addEventListener('click', async () => {
                const form = panel.querySelector('#restaurantForm');
                const saveBtn = panel.querySelector('#saveRestaurantBtn');
                if (!form.reportValidity()) return;
                setButtonLoading(saveBtn, true, 'Зберігаю...');
                try {
                  await saveRestaurant(form);
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

    $$('.preview-restaurant', root).forEach(button => {
        button.addEventListener('click', () => {
          const data = docs[button.dataset.id];
          modal.open({
            title: data.name,
            body: `<div class="preview-block">${data.photos?.[0] ? `<img class="modal-preview-image" src="${escapeHtml(data.photos[0])}" alt="${escapeHtml(data.name)}">` : '<p class="muted">Фото ще немає — додай через «Редагувати».</p>'}<p>${escapeHtml(data.category)}</p><p><a href="${escapeHtml(data.menuUrl)}" target="_blank" rel="noreferrer">Меню ↗</a></p><p><a href="${escapeHtml(data.mapsUrl || '#')}" target="_blank" rel="noreferrer">Google Maps ↗</a></p></div>`,
            size: 'modal-wide'
          });
        });
    });

    $$('.toggle-restaurant', root).forEach(button => {
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

    $$('.delete-restaurant', root).forEach(button => {
        button.addEventListener('click', async () => {
          const confirmed = await modal.confirm({ title: 'Видалити заклад', body: 'Заклад зникне з голосування назавжди. Видалити?', danger: true, confirmLabel: 'Видалити' });
          if (!confirmed) return;
          try {
            await deleteDoc(doc(db, 'restaurants', button.dataset.id));
            toast.success('Заклад видалено');
          } catch (error) {
            toast.error(firebaseErrorMessage(error));
          }
        });
    });
  };

  track(onSnapshot(collection(db, 'votes'), voteSnap => {
    votes = {};
    voteSnap.forEach(item => {
      const id = item.data().restaurant || item.data().locationId;
      if (id) votes[id] = (votes[id] || 0) + 1;
    });
    if (restaurantsSnapshot) paintRestaurants(restaurantsSnapshot);
  }));

  track(onSnapshot(collection(db, 'restaurants'), snapshot => {
    paintRestaurants(snapshot);
  }, () => toast.error('Restaurants listener failed')));
}
