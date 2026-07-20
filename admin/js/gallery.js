import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { $, $$, compressImage, escapeHtml, formatBytes, imageDimensions, mountView, relativeTime, setButtonLoading } from './helpers.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const CLOUDINARY_CLOUD_NAME = 'mh1qp8ls';
const CLOUDINARY_UPLOAD_PRESET = 'gallery_upload';
const unsubscribers = [];
/** @type {{ file: File, preview: string, status: 'queued'|'uploading'|'done'|'error', progress: number, error?: string }[]} */
let uploadQueue = [];
let currentAdmin = null;

function track(fn) { unsubscribers.push(fn); return fn; }
export function destroyGallery() { unsubscribers.splice(0).forEach(unsub => unsub()); uploadQueue = []; }

function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append('file', file);
    body.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    request.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve(JSON.parse(request.responseText));
      else reject(new Error('cloudinary-upload'));
    });
    request.addEventListener('error', () => reject(new Error('cloudinary-network')));
    request.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);
    request.send(body);
  });
}

function renderQueue() {
  const panel = $('#uploadQueuePanel');
  if (!panel) return;
  if (!uploadQueue.length) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = uploadQueue.map((item, index) => `
    <article class="queue-item queue-item--${item.status}">
      <img src="${item.preview}" alt="">
      <div>
        <strong>${escapeHtml(item.file.name)}</strong>
        <span>${item.status === 'uploading' ? `Uploading ${item.progress}%` : item.status === 'error' ? (item.error || 'Failed') : item.status}</span>
        <i><b style="width:${item.progress}%"></b></i>
      </div>
      ${item.status === 'error' ? `<button class="button ghost retry-upload" data-index="${index}" type="button">Retry</button>` : ''}
    </article>
  `).join('');
  $$('.retry-upload', panel).forEach(button => {
    button.addEventListener('click', () => retryUpload(Number(button.dataset.index)));
  });
}

async function processQueue(user) {
  for (let index = 0; index < uploadQueue.length; index += 1) {
    const item = uploadQueue[index];
    if (item.status === 'done') continue;
    item.status = 'uploading';
    item.progress = 0;
    renderQueue();
    try {
      const compressed = await compressImage(item.file);
      const dimensions = await imageDimensions(compressed);
      const cloudinary = await uploadToCloudinary(compressed, progress => {
        item.progress = progress;
        renderQueue();
      });
        await addDoc(collection(db, 'gallery'), {
          photoUrl: cloudinary.secure_url,
          thumbnailUrl: cloudinary.secure_url.replace('/upload/', '/upload/f_auto,q_auto,w_900/'),
        uploadedBy: user.uid,
        uploadedByName: user.displayName || user.email?.split('@')[0] || 'Admin',
        uploadedAt: serverTimestamp(),
        likedBy: [],
        downloads: 0,
        fileSize: compressed.size,
        width: dimensions.width,
        height: dimensions.height,
        name: item.file.name.replace(/\.[^.]+$/, ''),
        publicId: cloudinary.public_id
      });
      item.status = 'done';
      item.progress = 100;
    } catch {
      item.status = 'error';
      item.error = 'Upload failed';
    }
    renderQueue();
  }
  const failed = uploadQueue.filter(item => item.status === 'error').length;
  const done = uploadQueue.filter(item => item.status === 'done').length;
  if (done) toast.success(`${done} photo${done > 1 ? 's' : ''} uploaded`);
  if (failed) toast.error(`${failed} upload${failed > 1 ? 's' : ''} failed`);
  uploadQueue = uploadQueue.filter(item => item.status === 'error');
  if (!uploadQueue.length) renderQueue();
}

async function retryUpload(index) {
  const item = uploadQueue[index];
  if (!item) return;
  item.status = 'queued';
  item.progress = 0;
  item.error = '';
  renderQueue();
  await processQueue(currentAdmin);
}

async function enqueueFiles(files, user) {
  const images = [...files].filter(file => file.type.startsWith('image/'));
  if (!images.length) {
    toast.warning('Оберіть зображення');
    return;
  }
  for (const file of images) {
    uploadQueue.push({
      file,
      preview: URL.createObjectURL(file),
      status: 'queued',
      progress: 0
    });
  }
  renderQueue();
  await processQueue(user);
}

export function renderGalleryAdmin(user) {
  currentAdmin = user;
  mountView(`
    <section class="view view-gallery">
      <header class="view-header">
        <div>
          <p class="eyebrow">GALLERY CMS</p>
          <h1>Gallery</h1>
          <p class="muted">Cloudinary uploads with realtime Firestore metadata.</p>
        </div>
        <label class="button primary upload-trigger">
          + Upload
          <input type="file" accept="image/*" multiple hidden id="adminGalleryInput">
        </label>
      </header>
      <div class="gallery-admin-stats" id="galleryAdminStats"></div>
      <div class="dropzone-admin" id="adminDropZone">
        <p>Drag & drop photos here or click Upload</p>
        <span class="muted">Multiple files · auto compress · retry on failure</span>
      </div>
      <div class="upload-queue" id="uploadQueuePanel" hidden></div>
      <div class="activity-list compact" id="galleryActivity"></div>
      <div class="admin-masonry" id="adminMasonry"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>
    </section>
  `);

  const drop = $('#adminDropZone');
  const input = $('#adminGalleryInput');
  input.addEventListener('change', () => { enqueueFiles(input.files, user); input.value = ''; });
  ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', event => enqueueFiles(event.dataTransfer.files, user));
  drop.addEventListener('click', () => input.click());

  track(onSnapshot(collection(db, 'gallery'), snapshot => {
    const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.uploadedAt?.toMillis?.() || 0) - (a.uploadedAt?.toMillis?.() || 0));
    const contributors = new Set(items.map(item => item.uploadedBy)).size;
    const bytes = items.reduce((sum, item) => sum + Number(item.fileSize || 0), 0);
    $('#galleryAdminStats').innerHTML = `
      <span>📸 ${items.length} photos</span>
      <span>👥 ${contributors} authors</span>
      <span>💾 ${formatBytes(bytes)}</span>
    `;

    const grouped = new Map();
    items.slice(0, 40).forEach(item => {
      const key = `${item.uploadedByName || item.uploadedBy}-${new Date(item.uploadedAt?.toMillis?.() || Date.now()).toDateString()}`;
      const group = grouped.get(key) || { name: item.uploadedByName || item.uploadedBy || 'Guest', count: 0, time: item.uploadedAt };
      group.count += 1;
      grouped.set(key, group);
    });
    $('#galleryActivity').innerHTML = [...grouped.values()].slice(0, 5).map(item => `
      <article class="activity-item"><span class="activity-dot"></span><div><p><b>${escapeHtml(item.name)}</b> uploaded ${item.count} photo${item.count > 1 ? 's' : ''}</p><small>${relativeTime(item.time)}</small></div></article>
    `).join('') || '<div class="empty-state">No uploads yet.</div>';

    const root = $('#adminMasonry');
    root.innerHTML = items.length ? items.map(item => `
      <article class="admin-photo-card">
        <img src="${escapeHtml(item.thumbnailUrl || item.previewUrl || item.url || item.photoUrl)}" loading="lazy" alt="${escapeHtml(item.name || 'Photo')}">
        <div class="admin-photo-meta">
          <span>${escapeHtml(item.uploadedByName || 'Guest')}</span>
          <small>${relativeTime(item.uploadedAt)} · ♥ ${item.likes || 0}</small>
        </div>
        <div class="admin-photo-actions">
          <button class="button ghost preview-photo" data-url="${escapeHtml(item.photoUrl || item.url)}" type="button">Preview</button>
          <button class="button danger delete-photo" data-id="${item.id}" type="button">Delete</button>
        </div>
      </article>
    `).join('') : '<div class="empty-state">Gallery is empty.</div>';

    $$('.preview-photo', root).forEach(button => {
      button.addEventListener('click', () => {
        modal.open({
          title: 'Photo Preview',
          body: `<img class="modal-preview-image" src="${button.dataset.url}" alt="Preview">`,
          size: 'modal-wide'
        });
      });
    });

    $$('.delete-photo', root).forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await modal.confirm({ title: 'Delete photo', body: 'Remove this photo from the gallery?', confirmLabel: 'Delete', danger: true });
        if (!confirmed) return;
        setButtonLoading(button, true, 'Deleting...');
        try {
          await deleteDoc(doc(db, 'gallery', button.dataset.id));
          toast.success('Photo deleted');
        } catch {
          toast.error('Could not delete photo');
        } finally {
          setButtonLoading(button, false);
        }
      });
    });
  }, () => {
    $('#adminMasonry').innerHTML = '<div class="empty-state">Gallery unavailable. Check Firestore rules.</div>';
    toast.error('Gallery listener failed');
  }));
}
