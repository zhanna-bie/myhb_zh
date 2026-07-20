// Passwordless guest identity: pick a name from a preset list, claim a nickname
// once, then get recognized by that nickname on return visits (localStorage).
// See admin/js/guests.js for the admin side and firestore.rules `guests` for
// the write constraints (nickname settable only while empty; server-enforced,
// not just client-side — see comments there).
import { collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db, ensureGuestSession } from './firebase.js';
import { $ } from './utils.js';

const STORAGE_KEY = 'partyGuest';

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

/** Resolves once a guest is identified — first from localStorage, otherwise via the gate dialog. */
export async function ensureGuestIdentity() {
  await ensureGuestSession().catch(() => {});
  const stored = readStoredGuest();
  if (stored) {
    showNotMeLink();
    return stored;
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
    const nameForm = $('#guestNameForm');
    const nameSelect = $('#guestNameSelect');
    const emptyHint = $('#guestNameEmptyHint');
    const nickForm = $('#guestNicknameForm');
    const nickHint = $('#guestNicknameHint');
    const nickInput = $('#guestNicknameInput');
    const nickBack = $('#guestNameBack');
    const error = $('#guestGateError');

    let guests = [];
    let selected = null;

    const setError = message => { error.textContent = message || ''; };

    getDocs(collection(db, 'guests')).then(snapshot => {
      guests = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      nameSelect.innerHTML = '<option value="" disabled selected>Оберіть ім\'я…</option>'
        + guests.map(guest => `<option value="${guest.id}">${guest.name}</option>`).join('');
      emptyHint.hidden = guests.length > 0;
      nameForm.querySelector('button').disabled = !guests.length;
    }).catch(() => { emptyHint.hidden = false; emptyHint.textContent = 'Не вдалося завантажити список гостей. Онови сторінку.'; });

    dialog.showModal();

    nameForm.addEventListener('submit', async event => {
      event.preventDefault();
      setError('');
      const guestId = nameSelect.value;
      if (!guestId) return;
      try {
        const snapshot = await getDoc(doc(db, 'guests', guestId));
        if (!snapshot.exists()) { setError('Цього гостя більше немає у списку. Онови сторінку.'); return; }
        selected = { id: guestId, ...snapshot.data() };
        nameForm.hidden = true;
        nickForm.hidden = false;
        nickInput.value = '';
        if (selected.nickname) {
          nickHint.textContent = `${selected.name}, введи нік, яким ти вже прив'язалась раніше (з іншого пристрою).`;
          nickInput.placeholder = 'Твій нік';
        } else {
          nickHint.textContent = `${selected.name}, придумай свій нік — під ним тебе бачитимуть на сайті.`;
          nickInput.placeholder = 'Придумай нік';
        }
        nickInput.focus();
      } catch {
        setError('Помилка підключення. Спробуй ще раз.');
      }
    });

    nickBack.addEventListener('click', () => {
      setError('');
      nickForm.hidden = true;
      nameForm.hidden = false;
      selected = null;
    });

    nickForm.addEventListener('submit', async event => {
      event.preventDefault();
      setError('');
      const nickname = nickInput.value.trim();
      if (!nickname || !selected) return;
      const submitBtn = $('#guestNicknameSubmit');
      submitBtn.disabled = true;
      try {
        if (selected.nickname) {
          if (selected.nickname.toLowerCase() !== nickname.toLowerCase()) {
            setError('Нік не збігається з тим, який ти обрала раніше. Спробуй ще раз.');
            return;
          }
          await updateDoc(doc(db, 'guests', selected.id), {
            nickname: selected.nickname,
            firebaseUid: auth.currentUser.uid,
            updatedAt: serverTimestamp()
          });
        } else {
          await updateDoc(doc(db, 'guests', selected.id), {
            nickname,
            firebaseUid: auth.currentUser.uid,
            updatedAt: serverTimestamp()
          });
        }
        dialog.close();
        resolve({ guestId: selected.id, name: selected.name, nickname: selected.nickname || nickname });
      } catch (err) {
        setError(err?.code === 'permission-denied'
          ? 'Хтось щойно узяв цей нік або ім\'я. Спробуй ще раз.'
          : 'Не вдалося зберегти. Перевір інтернет і спробуй ще раз.');
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
}
