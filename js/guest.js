// Passwordless guest identity: type your own name + nickname on first visit
// (self-service — no admin setup needed), then get recognized by that
// nickname on return visits (localStorage). Nickname (not name) is the
// unique identity key: registering again with the same nickname — a new
// device, cleared storage — rebinds to the existing guests/{id} doc instead
// of creating a duplicate, even if the name typed this time differs.
// See admin/js/guests.js for the read-only admin roster and firestore.rules
// `guests` for the write constraints (server-enforced, not just client-side
// — see comments there).
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
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
 *
 * Watches gate state instead of listening for a fresh click: app.js is a
 * module, so on a cold cache (a genuinely new device — no service worker,
 * nothing cached) it and its imports can take a real moment to download.
 * The inline <script> at the bottom of index.html attaches its own ENTER
 * listener synchronously during parsing, long before that — so an impatient
 * click on a slow connection was already handled (splash dismissed) before
 * this function even ran, and a `{once:true}` listener for a *future* click
 * that was never coming left ensureGuestIdentity() hanging forever with the
 * registration form never appearing. Observing the gate's actual class/hidden
 * state instead means it doesn't matter whether the click happened before,
 * during, or after this runs.
 */
function waitForEntry() {
  const gate = document.getElementById('gate');
  if (!gate || gate.hidden || gate.classList.contains('out')) return Promise.resolve();
  return new Promise(resolve => {
    const settled = () => gate.hidden || gate.classList.contains('out');
    const observer = new MutationObserver(() => {
      if (!settled()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(gate, { attributes: true, attributeFilter: ['class', 'hidden'] });
    // Belt-and-suspenders: a plain click listener too, in case some future
    // change dismisses the gate without touching its class/hidden attributes.
    document.getElementById('enterBtn')?.addEventListener('click', () => {
      if (settled()) { observer.disconnect(); resolve(); }
    }, { once: true });
  });
}

/**
 * If the admin deletes a guest from the Guests panel but that guest's
 * device still has the old guestId in localStorage, they'd otherwise keep
 * using the site as a "ghost" tied to a Firestore doc that no longer
 * exists (and whose votes/likes/uploads would start failing rules checks
 * that look the doc up). Runs in the background — reading `guests` is
 * public (no auth needed), so this doesn't make a returning guest wait —
 * and reloads straight into the registration gate if the doc is gone.
 */
async function revalidateStoredGuest(stored) {
  try {
    const snapshot = await getDoc(doc(db, 'guests', stored.guestId));
    if (snapshot.exists()) return;
  } catch {
    return; // network hiccup — don't punish the guest for a flaky connection
  }
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

/** Resolves once a guest is identified — first from localStorage, otherwise via the gate dialog. */
export async function ensureGuestIdentity() {
  const stored = readStoredGuest();
  if (stored) {
    // Needed for later writes (votes, likes, uploads) but nothing here is
    // UI-blocking, so let it settle in the background — don't make a
    // returning guest wait on it.
    ensureAuthReady();
    revalidateStoredGuest(stored);
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
  // `recognized` is only meaningful for this one call (app.js uses it to
  // toast "не ти?" once) — not part of the guest's stored identity.
  const { recognized, ...toStore } = guest;
  writeStoredGuest(toStore);
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
        // and avoids needing a normalized-nickname index for case-insensitive
        // search. Nickname is the identity key (not name): the same person
        // registering from a new device with a different typed name still
        // lands on their existing doc as long as the nickname matches.
        const snapshot = await getDocs(collection(db, 'guests'));
        const existing = snapshot.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .find(guest => guest.nickname?.trim().toLowerCase() === nickname.toLowerCase());

        if (existing) {
          // No confirmation prompt — a nickname collision is overwhelmingly
          // "it's really me, new device" rather than two guests independently
          // picking the same nickname. The rare-coincidence case is handled
          // by the recognized:true flag below (app.js toasts "не ти?" pointing
          // at the existing "Це не я" link) rather than an extra dialog.
          await updateDoc(doc(db, 'guests', existing.id), {
            firebaseUid: auth.currentUser.uid,
            updatedAt: serverTimestamp()
          });
          dialog.close();
          resolve({ guestId: existing.id, name: existing.name, nickname: existing.nickname, recognized: true });
        } else {
          const guestId = `${slugify(name)}-${randomSuffix()}`;
          await setDoc(doc(db, 'guests', guestId), {
            name,
            nickname,
            firebaseUid: auth.currentUser.uid,
            createdAt: serverTimestamp()
          });
          dialog.close();
          resolve({ guestId, name, nickname, recognized: false });
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
