import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAgmqA4hSPq8WgeSLOj2RpxDZqETvZox6E',
  authDomain: 'zhanna-sbirthday.firebaseapp.com',
  projectId: 'zhanna-sbirthday',
  storageBucket: 'zhanna-sbirthday.firebasestorage.app',
  messagingSenderId: '80653580579',
  appId: '1:80653580579:web:c4e29eb1e2738f60987496',
  measurementId: 'G-67EDVSWB7Q'
};

export const db = getFirestore(initializeApp(firebaseConfig));
