import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { $, $$, cleanObject, escapeHtml, formToObject, formatDateTime, mountView, setButtonLoading } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyWishlist() { unsubscribers.splice(0).forEach(unsub => unsub()); }

/** @param {Record<string, unknown>} [data] @param {string} [id] */
function wishlistForm(data = {}, id = '') {
  return `
    <form class="entity-form" id="wishlistForm">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <label>Gift<input name="gift" required value="${escapeHtml(String(data.gift || data.title || ''))}"></label>
      <label>Store<input name="store" value="${escapeHtml(String(data.store || ''))}"></label>
      <label>Image URL<input name="image" type="url" value="${escapeHtml(String(data.image || data.imageUrl || ''))}"></label>
      <label>Price<input name="price" value="${escapeHtml(String(data.price || ''))}"></label>
      <label class="checkbox"><input name="enabled" type="checkbox" ${data.enabled !== false ? 'checked' : ''}> Enabled</label>
    </form>
  `;
}

async function saveWishlist(form) {
  const raw = formToObject(form);
  const payload = cleanObject({
    gift: raw.gift,
    title: raw.gift,
    store: raw.store || '',
    image: raw.image || '',
    imageUrl: raw.image || '',
    price: raw.price || '',
    enabled: raw.enabled === 'on',
    reserved: false,
    reservedBy: '',
    reservedAt: null
  });
  if (raw.id) {
    await updateDoc(doc(db, 'wishlist', raw.id), { ...payload, updatedAt: serverTimestamp() });
    toast.success('Wishlist item updated');
  } else {
    await addDoc(collection(db, 'wishlist'), { ...payload, createdAt: serverTimestamp() });
    toast.success('Wishlist item added');
  }
}

export function renderWishlist() {
  mountView(`
    <section class="view view-wishlist">
      <header class="view-header">
        <div><p class="eyebrow">WISHLIST</p><h1>Wishlist</h1><p class="muted">Manage gifts and reservation status.</p></div>
        <button class="button primary" id="addWishlistBtn" type="button">+ Add gift</button>
      </header>
      <div class="entity-grid" id="wishlistGrid"><div class="skeleton-card"></div></div>
    </section>
  `);

  $('#addWishlistBtn').addEventListener('click', () => {
    modal.open({
      title: 'Add gift',
      body: wishlistForm(),
      footer: '<button class="button ghost" data-modal-close type="button">Cancel</button><button class="button primary" id="saveWishlistBtn" type="button">Save</button>',
      onMount: panel => {
        panel.querySelector('#saveWishlistBtn').addEventListener('click', async () => {
          const form = panel.querySelector('#wishlistForm');
          const button = panel.querySelector('#saveWishlistBtn');
          if (!form.reportValidity()) return;
          setButtonLoading(button, true, 'Saving...');
          try {
            await saveWishlist(form);
            modal.close();
          } catch {
            toast.error('Could not save gift');
          } finally {
            setButtonLoading(button, false);
          }
        });
      }
    });
  });

  track(onSnapshot(collection(db, 'wishlist'), snapshot => {
    const root = $('#wishlistGrid');
    if (snapshot.empty) {
      root.innerHTML = '<div class="empty-state">Wishlist is empty.</div>';
      return;
    }
    const docs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    root.innerHTML = docs.map(item => `
      <article class="entity-card wish-card ${item.enabled === false ? 'is-disabled' : ''} ${item.reserved ? 'is-reserved' : ''}">
        ${item.image || item.imageUrl ? `<img class="wish-image" src="${escapeHtml(item.image || item.imageUrl)}" alt="${escapeHtml(item.gift || item.title)}" loading="lazy">` : ''}
        <div class="entity-card-body">
          <span class="badge">${item.reserved ? 'Reserved' : item.enabled === false ? 'Disabled' : 'Available'}</span>
          <h3>${escapeHtml(item.gift || item.title)}</h3>
          <p>${escapeHtml(item.store || '—')}</p>
          <strong>${escapeHtml(item.price || '—')}</strong>
          ${item.reserved ? `<small>By ${escapeHtml(item.reservedBy || 'Guest')} · ${formatDateTime(item.reservedAt)}</small>` : ''}
        </div>
        <footer class="entity-card-actions">
          <button class="button ghost edit-wish" data-id="${item.id}" type="button">Edit</button>
          <button class="button ghost toggle-wish" data-id="${item.id}" data-enabled="${item.enabled !== false}" type="button">${item.enabled === false ? 'Enable' : 'Disable'}</button>
          ${item.reserved ? `<button class="button ghost clear-reserve" data-id="${item.id}" type="button">Clear reservation</button>` : ''}
          <button class="button danger delete-wish" data-id="${item.id}" type="button">Delete</button>
        </footer>
      </article>
    `).join('');

    const map = Object.fromEntries(docs.map(item => [item.id, item]));

    $$('.edit-wish', root).forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        modal.open({
          title: 'Edit gift',
          body: wishlistForm(map[id], id),
          footer: '<button class="button ghost" data-modal-close type="button">Cancel</button><button class="button primary" id="saveWishlistBtn" type="button">Save</button>',
          onMount: panel => {
            panel.querySelector('#saveWishlistBtn').addEventListener('click', async () => {
              const form = panel.querySelector('#wishlistForm');
              const saveBtn = panel.querySelector('#saveWishlistBtn');
              if (!form.reportValidity()) return;
              setButtonLoading(saveBtn, true, 'Saving...');
              try {
                await saveWishlist(form);
                modal.close();
              } catch {
                toast.error('Could not update gift');
              } finally {
                setButtonLoading(saveBtn, false);
              }
            });
          }
        });
      });
    });

    $$('.toggle-wish', root).forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await updateDoc(doc(db, 'wishlist', button.dataset.id), { enabled: button.dataset.enabled !== 'true', updatedAt: serverTimestamp() });
          toast.success('Gift status updated');
        } catch {
          toast.error('Could not update gift');
        }
      });
    });

    $$('.clear-reserve', root).forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await updateDoc(doc(db, 'wishlist', button.dataset.id), { reserved: false, reservedBy: '', reservedAt: null, updatedAt: serverTimestamp() });
          toast.success('Reservation cleared');
        } catch {
          toast.error('Could not clear reservation');
        }
      });
    });

    $$('.delete-wish', root).forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await modal.confirm({ title: 'Delete gift', body: 'Remove this wishlist item?', danger: true, confirmLabel: 'Delete' });
        if (!confirmed) return;
        try {
          await deleteDoc(doc(db, 'wishlist', button.dataset.id));
          toast.success('Gift deleted');
        } catch {
          toast.error('Could not delete gift');
        }
      });
    });
  }, () => toast.error('Wishlist listener failed')));
}
