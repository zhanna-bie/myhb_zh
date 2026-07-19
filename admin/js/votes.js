import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { $, $$, escapeHtml, exportCsv, mountView } from './helpers.js';
import { toast } from './toast.js';

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyVotes() { unsubscribers.splice(0).forEach(unsub => unsub()); }

export function renderVotes() {
  mountView(`
    <section class="view view-votes">
      <header class="view-header">
        <div><p class="eyebrow">DECISION ROOM</p><h1>Votes</h1><p class="muted">Realtime restaurant voting statistics.</p></div>
        <button class="button ghost" id="exportVotesBtn" type="button">Export CSV</button>
      </header>
      <div class="vote-summary" id="voteSummary"></div>
      <div class="entity-list" id="votesBreakdown"><div class="skeleton-card"></div></div>
      <section class="panel">
        <div class="panel-head"><h2>Recent votes</h2></div>
        <div class="table-wrap"><table class="admin-table" id="votesTable"><thead><tr><th>Guest</th><th>Restaurant</th><th>Time</th></tr></thead><tbody></tbody></table></div>
      </section>
    </section>
  `);

  let restaurants = {};
  let votes = [];
  let restaurantNames = {};

  track(onSnapshot(collection(db, 'restaurants'), snapshot => {
    restaurantNames = Object.fromEntries(snapshot.docs.map(item => [item.id, item.data().name]));
    paint();
  }));

  track(onSnapshot(collection(db, 'votes'), snapshot => {
    votes = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    restaurants = {};
    votes.forEach(vote => {
      const id = vote.restaurant || vote.locationId;
      if (id) restaurants[id] = (restaurants[id] || 0) + 1;
    });
    paint();
  }, () => toast.error('Votes listener failed')));

  function paint() {
    const total = votes.length || 1;
    const entries = Object.entries(restaurants).sort((a, b) => b[1] - a[1]);
    $('#voteSummary').innerHTML = `
      <article class="stat-card"><span>Total votes</span><strong>${votes.length}</strong></article>
      <article class="stat-card"><span>Restaurants</span><strong>${entries.length}</strong></article>
      <article class="stat-card"><span>Unique guests</span><strong>${new Set(votes.map(vote => vote.invitationId)).size}</strong></article>
    `;

    $('#votesBreakdown').innerHTML = entries.length ? entries.map(([id, count]) => {
      const percent = Math.round((count / total) * 100);
      return `
        <article class="vote-stat-card">
          <div class="vote-stat-head"><strong>${escapeHtml(restaurantNames[id] || id)}</strong><span>${percent}% · ${count} votes</span></div>
          <div class="vote-bar animated"><i style="width:${percent}%"></i></div>
        </article>
      `;
    }).join('') : '<div class="empty-state">No votes yet.</div>';

    $('#votesTable tbody').innerHTML = votes.slice(0, 100).map(vote => `
      <tr>
        <td>${escapeHtml(vote.invitationId || vote.id)}</td>
        <td>${escapeHtml(restaurantNames[vote.restaurant || vote.locationId] || vote.restaurant || '—')}</td>
        <td>${vote.timestamp?.toDate?.().toLocaleString('uk-UA') || '—'}</td>
      </tr>
    `).join('') || '<tr><td colspan="3">No votes yet.</td></tr>';
  }

  $('#exportVotesBtn').addEventListener('click', () => {
    if (!votes.length) {
      toast.warning('Nothing to export');
      return;
    }
    exportCsv(votes.map(vote => ({
      guest: vote.invitationId || vote.id,
      restaurant: restaurantNames[vote.restaurant || vote.locationId] || vote.restaurant || '',
      timestamp: vote.timestamp?.toDate?.().toISOString() || ''
    })), 'restaurant-votes.csv');
    toast.success('CSV exported');
  });
}
