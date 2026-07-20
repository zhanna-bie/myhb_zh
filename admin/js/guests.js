import { collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { DEFAULT_GUESTS } from '../../js/defaults.js';
import { $, $$, cleanObject, escapeHtml, firebaseErrorMessage, formToObject, formatDateTime, mountView, setButtonLoading } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyGuests() { unsubscribers.splice(0).forEach(unsub => unsub()); }

/** @param {Record<string, unknown>} [data] @param {string} [id] */
function guestForm(data = {}, id = '') {
  return `
    <form class="entity-form" id="guestForm">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <label>Ім'я (як показувати в списку "Хто ти?")<input name="name" required placeholder="Аня" value="${escapeHtml(String(data.name || ''))}"></label>
      <label>Нік (можеш встановити/скинути вручну)<input name="nickname" placeholder="ще не обраний" value="${escapeHtml(String(data.nickname || ''))}"></label>
      <p class="form-hint">Залиш нік порожнім, щоб гість зміг обрати свій власний при наступному вході. Не для нових гостей: якщо додаєш нового — просто вкажи ім'я, нік хай лишається порожнім.</p>
    </form>
  `;
}

async function saveGuest(form) {
  const raw = formToObject(form);
  const payload = cleanObject({ name: raw.name.trim(), nickname: (raw.nickname || '').trim() });
  if (raw.id) {
    // updateDoc (not setDoc) so firebaseUid/updatedAt on an existing binding
    // survive an admin edit that only touches name/nickname.
    await updateDoc(doc(db, 'guests', raw.id), { ...payload, updatedAt: serverTimestamp() });
    toast.success('Гостя оновлено');
  } else {
    const id = raw.name.trim().toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/gi, '-').replace(/^-+|-+$/g, '') || `guest-${Date.now()}`;
    await setDoc(doc(db, 'guests', id), { ...payload, nickname: payload.nickname || '', createdAt: serverTimestamp() });
    toast.success('Гостя додано');
  }
}

export function renderGuests() {
  mountView(`
    <section class="view view-guests">
      <header class="view-header">
        <div><p class="eyebrow">ІДЕНТИФІКАЦІЯ</p><h1>Гості</h1><p class="muted">Список імен для "Хто ти?" на сайті. Нік обирає сам гість — тут видно, хто яким ніком назвався.</p></div>
        <div><button class="button ghost" id="seedGuestsBtn" type="button">Імпортувати стандартний список</button>
        <button class="button primary" id="addGuestBtn" type="button">+ Додати гостя</button></div>
      </header>
      <div class="table-wrap"><table class="admin-table" id="guestsTable"><thead><tr><th>Ім'я</th><th>Нік</th><th>Прив'язано</th><th></th></tr></thead><tbody><tr><td colspan="4">Завантаження…</td></tr></tbody></table></div>
    </section>
  `);

  $('#seedGuestsBtn').addEventListener('click', async () => {
    const confirmed = await modal.confirm({ title: 'Імпорт гостей', body: `Додати стандартний список із ${DEFAULT_GUESTS.length} імен? Гості, що вже обрали свій нік, не постраждають — оновиться лише той, у кого ще немає запису.`, confirmLabel: 'Імпортувати' });
    if (!confirmed) return;
    try {
      const existing = await getDocs(collection(db, 'guests'));
      const existingIds = new Set(existing.docs.map(item => item.id));
      const batch = writeBatch(db);
      DEFAULT_GUESTS.forEach(guest => {
        // nickname: '' only for brand-new docs — omitting it on an existing doc
        // (merge:true) means a nickname she's already claimed is never touched.
        const fields = existingIds.has(guest.id) ? { name: guest.name } : { name: guest.name, nickname: '' };
        batch.set(doc(db, 'guests', guest.id), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      toast.success('Список гостей імпортовано');
    } catch (error) {
      toast.error(firebaseErrorMessage(error));
    }
  });

  $('#addGuestBtn').addEventListener('click', () => {
    modal.open({
      title: 'Новий гість',
      body: guestForm(),
      footer: '<button class="button ghost" data-modal-close type="button">Скасувати</button><button class="button primary" id="saveGuestBtn" type="button">Зберегти</button>',
      onMount: panel => {
        panel.querySelector('#saveGuestBtn').addEventListener('click', async () => {
          const form = panel.querySelector('#guestForm');
          const button = panel.querySelector('#saveGuestBtn');
          if (!form.reportValidity()) return;
          setButtonLoading(button, true, 'Зберігаю...');
          try {
            await saveGuest(form);
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

  track(onSnapshot(collection(db, 'guests'), snapshot => {
    const tbody = $('#guestsTable tbody');
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="4">У базі поки порожньо — натисни «Імпортувати стандартний список».</td></tr>';
      return;
    }
    const docs = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    tbody.innerHTML = docs.map(guest => `
      <tr>
        <td><b>${escapeHtml(guest.name)}</b></td>
        <td>${guest.nickname ? escapeHtml(guest.nickname) : '<span class="muted">— ще не обрала —</span>'}</td>
        <td class="muted">${guest.firebaseUid ? formatDateTime(guest.updatedAt) : '—'}</td>
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
        const confirmed = await modal.confirm({ title: 'Видалити гостя', body: 'Гість зникне зі списку "Хто ти?" на сайті. Видалити?', danger: true, confirmLabel: 'Видалити' });
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
