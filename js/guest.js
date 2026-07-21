// Passwordless guest identity: type your own name + nickname on first visit
// (self-service — no admin setup needed), then get recognized by that
// nickname on return visits (localStorage). A handful of guests already
// exist as real Firestore docs from before this was self-service; typing a
// name that matches one of them is treated as "this is the same person"
// (confirm their nickname) rather than creating a duplicate.
// See admin/js/guests.js for the read-only admin roster and firestore.rules
// `guests` for the write constraints (server-enforced, not just client-side
// — see comments there).
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db, ensureGuestSession } from './firebase.js';
import { $ } from './utils.js';

const STORAGE_KEY = 'partyGuest';

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'guest';
}

// Short random suffix so two different people who happen to share a first
// name never collide on the same document id.
function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function readStoredGuest() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw?.guestId && raw?.name && raw?.nickname) return raw;
  } catch { /* ignore malformed storage */ }
  return null;
}

function writeStoredGuest(guest) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Anonymous sign-in can transiently fail on a cold page load (slow network,
 * IndexedDB/session setup racing the first request) — retry a couple of
 * times instead of silently leaving auth.currentUser null, which used to let
 * guests fill out the whole "Хто ти?" form only to hit a confusing error on
 * the very last save.
 */
async function ensureAuthReady() {
  for (const delay of [0, 600, 1500]) {
    if (delay) await wait(delay);
    try {
      const user = await ensureGuestSession();
      if (user) return true;
    } catch { /* try again */ }
  }
  return false;
}

/**
 * `#guestGate` is a native <dialog>; showModal() makes the *entire rest of
 * the page inert* (not just visually covered — unclickable, including the
 * ENTER splash underneath it). ensureGuestIdentity() used to open it the
 * instant app.js loaded, before anyone had a chance to click ENTER — which
 * silently blocked every first-time visitor from ever entering the site.
 * Wait for the real ENTER click (or for the splash to already be dismissed)
 * before the gate is allowed to show itself.
 */
function waitForEntry() {
  const gate = document.getElementById('gate');
  if (!gate || gate.hidden || gate.classList.contains('out')) return Promise.resolve();
  return new Promise(resolve => {
    document.getElementById('enterBtn')?.addEventListener('click', () => resolve(), { once: true });
  });
}

/** Resolves once a guest is identified — first from localStorage, otherwise via the gate dialog. */
export async function ensureGuestIdentity() {
  const stored = readStoredGuest();
  if (stored) {
    // Needed for later writes (votes, likes, uploads) but nothing here is
    // UI-blocking, so let it settle in the background — don't make a
    // returning guest wait on it.
    ensureAuthReady();
    showNotMeLink();
    return stored;
  }
  const [authReady] = await Promise.all([ensureAuthReady(), waitForEntry()]);
  if (!authReady) {
    const error = $('#guestGateError');
    if (error) error.textContent = 'Не вдалося підключитись. Перевір інтернет і онови сторінку.';
    $('#guestGate')?.showModal();
    throw new Error('auth-unavailable');
  }
  const guest = await openGate();
  writeStoredGuest(guest);
  showNotMeLink();
  return guest;
}

function showNotMeLink() {
  const link = $('#notMeLink');
  if (!link || link.dataset.bound) { if (link) link.hidden = false; return; }
  link.dataset.bound = '1';
  link.hidden = false;
  link.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
}

function openGate() {
  return new Promise(resolve => {
    const dialog = $('#guestGate');
    const form = $('#guestIdentityForm');
    const nameInput = $('#guestNameInput');
    const nickInput = $('#guestNicknameInput');
    const submitBtn = $('#guestIdentitySubmit');
    const error = $('#guestGateError');
    const setError = message => { error.textContent = message || ''; };

    dialog.showModal();
    nameInput.focus();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      setError('');
      const name = nameInput.value.trim();
      const nickname = nickInput.value.trim();
      if (!name || !nickname) return;
      submitBtn.disabled = true;
      try {
        // Last-resort safety net: if auth somehow still isn't ready here
        // (shouldn't happen after ensureAuthReady(), but a raw
        // "Cannot read properties of null" is a terrible error to show),
        // try once more before giving up.
        if (!auth.currentUser) await ensureGuestSession().catch(() => {});
        if (!auth.currentUser) { setError('Немає з’єднання з сервером. Перевір інтернет і спробуй ще раз.'); return; }

        // Small guest list (a birthday party, not a public sign-up) — fetching
        // everyone and matching client-side is simpler and cheap enough,
        // and avoids needing a normalized-name index for case-insensitive search.
        const snapshot = await getDocs(collection(db, 'guests'));
        const existing = snapshot.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .find(guest => guest.name?.trim().toLowerCase() === name.toLowerCase());

        if (existing) {
          if (existing.nickname && existing.nickname.toLowerCase() !== nickname.toLowerCase()) {
            setError(`Гостя з іменем «${existing.name}» вже зареєстровано з іншим ніком. Введи той самий нік або трохи зміни ім'я (наприклад, додай прізвище).`);
            return;
          }
          await updateDoc(doc(db, 'guests', existing.id), {
            nickname: existing.nickname || nickname,
            firebaseUid: auth.currentUser.uid,
            updatedAt: serverTimestamp()
          });
          dialog.close();
          resolve({ guestId: existing.id, name: existing.name, nickname: existing.nickname || nickname });
        } else {
          const guestId = `${slugify(name)}-${randomSuffix()}`;
          await setDoc(doc(db, 'guests', guestId), {
            name,
            nickname,
            firebaseUid: auth.currentUser.uid,
            createdAt: serverTimestamp()
          });
          dialog.close();
          resolve({ guestId, name, nickname });
        }
      } catch (err) {
        setError(err?.code === 'permission-denied'
          ? 'Не вдалося зберегти — спробуй ще раз за кілька секунд.'
          : 'Не вдалося зберегти. Перевір інтернет і спробуй ще раз.');
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
}
