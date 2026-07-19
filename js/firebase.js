import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyAgmqA4hSPq8WgeSLOj2RpxDZqETvZox6E',
  authDomain: 'zhanna-sbirthday.firebaseapp.com',
  projectId: 'zhanna-sbirthday',
  storageBucket: 'zhanna-sbirthday.firebasestorage.app',
  messagingSenderId: '80653580579',
  appId: '1:80653580579:web:c4e29eb1e2738f60987496',
  measurementId: 'G-67EDVSWB7Q'
};

export const ADMIN_EMAILS = ['zhannabie@gmail.com'];

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function ensureGuestSession() {
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}
