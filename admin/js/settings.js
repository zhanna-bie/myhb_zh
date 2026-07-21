import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, firebaseConfig } from '../../js/firebase-admin.js';
import { DEFAULT_CHECKLIST, DEFAULT_SETTINGS, DEFAULT_SWIM_CHECKLIST } from '../../js/defaults.js';
import { $, $$, escapeHtml, mountView, setButtonLoading } from './helpers.js';
import { toast } from './toast.js';

const SETTINGS_ID = 'main';
const CHECKLIST_ID = 'items';
const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroySettings() { unsubscribers.splice(0).forEach(unsub => unsub()); }

const DEFAULTS = DEFAULT_SETTINGS;
const DEFAULT_SWIM = DEFAULT_SWIM_CHECKLIST;

export function renderSettings() {
  mountView(`
    <section class="view view-settings">
      <header class="view-header">
        <div><p class="eyebrow">CONFIGURATION</p><h1>Settings</h1><p class="muted">Site-wide configuration stored in Firestore.</p></div>
      </header>
      <div class="settings-grid">
        <section class="panel">
          <div class="panel-head"><h2>General</h2></div>
          <form class="entity-form" id="settingsForm">
            <label>Birthday date<input name="birthdayDate" type="datetime-local" required></label>
            <label>Memories mode date<input name="memoriesModeDate" type="datetime-local" required></label>
            <label>Weather latitude<input name="weatherLat" required></label>
            <label>Weather longitude<input name="weatherLon" required></label>
            <label>Gallery page size<input name="galleryPageSize" type="number" min="10" max="50" required></label>
            <button class="button primary" type="submit">Save settings</button>
          </form>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Cloudinary</h2></div>
          <form class="entity-form" id="cloudinaryForm">
            <label>Cloud name<input name="cloudinaryCloudName" required></label>
            <label>Unsigned upload preset<input name="cloudinaryUploadPreset" required></label>
            <p class="muted">Never store Cloudinary secret here. Unsigned preset only.</p>
            <button class="button primary" type="submit">Save Cloudinary</button>
          </form>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Firebase (read-only)</h2></div>
          <div class="config-readonly">
            <p><span>Project</span><code>${escapeHtml(firebaseConfig.projectId)}</code></p>
            <p><span>Auth domain</span><code>${escapeHtml(firebaseConfig.authDomain)}</code></p>
            <p><span>App ID</span><code>${escapeHtml(firebaseConfig.appId)}</code></p>
          </div>
        </section>
        <section class="panel panel-wide">
          <div class="panel-head"><h2>Чек-лист</h2></div>
          <form class="entity-form" id="checklistForm">
            <p class="muted">Основний список («Не забудь взяти»):</p>
            <div class="checklist-editor" id="checklistEditor"></div>
            <button class="button ghost" id="addChecklistItem" type="button">+ Пункт в основний список</button>
            <p class="muted">Блок «Можливо, буде купання» (окремо, нижче основного):</p>
            <div class="checklist-editor" id="swimEditor"></div>
            <button class="button ghost" id="addSwimItem" type="button">+ Пункт у купальний</button>
            <button class="button primary" type="submit">Зберегти чек-лист</button>
          </form>
        </section>
      </div>
    </section>
  `);

  const toLocalInput = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
  };

  track(onSnapshot(doc(db, 'settings', SETTINGS_ID), snapshot => {
    const data = { ...DEFAULTS, ...snapshot.data() };
    const form = $('#settingsForm');
    form.querySelector('[name="birthdayDate"]').value = toLocalInput(data.birthdayDate);
    form.querySelector('[name="memoriesModeDate"]').value = toLocalInput(data.memoriesModeDate);
    form.querySelector('[name="weatherLat"]').value = data.weatherLat;
    form.querySelector('[name="weatherLon"]').value = data.weatherLon;
    form.querySelector('[name="galleryPageSize"]').value = data.galleryPageSize;
    const cloudForm = $('#cloudinaryForm');
    cloudForm.querySelector('[name="cloudinaryCloudName"]').value = data.cloudinaryCloudName;
    cloudForm.querySelector('[name="cloudinaryUploadPreset"]').value = data.cloudinaryUploadPreset;
  }, () => {}));

  // Two independent editors backed by one Firestore doc: `items` (essentials)
  // and `swimming` (the "maybe swimming" block shown separately on the site).
  const editors = {
    item: { root: '#checklistEditor', fallback: DEFAULT_CHECKLIST },
    swim: { root: '#swimEditor', fallback: DEFAULT_SWIM }
  };

  function readEditor(prefix) {
    return [...$('#checklistForm').querySelectorAll(`[name^="${prefix}-"]`)].map(input => input.value);
  }

  function renderEditor(prefix, items) {
    const root = $(editors[prefix].root);
    root.innerHTML = items.map((item, index) => `
      <div class="checklist-row">
        <input name="${prefix}-${index}" value="${escapeHtml(item)}" required>
        <button class="button danger remove-${prefix}" data-index="${index}" type="button" aria-label="Прибрати">×</button>
      </div>
    `).join('') || '<p class="muted">Порожньо — блок не показуватиметься на сайті.</p>';
    $$(`.remove-${prefix}`, root).forEach(button => {
      button.addEventListener('click', () => {
        const next = readEditor(prefix);
        next.splice(Number(button.dataset.index), 1);
        renderEditor(prefix, next);
      });
    });
  }

  track(onSnapshot(doc(db, 'checklist', CHECKLIST_ID), snapshot => {
    const data = snapshot.exists() ? snapshot.data() : {};
    renderEditor('item', Array.isArray(data.items) && data.items.length ? data.items : DEFAULT_CHECKLIST);
    renderEditor('swim', Array.isArray(data.swimming) ? data.swimming : DEFAULT_SWIM);
  }, () => {}));

  $('#addChecklistItem').addEventListener('click', () => renderEditor('item', [...readEditor('item'), '✨ Новий пункт']));
  $('#addSwimItem').addEventListener('click', () => renderEditor('swim', [...readEditor('swim'), '✨ Новий пункт']));

  $('#settingsForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true, 'Saving...');
    const form = event.currentTarget;
    try {
      await setDoc(doc(db, 'settings', SETTINGS_ID), {
        birthdayDate: new Date(form.birthdayDate.value).toISOString(),
        memoriesModeDate: new Date(form.memoriesModeDate.value).toISOString(),
        weatherLat: form.weatherLat.value.trim(),
        weatherLon: form.weatherLon.value.trim(),
        galleryPageSize: form.galleryPageSize.value,
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success('Settings saved');
    } catch {
      toast.error('Could not save settings');
    } finally {
      setButtonLoading(button, false);
    }
  });

  $('#cloudinaryForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true, 'Saving...');
    const form = event.currentTarget;
    try {
      await setDoc(doc(db, 'settings', SETTINGS_ID), {
        cloudinaryCloudName: form.cloudinaryCloudName.value.trim(),
        cloudinaryUploadPreset: form.cloudinaryUploadPreset.value.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success('Cloudinary config saved');
    } catch {
      toast.error('Could not save Cloudinary config');
    } finally {
      setButtonLoading(button, false);
    }
  });

  $('#checklistForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true, 'Зберігаю...');
    const items = readEditor('item').map(value => value.trim()).filter(Boolean);
    const swimming = readEditor('swim').map(value => value.trim()).filter(Boolean);
    try {
      await setDoc(doc(db, 'checklist', CHECKLIST_ID), { items, swimming, updatedAt: serverTimestamp() });
      toast.success('Чек-лист збережено');
    } catch {
      toast.error('Не вдалося зберегти чек-лист');
    } finally {
      setButtonLoading(button, false);
    }
  });
}

export function renderGuests() {
  mountView(`
    <section class="view view-guests">
      <header class="view-header">
        <div><p class="eyebrow">INVITATIONS</p><h1>Guests</h1><p class="muted">Guests inferred from vote and gallery activity.</p></div>
      </header>
      <div class="table-wrap"><table class="admin-table" id="guestsTable"><thead><tr><th>Guest ID</th><th>Voted</th><th>Photos</th></tr></thead><tbody><tr><td colspan="3">Loading…</td></tr></tbody></table></div>
    </section>
  `);

  const guests = new Map();

  track(onSnapshot(collection(db, 'votes'), snapshot => {
    snapshot.docs.forEach(item => {
      const id = item.data().invitationId || item.id;
      const guest = guests.get(id) || { id, votes: 0, photos: 0 };
      guest.votes += 1;
      guests.set(id, guest);
    });
    paintGuests();
  }));

  track(onSnapshot(collection(db, 'gallery'), snapshot => {
    snapshot.docs.forEach(item => {
      const id = item.data().uploadedBy;
      if (!id) return;
      const guest = guests.get(id) || { id, votes: 0, photos: 0 };
      guest.photos += 1;
      guests.set(id, guest);
    });
    paintGuests();
  }));

  function paintGuests() {
    const rows = [...guests.values()].sort((a, b) => (b.votes + b.photos) - (a.votes + a.photos));
    $('#guestsTable tbody').innerHTML = rows.length ? rows.map(guest => `
      <tr><td>${escapeHtml(guest.id)}</td><td>${guest.votes}</td><td>${guest.photos}</td></tr>
    `).join('') : '<tr><td colspan="3">No guest activity yet.</td></tr>';
  }
}
