import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, firebaseConfig } from '../../js/firebase.js';
import { $, $$, escapeHtml, mountView, setButtonLoading } from './helpers.js';
import { toast } from './toast.js';

const SETTINGS_ID = 'main';
const CHECKLIST_ID = 'items';
const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroySettings() { unsubscribers.splice(0).forEach(unsub => unsub()); }

const DEFAULTS = {
  birthdayDate: '2026-08-23T12:00:00+03:00',
  memoriesModeDate: '2026-08-25T00:00:00+03:00',
  weatherLat: '50.34',
  weatherLon: '26.64',
  cloudinaryCloudName: 'mh1qp8ls',
  cloudinaryUploadPreset: 'gallery_upload',
  galleryPageSize: '20'
};

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
          <div class="panel-head"><h2>Checklist</h2><button class="button ghost" id="addChecklistItem" type="button">+ Add item</button></div>
          <form class="entity-form" id="checklistForm">
            <div class="checklist-editor" id="checklistEditor"></div>
            <button class="button primary" type="submit">Save checklist</button>
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

  track(onSnapshot(doc(db, 'checklist', CHECKLIST_ID), snapshot => {
    const items = snapshot.exists() ? snapshot.data().items || [] : [];
    renderChecklistEditor(items.length ? items : ['😊 Гарний настрій', '🎫 Квитки', '🧳 Речі для ночівлі']);
  }, () => {}));

  function renderChecklistEditor(items) {
    $('#checklistEditor').innerHTML = items.map((item, index) => `
      <div class="checklist-row">
        <input name="item-${index}" value="${escapeHtml(item)}" required>
        <button class="button danger remove-check-item" data-index="${index}" type="button" aria-label="Remove">×</button>
      </div>
    `).join('');
    $$('.remove-check-item', $('#checklistEditor')).forEach(button => {
      button.addEventListener('click', () => {
        const next = [...$('#checklistForm').querySelectorAll('[name^="item-"]')].map(input => input.value);
        next.splice(Number(button.dataset.index), 1);
        renderChecklistEditor(next);
      });
    });
  }

  $('#addChecklistItem').addEventListener('click', () => {
    const current = [...$('#checklistForm').querySelectorAll('[name^="item-"]')].map(input => input.value);
    renderChecklistEditor([...current, '✨ New item']);
  });

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
    setButtonLoading(button, true, 'Saving...');
    const items = [...event.currentTarget.querySelectorAll('[name^="item-"]')].map(input => input.value.trim()).filter(Boolean);
    try {
      await setDoc(doc(db, 'checklist', CHECKLIST_ID), { items, updatedAt: serverTimestamp() });
      toast.success('Checklist saved');
    } catch {
      toast.error('Could not save checklist');
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
