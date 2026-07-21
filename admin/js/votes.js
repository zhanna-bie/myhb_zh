import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase-admin.js';
import { $, $$, escapeHtml, exportCsv, mountView } from './helpers.js';
import { toast } from './toast.js';

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyVotes() { unsubscribers.splice(0).forEach(unsub => unsub()); }

const VENUE_LABEL = { out: '🍽 У закладі', home: '🏠 Вдома' };

export function renderVotes() {
  mountView(`
    <section class="view view-votes">
      <header class="view-header">
        <div><p class="eyebrow">ГОЛОСУВАННЯ</p><h1>Голоси</h1><p class="muted">До 3 голосів на гостя сумарно на обидві категорії. Живий підрахунок з Firestore.</p></div>
        <button class="button ghost" id="exportVotesBtn" type="button">Експорт CSV</button>
      </header>
      <div class="vote-summary" id="voteSummary"></div>
      <section class="panel">
        <div class="panel-head"><h2>🍽 У закладі</h2></div>
        <div class="table-wrap"><table class="admin-table" id="voteTableOut"><thead><tr><th>Заклад</th><th>Голосів</th><th>%</th></tr></thead><tbody></tbody></table></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>🏠 Вдома</h2></div>
        <div class="table-wrap"><table class="admin-table" id="voteTableHome"><thead><tr><th>Заклад</th><th>Голосів</th><th>%</th></tr></thead><tbody></tbody></table></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Останні голоси</h2></div>
        <div class="table-wrap"><table class="admin-table" id="votesTable"><thead><tr><th>Гість</th><th>Заклад</th><th>Формат</th><th>Час</th></tr></thead><tbody></tbody></table></div>
      </section>
    </section>
  `);

  let votes = [];
  let placeNames = {};

  track(onSnapshot(collection(db, 'restaurants'), snapshot => {
    placeNames = Object.fromEntries(snapshot.docs.map(item => [item.id, item.data().name]));
    paint();
  }));

  track(onSnapshot(collection(db, 'votes'), snapshot => {
    votes = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    paint();
  }, () => toast.error('Votes listener failed')));

  function paintCategory(tableId, venue) {
    const inCategory = votes.filter(vote => (vote.venue || 'out') === venue && vote.placeId);
    const total = inCategory.length || 1;
    const counts = {};
    inCategory.forEach(vote => { counts[vote.placeId] = (counts[vote.placeId] || 0) + 1; });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    $(`#${tableId} tbody`).innerHTML = entries.length ? entries.map(([placeId, count]) => `
      <tr><td>${escapeHtml(placeNames[placeId] || placeId)}</td><td>${count}</td><td>${Math.round((count / total) * 100)}%</td></tr>
    `).join('') : '<tr><td colspan="3">Голосів поки немає.</td></tr>';
  }

  function paint() {
    const uniqueGuests = new Set(votes.map(vote => vote.guestId).filter(Boolean));
    $('#voteSummary').innerHTML = `
      <article class="stat-card"><span>Усього голосів</span><strong>${votes.length}</strong></article>
      <article class="stat-card"><span>Гостей проголосувало</span><strong>${uniqueGuests.size}</strong></article>
      <article class="stat-card"><span>У закладі / Вдома</span><strong>${votes.filter(v => (v.venue || 'out') === 'out').length} / ${votes.filter(v => v.venue === 'home').length}</strong></article>
    `;

    paintCategory('voteTableOut', 'out');
    paintCategory('voteTableHome', 'home');

    $('#votesTable tbody').innerHTML = votes
      .slice()
      .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))
      .slice(0, 100)
      .map(vote => `
        <tr>
          <td>${escapeHtml(vote.guestId || vote.id)}</td>
          <td>${escapeHtml(placeNames[vote.placeId] || vote.placeId || '—')}</td>
          <td>${VENUE_LABEL[vote.venue] || '—'}</td>
          <td>${vote.timestamp?.toDate?.().toLocaleString('uk-UA') || '—'}</td>
        </tr>
      `).join('') || '<tr><td colspan="4">Голосів поки немає.</td></tr>';
  }

  $('#exportVotesBtn').addEventListener('click', () => {
    if (!votes.length) {
      toast.warning('Немає що експортувати');
      return;
    }
    exportCsv(votes.map(vote => ({
      guest: vote.guestId || vote.id,
      place: placeNames[vote.placeId] || vote.placeId || '',
      venue: vote.venue || '',
      timestamp: vote.timestamp?.toDate?.().toISOString() || ''
    })), 'votes.csv');
    toast.success('CSV експортовано');
  });
}
