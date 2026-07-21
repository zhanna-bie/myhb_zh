import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase-admin.js';
import { $, $$, cleanObject, escapeHtml, firebaseErrorMessage, formToObject, formatDateTime, mountView, setButtonLoading } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyGuests() { unsubscribers.splice(0).forEach(unsub => unsub()); }

/** @param {Record<string, unknown>} data @param {string} id */
function guestForm(data, id) {
  return `
    <form class="entity-form" id="guestForm">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <label>Ім'я<input name="name" required placeholder="Аня" value="${escapeHtml(String(data.name || ''))}"></label>
      <label>Нік<input name="nickname" placeholder="ще не обраний" value="${escapeHtml(String(data.nickname || ''))}"></label>
      <p class="form-hint">Гості реєструються самі на сайті — це поле лише для виправлення помилки чи модерації.</p>
    </form>
  `;
}

async function saveGuest(form) {
  const raw = formToObject(form);
  const payload = cleanObject({ name: raw.name.trim(), nickname: (raw.nickname || '').trim() });
  // updateDoc (not setDoc) so firebaseUid/createdAt on the existing binding
  // survive an admin edit that only touches name/nickname.
  await updateDoc(doc(db, 'guests', raw.id), { ...payload, updatedAt: serverTimestamp() });
  toast.success('Гостя оновлено');
}

export function renderGuests() {
  mountView(`
    <section class="view view-guests">
      <header class="view-header">
        <div><p class="eyebrow">ІДЕНТИФІКАЦІЯ</p><h1>Гості</h1><p class="muted">Гості реєструються самі на сайті (ім'я + нік) — тут просто список, хто вже зайшов. Нічого додавати вручну не треба.</p></div>
      </header>
      <div class="table-wrap"><table class="admin-table" id="guestsTable"><thead><tr><th>Ім'я</th><th>Нік</th><th>Оновлено</th><th></th></tr></thead><tbody><tr><td colspan="4">Завантаження…</td></tr></tbody></table></div>
    </section>
  `);

  track(onSnapshot(collection(db, 'guests'), snapshot => {
    const tbody = $('#guestsTable tbody');
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="4">Поки що ніхто не зареєструвався — список з\'явиться сам, щойно перший гість введе ім\'я на сайті.</td></tr>';
      return;
    }
    const docs = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    tbody.innerHTML = docs.map(guest => `
      <tr>
        <td><b>${escapeHtml(guest.name)}</b></td>
        <td>${guest.nickname ? escapeHtml(guest.nickname) : '<span class="muted">— ще не обрала —</span>'}</td>
        <td class="muted">${formatDateTime(guest.updatedAt || guest.createdAt)}</td>
        <td class="table-actions">
          <button class="button ghost edit-guest" data-id="${guest.id}" type="button">Редагувати</button>
          <button class="button ghost reset-guest" data-id="${guest.id}" ${guest.nickname ? '' : 'disabled'} type="button">Скинути нік</button>
          <button class="button danger delete-guest" data-id="${guest.id}" type="button">Видалити</button>
        </td>
      </tr>
    `).join('');

    const map = Object.fromEntries(docs.map(item => [item.id, item]));

    $$('.edit-guest', tbody).forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        modal.open({
          title: 'Редагувати гостя',
          body: guestForm(map[id], id),
          footer: '<button class="button ghost" data-modal-close type="button">Скасувати</button><button class="button primary" id="saveGuestBtn" type="button">Зберегти</button>',
          onMount: panel => {
            panel.querySelector('#saveGuestBtn').addEventListener('click', async () => {
              const form = panel.querySelector('#guestForm');
              const saveBtn = panel.querySelector('#saveGuestBtn');
              if (!form.reportValidity()) return;
              setButtonLoading(saveBtn, true, 'Зберігаю...');
              try {
                await saveGuest(form);
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

    $$('.reset-guest', tbody).forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await modal.confirm({ title: 'Скинути нік', body: `${escapeHtml(map[button.dataset.id].name)} зможе обрати новий нік при наступному вході. Продовжити?`, confirmLabel: 'Скинути' });
        if (!confirmed) return;
        try {
          await updateDoc(doc(db, 'guests', button.dataset.id), { nickname: '', firebaseUid: '', updatedAt: serverTimestamp() });
          toast.success('Нік скинуто');
        } catch (error) {
          toast.error(firebaseErrorMessage(error));
        }
      });
    });

    $$('.delete-guest', tbody).forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await modal.confirm({ title: 'Видалити гостя', body: 'Гість зникне зі списку на сайті. Видалити?', danger: true, confirmLabel: 'Видалити' });
        if (!confirmed) return;
        try {
          await deleteDoc(doc(db, 'guests', button.dataset.id));
          toast.success('Гостя видалено');
        } catch (error) {
          toast.error(firebaseErrorMessage(error));
        }
      });
    });
  }, () => toast.error('Guests listener failed')));
}
