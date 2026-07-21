import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase-admin.js';
import { $, $$, cleanObject, escapeHtml, formToObject, formatDateTime, mountView, setButtonLoading, truncate } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const unsubscribers = [];
function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyNews() { unsubscribers.splice(0).forEach(unsub => unsub()); }

/** @param {Record<string, unknown>} [data] @param {string} [id] */
function newsForm(data = {}, id = '') {
  return `
    <form class="entity-form" id="newsForm">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <label>Title<input name="title" required value="${escapeHtml(String(data.title || data.text || ''))}"></label>
      <label>Content<textarea name="content" required>${escapeHtml(String(data.content || data.text || ''))}</textarea></label>
      <label class="checkbox"><input name="pinned" type="checkbox" ${data.pinned ? 'checked' : ''}> Pinned</label>
      <label class="checkbox"><input name="hidden" type="checkbox" ${data.hidden ? 'checked' : ''}> Hidden</label>
    </form>
  `;
}

async function saveNews(form) {
  const raw = formToObject(form);
  const payload = cleanObject({
    title: raw.title,
    content: raw.content,
    text: raw.content,
    pinned: raw.pinned === 'on',
    hidden: raw.hidden === 'on'
  });
  if (raw.id) {
    await updateDoc(doc(db, 'news', raw.id), { ...payload, updatedAt: serverTimestamp() });
    toast.success('News updated');
  } else {
    await addDoc(collection(db, 'news'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    toast.success('News published');
  }
}

export function renderNews() {
  mountView(`
    <section class="view view-news">
      <header class="view-header">
        <div><p class="eyebrow">UPDATES</p><h1>News</h1><p class="muted">Publish updates to the public site banner.</p></div>
        <button class="button primary" id="addNewsBtn" type="button">+ Add news</button>
      </header>
      <div class="entity-list" id="newsList"><div class="skeleton-card"></div></div>
    </section>
  `);

  $('#addNewsBtn').addEventListener('click', () => {
    modal.open({
      title: 'Publish news',
      body: newsForm(),
      footer: '<button class="button ghost" data-modal-close type="button">Cancel</button><button class="button primary" id="saveNewsBtn" type="button">Publish</button>',
      onMount: panel => {
        panel.querySelector('#saveNewsBtn').addEventListener('click', async () => {
          const form = panel.querySelector('#newsForm');
          const button = panel.querySelector('#saveNewsBtn');
          if (!form.reportValidity()) return;
          setButtonLoading(button, true, 'Saving...');
          try {
            await saveNews(form);
            modal.close();
          } catch {
            toast.error('Could not publish news');
          } finally {
            setButtonLoading(button, false);
          }
        });
      }
    });
  });

  track(onSnapshot(collection(db, 'news'), snapshot => {
    const root = $('#newsList');
    if (snapshot.empty) {
      root.innerHTML = '<div class="empty-state">No news yet.</div>';
      return;
    }
    const docs = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    root.innerHTML = docs.map(item => `
      <article class="news-admin-card ${item.hidden ? 'is-hidden' : ''} ${item.pinned ? 'is-pinned' : ''}">
        <div>
          <div class="badges">${item.pinned ? '<span class="badge badge-gold">Pinned</span>' : ''}${item.hidden ? '<span class="badge">Hidden</span>' : '<span class="badge badge-live">Live</span>'}</div>
          <h3>${escapeHtml(item.title || item.text)}</h3>
          <p>${escapeHtml(truncate(item.content || item.text, 160))}</p>
          <small>${formatDateTime(item.updatedAt || item.createdAt)}</small>
        </div>
        <div class="entity-card-actions">
          <button class="button ghost edit-news" data-id="${item.id}" type="button">Edit</button>
          <button class="button ghost toggle-pin" data-id="${item.id}" data-pinned="${Boolean(item.pinned)}" type="button">${item.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="button ghost toggle-hidden" data-id="${item.id}" data-hidden="${Boolean(item.hidden)}" type="button">${item.hidden ? 'Show' : 'Hide'}</button>
          <button class="button danger delete-news" data-id="${item.id}" type="button">Delete</button>
        </div>
      </article>
    `).join('');

    const map = Object.fromEntries(docs.map(item => [item.id, item]));

    $$('.edit-news', root).forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        modal.open({
          title: 'Edit news',
          body: newsForm(map[id], id),
          footer: '<button class="button ghost" data-modal-close type="button">Cancel</button><button class="button primary" id="saveNewsBtn" type="button">Save</button>',
          onMount: panel => {
            panel.querySelector('#saveNewsBtn').addEventListener('click', async () => {
              const form = panel.querySelector('#newsForm');
              const saveBtn = panel.querySelector('#saveNewsBtn');
              if (!form.reportValidity()) return;
              setButtonLoading(saveBtn, true, 'Saving...');
              try {
                await saveNews(form);
                modal.close();
              } catch {
                toast.error('Could not update news');
              } finally {
                setButtonLoading(saveBtn, false);
              }
            });
          }
        });
      });
    });

    $$('.toggle-pin', root).forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await updateDoc(doc(db, 'news', button.dataset.id), { pinned: button.dataset.pinned !== 'true', updatedAt: serverTimestamp() });
          toast.success('Pin status updated');
        } catch {
          toast.error('Could not update pin');
        }
      });
    });

    $$('.toggle-hidden', root).forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await updateDoc(doc(db, 'news', button.dataset.id), { hidden: button.dataset.hidden !== 'true', updatedAt: serverTimestamp() });
          toast.success('Visibility updated');
        } catch {
          toast.error('Could not update visibility');
        }
      });
    });

    $$('.delete-news', root).forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await modal.confirm({ title: 'Delete news', body: 'Remove this announcement?', danger: true, confirmLabel: 'Delete' });
        if (!confirmed) return;
        try {
          await deleteDoc(doc(db, 'news', button.dataset.id));
          toast.success('News deleted');
        } catch {
          toast.error('Could not delete news');
        }
      });
    });
  }, () => toast.error('News listener failed')));
}
