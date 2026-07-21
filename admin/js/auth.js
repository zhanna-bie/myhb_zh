import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { auth, ADMIN_EMAILS } from '../../js/firebase-admin.js';
import { $ } from './helpers.js';
import { toast } from './toast.js';

/** @param {import('firebase/auth').User | null} user */
export function isAuthorizedAdmin(user) {
  return Boolean(user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
}

/** @param {(user: import('firebase/auth').User | null) => void} onReady */
export function initAuth(onReady) {
  onAuthStateChanged(auth, async user => {
    const ok = isAuthorizedAdmin(user);
    $('#login-view').hidden = ok;
    $('#app-view').hidden = !ok;

    if (user && !ok) {
      await signOut(auth);
      $('#loginError').textContent = 'Цей обліковий запис не має доступу до адмін-панелі.';
      toast.error('Доступ заборонено');
      onReady(null);
      return;
    }

    onReady(ok ? user : null);
  });

  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    const email = $('#email').value.trim();
    const password = $('#password').value;
    $('#loginError').textContent = '';
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      $('#loginError').textContent = 'Не вдалося увійти. Перевір email і пароль.';
      toast.error('Помилка входу');
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await signOut(auth);
      toast.info('Ви вийшли з системи');
    } catch {
      toast.error('Не вдалося вийти');
    }
  });
}
