import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { $, $$, cleanObject, escapeHtml, formToObject, mountView, setButtonLoading } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyRoutes() { unsubscribers.splice(0).forEach(unsub => unsub()); }

/** @param {Record<string, unknown>} [data] @param {string} [id] */
function routeForm(data = {}, id = '') {
  return `
    <form class="entity-form" id="routeForm">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <label>City<input name="city" required value="${escapeHtml(String(data.city || 'Київ'))}"></label>
      <label>Direction<input name="direction" required value="${escapeHtml(String(data.direction || 'ТУДИ'))}"></label>
      <label>From<input name="from" required value="${escapeHtml(String(data.from || ''))}"></label>
      <label>To<input name="to" required value="${escapeHtml(String(data.to || ''))}"></label>
      <label>Date<input name="date" required value="${escapeHtml(String(data.date || ''))}"></label>
      <label>Train<input name="trainNumber" required value="${escapeHtml(String(data.trainNumber || ''))}"></label>
      <label>Departure<input name="departure" required value="${escapeHtml(String(data.departure || ''))}"></label>
      <label>Arrival<input name="arrival" required value="${escapeHtml(String(data.arrival || ''))}"></label>
      <label>Duration<input name="duration" required value="${escapeHtml(String(data.duration || ''))}"></label>
      <label>Transfers<input name="transfers" required value="${escapeHtml(String(data.transfers || 'Прямий'))}"></label>
      <label>Price<input name="price" value="${escapeHtml(String(data.price || ''))}"></label>
      <label>Booking URL<input name="bookingUrl" type="url" value="${escapeHtml(String(data.bookingUrl || 'https://booking.uz.gov.ua/'))}"></label>
      <label class="checkbox"><input name="recommended" type="checkbox" ${data.recommended ? 'checked' : ''}> Recommended</label>
    </form>
  `;
}

async function saveRoute(form) {
  const raw = formToObject(form);
  const payload = cleanObject({
    city: raw.city,
    direction: raw.direction,
    from: raw.from,
    to: raw.to,
    date: raw.date,
    trainNumber: raw.trainNumber,
    departure: raw.departure,
    arrival: raw.arrival,
    duration: raw.duration,
    transfers: raw.transfers,
    price: raw.price || '',
    bookingUrl: raw.bookingUrl || 'https://booking.uz.gov.ua/',
    recommended: raw.recommended === 'on',
    order: Number(raw.order || Date.now())
  });
  if (raw.id) {
    await updateDoc(doc(db, 'transport', raw.id), { ...payload, updatedAt: serverTimestamp() });
    toast.success('Route updated');
  } else {
    await addDoc(collection(db, 'transport'), { ...payload, createdAt: serverTimestamp() });
    toast.success('Route added');
  }
}

async function reorderRoutes(id, direction, routes) {
  const sorted = [...routes].sort((a, b) => (a.order || 0) - (b.order || 0));
  const index = sorted.findIndex(item => item.id === id);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= sorted.length) return;
  const batch = writeBatch(db);
  const current = sorted[index];
  const target = sorted[swapIndex];
  batch.update(doc(db, 'transport', current.id), { order: target.order || swapIndex });
  batch.update(doc(db, 'transport', target.id), { order: current.order || index });
  await batch.commit();
  toast.success('Route order updated');
}

export function renderRoutes() {
  mountView(`
    <section class="view view-routes">
      <header class="view-header">
        <div><p class="eyebrow">TRAVEL LOG</p><h1>Routes</h1><p class="muted">Manage train routes and recommended order.</p></div>
        <button class="button primary" id="addRouteBtn" type="button">+ Add route</button>
      </header>
      <div class="entity-list" id="routesList"><div class="skeleton-card"></div></div>
    </section>
  `);

  $('#addRouteBtn').addEventListener('click', () => {
    modal.open({
      title: 'Add route',
      body: routeForm(),
      footer: '<button class="button ghost" data-modal-close type="button">Cancel</button><button class="button primary" id="saveRouteBtn" type="button">Save</button>',
      onMount: panel => {
        panel.querySelector('#saveRouteBtn').addEventListener('click', async () => {
          const form = panel.querySelector('#routeForm');
          const button = panel.querySelector('#saveRouteBtn');
          if (!form.reportValidity()) return;
          setButtonLoading(button, true, 'Saving...');
          try {
            await saveRoute(form);
            modal.close();
          } catch {
            toast.error('Could not save route');
          } finally {
            setButtonLoading(button, false);
          }
        });
      }
    });
  });

  track(onSnapshot(collection(db, 'transport'), snapshot => {
    const routes = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    const root = $('#routesList');
    if (!routes.length) {
      root.innerHTML = '<div class="empty-state">No routes yet.</div>';
      return;
    }
    root.innerHTML = routes.map(route => `
      <article class="route-admin-card ${route.recommended ? 'is-recommended' : ''}">
        <div>
          <span class="badge">${route.recommended ? 'Recommended' : route.direction}</span>
          <h3>${escapeHtml(route.city)} · №${escapeHtml(route.trainNumber)}</h3>
          <p>${escapeHtml(route.from)} → ${escapeHtml(route.to)}</p>
          <small>${escapeHtml(route.date)} · ${escapeHtml(route.departure)} → ${escapeHtml(route.arrival)} · ${escapeHtml(route.duration)} · ${escapeHtml(route.transfers || 'Direct')}</small>
        </div>
        <div class="entity-card-actions">
          <button class="button ghost move-route" data-id="${route.id}" data-dir="up" type="button" aria-label="Move up">↑</button>
          <button class="button ghost move-route" data-id="${route.id}" data-dir="down" type="button" aria-label="Move down">↓</button>
          <button class="button ghost edit-route" data-id="${route.id}" type="button">Edit</button>
          <button class="button danger delete-route" data-id="${route.id}" type="button">Delete</button>
        </div>
      </article>
    `).join('');

    const map = Object.fromEntries(routes.map(item => [item.id, item]));

    $$('.edit-route', root).forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        modal.open({
          title: 'Edit route',
          body: routeForm(map[id], id),
          footer: '<button class="button ghost" data-modal-close type="button">Cancel</button><button class="button primary" id="saveRouteBtn" type="button">Save</button>',
          onMount: panel => {
            panel.querySelector('#saveRouteBtn').addEventListener('click', async () => {
              const form = panel.querySelector('#routeForm');
              const saveBtn = panel.querySelector('#saveRouteBtn');
              if (!form.reportValidity()) return;
              setButtonLoading(saveBtn, true, 'Saving...');
              try {
                await saveRoute(form);
                modal.close();
              } catch {
                toast.error('Could not update route');
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
        } catch {
          toast.error('Could not reorder routes');
        }
      });
    });

    $$('.delete-route', root).forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await modal.confirm({ title: 'Delete route', body: 'Remove this route permanently?', danger: true, confirmLabel: 'Delete' });
        if (!confirmed) return;
        try {
          await deleteDoc(doc(db, 'transport', button.dataset.id));
          toast.success('Route deleted');
        } catch {
          toast.error('Could not delete route');
        }
      });
    });
  }, () => toast.error('Routes listener failed')));
}
