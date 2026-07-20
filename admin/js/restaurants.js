import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { $, $$, cleanObject, escapeHtml, formToObject, mountView, setButtonLoading } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyRestaurants() { unsubscribers.splice(0).forEach(unsub => unsub()); }

/** @param {Record<string, unknown>} [data] @param {string} [id] */
function restaurantForm(data = {}, id = '') {
  return `
    <form class="entity-form" id="restaurantForm">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <label>Name<input name="name" required value="${escapeHtml(String(data.name || ''))}"></label>
      <label>Cuisine<input name="category" required value="${escapeHtml(String(data.category || ''))}"></label>
      <label>Menu URL<input name="menuUrl" type="url" required value="${escapeHtml(String(data.menuUrl || ''))}"></label>
      <label>Google Maps URL<input name="mapsUrl" type="url" value="${escapeHtml(String(data.mapsUrl || ''))}"></label>
      <label>Photo URLs (2–3, comma separated)<input name="photos" value="${escapeHtml((data.photos || []).join(', '))}"></label>
      <label>Order<input name="sortOrder" type="number" min="0" value="${escapeHtml(String(data.sortOrder ?? data.order ?? 0))}"></label>
      <label class="checkbox"><input name="enabled" type="checkbox" ${data.enabled !== false ? 'checked' : ''}> Enabled</label>
    </form>
  `;
}

async function saveRestaurant(form) {
  const raw = formToObject(form);
  const payload = cleanObject({
    name: raw.name,
    category: raw.category,
    menuUrl: raw.menuUrl,
    mapsUrl: raw.mapsUrl || '',
    photos: String(raw.photos || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 3),
    sortOrder: Number(raw.sortOrder || 0),
    enabled: raw.enabled === 'on'
  });
  if (raw.id) {
    await updateDoc(doc(db, 'restaurants', raw.id), { ...payload, updatedAt: serverTimestamp() });
    toast.success('Restaurant updated');
  } else {
    await addDoc(collection(db, 'restaurants'), { ...payload, createdAt: serverTimestamp() });
    toast.success('Restaurant added');
  }
}

export function renderRestaurants() {
  mountView(`
    <section class="view view-restaurants">
      <header class="view-header">
        <div><p class="eyebrow">LOCATIONS</p><h1>Restaurants</h1><p class="muted">Manage photos, links, order and live votes.</p></div>
        <button class="button primary" id="addRestaurantBtn" type="button">+ Add restaurant</button>
      </header>
      <div class="entity-grid" id="restaurantsGrid"><div class="skeleton-card"></div><div class="skeleton-card"></div></div>
    </section>
  `);

  $('#addRestaurantBtn').addEventListener('click', () => {
    modal.open({
      title: 'Add restaurant',
      body: restaurantForm(),
      footer: '<button class="button ghost" data-modal-close type="button">Cancel</button><button class="button primary" id="saveRestaurantBtn" type="button">Save</button>',
      onMount: panel => {
        panel.querySelector('#saveRestaurantBtn').addEventListener('click', async () => {
          const form = panel.querySelector('#restaurantForm');
          const button = panel.querySelector('#saveRestaurantBtn');
          if (!form.reportValidity()) return;
          setButtonLoading(button, true, 'Saving...');
          try {
            await saveRestaurant(form);
            modal.close();
          } catch {
            toast.error('Could not save restaurant');
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
      root.innerHTML = '<div class="empty-state">No restaurants yet.</div>';
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
              <span class="badge">${data.enabled === false ? 'Disabled' : 'Live'}</span>
              <h3>${escapeHtml(data.name)}</h3>
              <p>${escapeHtml(data.category)}</p>
              <div class="vote-bar"><i style="width:${percent}%"></i><span>${count} votes · ${percent}%</span></div>
            </div>
            <footer class="entity-card-actions">
              <button class="button ghost edit-restaurant" data-id="${item.id}" type="button">Edit</button>
              <button class="button ghost preview-restaurant" data-id="${item.id}" type="button">Preview</button>
              <button class="button ghost toggle-restaurant" data-id="${item.id}" data-enabled="${data.enabled !== false}" type="button">${data.enabled === false ? 'Enable' : 'Disable'}</button>
              <button class="button danger delete-restaurant" data-id="${item.id}" type="button">Delete</button>
            </footer>
          </article>
        `;
    }).join('');

    const docs = Object.fromEntries(orderedDocs.map(item => [item.id, item.data()]));

    $$('.edit-restaurant', root).forEach(button => {
        button.addEventListener('click', () => {
          const id = button.dataset.id;
          modal.open({
            title: 'Edit restaurant',
            body: restaurantForm(docs[id], id),
            footer: '<button class="button ghost" data-modal-close type="button">Cancel</button><button class="button primary" id="saveRestaurantBtn" type="button">Save</button>',
            onMount: panel => {
              panel.querySelector('#saveRestaurantBtn').addEventListener('click', async () => {
                const form = panel.querySelector('#restaurantForm');
                const saveBtn = panel.querySelector('#saveRestaurantBtn');
                if (!form.reportValidity()) return;
                setButtonLoading(saveBtn, true, 'Saving...');
                try {
                  await saveRestaurant(form);
                  modal.close();
                } catch {
                  toast.error('Could not update restaurant');
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
            body: `<div class="preview-block">${data.photos?.[0] ? `<img class="modal-preview-image" src="${escapeHtml(data.photos[0])}" alt="${escapeHtml(data.name)}">` : ''}<p>${escapeHtml(data.category)}</p><p><a href="${escapeHtml(data.menuUrl)}" target="_blank" rel="noreferrer">Menu ↗</a></p><p><a href="${escapeHtml(data.mapsUrl || '#')}" target="_blank" rel="noreferrer">Google Maps ↗</a></p></div>`,
            size: 'modal-wide'
          });
        });
    });

    $$('.toggle-restaurant', root).forEach(button => {
        button.addEventListener('click', async () => {
          const enabled = button.dataset.enabled !== 'true';
          try {
            await updateDoc(doc(db, 'restaurants', button.dataset.id), { enabled, updatedAt: serverTimestamp() });
            toast.success(enabled ? 'Restaurant enabled' : 'Restaurant disabled');
          } catch {
            toast.error('Could not update status');
          }
        });
    });

    $$('.delete-restaurant', root).forEach(button => {
        button.addEventListener('click', async () => {
          const confirmed = await modal.confirm({ title: 'Delete restaurant', body: 'This cannot be undone.', danger: true, confirmLabel: 'Delete' });
          if (!confirmed) return;
          try {
            await deleteDoc(doc(db, 'restaurants', button.dataset.id));
            toast.success('Restaurant deleted');
          } catch {
            toast.error('Could not delete restaurant');
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
