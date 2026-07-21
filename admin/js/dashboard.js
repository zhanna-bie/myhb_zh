import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase-admin.js';
import { $, escapeHtml, formatBytes, mountView, relativeTime } from './helpers.js';

const unsubscribers = [];

/** @param {() => void} fn */
function track(fn) {
  unsubscribers.push(fn);
  return fn;
}

export function destroyDashboard() {
  unsubscribers.splice(0).forEach(unsub => unsub());
}

export function renderDashboard() {
  mountView(`
    <section class="view view-dashboard">
      <header class="view-header">
        <div>
          <p class="eyebrow">OVERVIEW</p>
          <h1>Dashboard</h1>
          <p class="muted">Live metrics for the public website.</p>
        </div>
      </header>
      <div class="stat-grid" id="dashStats">
        ${['Photos', 'Votes', 'Guests', 'Restaurants', 'Routes', 'Wishlist', 'News'].map(label => `
          <article class="stat-card skeleton-card"><span>${label}</span><strong>—</strong></article>
        `).join('')}
      </div>
      <div class="dashboard-panels">
        <section class="panel">
          <div class="panel-head"><h2>Recent Activity</h2></div>
          <div class="activity-list" id="dashActivity"><div class="empty-state">Завантаження активності…</div></div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Storage Usage</h2></div>
          <div class="storage-panel" id="dashStorage">
            <div class="storage-meter"><i style="width:0%"></i></div>
            <p class="muted">Calculating gallery footprint…</p>
          </div>
        </section>
      </div>
    </section>
  `);

  const state = { photos: 0, votes: 0, guests: 0, restaurants: 0, routes: 0, wishlist: 0, news: 0, bytes: 0, activity: [] };

  const paintStats = () => {
    const cards = [
      ['Photos', state.photos, 'gallery'],
      ['Votes', state.votes, 'votes'],
      ['Guests', state.guests, 'guests'],
      ['Restaurants', state.restaurants, 'restaurants'],
      ['Routes', state.routes, 'routes'],
      ['Wishlist', state.wishlist, 'wishlist'],
      ['News', state.news, 'news']
    ];
    $('#dashStats').innerHTML = cards.map(([label, value, view]) => `
      <article class="stat-card" data-jump="${view}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>Live</small>
      </article>
    `).join('');
    document.querySelectorAll('[data-jump]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelector(`[data-view="${card.dataset.jump}"]`)?.click();
      });
    });
  };

  const paintActivity = () => {
    const feed = $('#dashActivity');
    if (!state.activity.length) {
      feed.innerHTML = '<div class="empty-state">Поки що немає активності.</div>';
      return;
    }
    feed.innerHTML = state.activity.slice(0, 12).map(item => `
      <article class="activity-item">
        <span class="activity-dot"></span>
        <div>
          <p>${escapeHtml(item.text)}</p>
          <small>${relativeTime(item.time)}</small>
        </div>
      </article>
    `).join('');
  };

  const paintStorage = () => {
    const usedMb = state.bytes / (1024 * 1024);
    const capMb = 500;
    const percent = Math.min(100, Math.round((usedMb / capMb) * 100));
    $('#dashStorage').innerHTML = `
      <div class="storage-meter" aria-hidden="true"><i style="width:${percent}%"></i></div>
      <div class="storage-meta">
        <strong>${formatBytes(state.bytes)}</strong>
        <span class="muted">${percent}% of soft limit (${capMb} MB)</span>
      </div>
      <p class="muted">${state.photos} photos tracked in Firestore metadata.</p>
    `;
  };

  track(onSnapshot(collection(db, 'gallery'), snapshot => {
    state.photos = snapshot.size;
    state.bytes = snapshot.docs.reduce((sum, item) => sum + Number(item.data().fileSize || 0), 0);
    snapshot.docs.slice(0, 8).forEach(item => {
      const data = item.data();
      state.activity.push({
        text: `${data.uploadedByName || data.uploadedBy || 'Guest'} uploaded a photo`,
        time: data.uploadedAt || data.createdAt
      });
    });
    state.activity.sort((a, b) => (b.time?.toMillis?.() || 0) - (a.time?.toMillis?.() || 0));
    paintStats();
    paintStorage();
    paintActivity();
  }));

  track(onSnapshot(collection(db, 'votes'), snapshot => {
    state.votes = snapshot.size;
    paintStats();
  }));

  // Was reading unique guestIds out of `votes` — undercounted every guest who
  // registered but hasn't voted yet (voting is optional). The real headcount
  // lives in `guests`.
  track(onSnapshot(collection(db, 'guests'), snapshot => {
    state.guests = snapshot.size;
    paintStats();
  }));

  track(onSnapshot(collection(db, 'restaurants'), snapshot => {
    state.restaurants = snapshot.size;
    paintStats();
  }));

  track(onSnapshot(collection(db, 'transport'), snapshot => {
    state.routes = snapshot.size;
    paintStats();
  }));

  track(onSnapshot(collection(db, 'wishlist'), snapshot => {
    state.wishlist = snapshot.size;
    paintStats();
  }));

  track(onSnapshot(collection(db, 'news'), snapshot => {
    state.news = snapshot.size;
    snapshot.docs.slice(0, 5).forEach(item => {
      const data = item.data();
      state.activity.push({ text: `News: ${data.title || data.text || 'Update'}`, time: data.createdAt || data.updatedAt });
    });
    state.activity.sort((a, b) => (b.time?.toMillis?.() || 0) - (a.time?.toMillis?.() || 0));
    paintStats();
    paintActivity();
  }));

  track(onSnapshot(collection(db, 'activity'), snapshot => {
    snapshot.docs.forEach(item => {
      const data = item.data();
      state.activity.push({ text: data.text || 'Activity update', time: data.createdAt });
    });
    state.activity.sort((a, b) => (b.time?.toMillis?.() || 0) - (a.time?.toMillis?.() || 0));
    paintActivity();
  }, () => {}));
}
