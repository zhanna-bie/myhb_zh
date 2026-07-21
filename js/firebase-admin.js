// Separate named Firebase App instance for the admin panel, so its
// email/password session has its own Auth persistence and can never be
// clobbered by the public site's anonymous guest sign-in (see js/firebase.js
// / js/guest.js). Both instances point at the same project/config — this is
// purely about keeping two independent "current user" slots in the browser,
// since signInAnonymously() on a shared Auth instance signs out whoever else
// was signed in (documented Firebase behaviour, confirmed as the cause of
// "admin keeps getting logged out" whenever the public site was open too).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, ADMIN_EMAILS } from '../js/firebase.js';

const adminApp = initializeApp(firebaseConfig, 'admin');
export const auth = getAuth(adminApp);
export const db = getFirestore(adminApp);
export { ADMIN_EMAILS, firebaseConfig };
