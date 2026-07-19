import { addDoc, collection, deleteDoc, doc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { $, $$, compressImage, escapeHtml, imageDimensions, relativeTime } from './utils.js';

const PAGE_SIZE = 20;
const NEW_BADGE_MS = 8000;
const CLOUDINARY_CLOUD_NAME = 'mh1qp8ls';
const CLOUDINARY_UPLOAD_PRESET = 'gallery_upload';

export class LiveGallery {
  constructor({ ownerId, displayName, toast }) {
    this.ownerId = ownerId;
    this.displayName = displayName;
    this.toast = toast;
    this.items = [];
    this.filter = 'newest';
    this.cursor = null;
    this.loadingMore = false;
    this.observer = null;
    this.unsubscribe = null;
    this.viewerIndex = 0;
    this.scale = 1;
    this.touchStart = null;
    this.newBadgeTimers = new Set();
  }

  init() {
    this.bindControls();
    this.subscribe();
    this.setupInfiniteScroll();
    this.setupViewer();
  }

  subscribe() {
    const feed = query(collection(db, 'gallery'), orderBy('uploadedAt', 'desc'), limit(PAGE_SIZE));
    this.unsubscribe = onSnapshot(feed, snapshot => {
      const newest = snapshot.docs.map(item => this.normalize(item));
      const known = new Map(this.items.map(item => [item.id, item]));
      newest.forEach(item => known.set(item.id, item));
      this.items = [...known.values()].sort((a, b) => this.timeOf(b) - this.timeOf(a));
      this.cursor = snapshot.docs.at(-1) || this.cursor;
      this.render();
      newest.filter(item => item.isNew).forEach(item => this.expireNewBadge(item));
    }, () => this.showGalleryError());
  }

  normalize(snapshot) {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      photoUrl: data.photoUrl || data.url,
      thumbnailUrl: data.thumbnailUrl || data.previewUrl || data.url || data.photoUrl,
      uploadedBy: data.uploadedBy || 'Гість',
      uploadedByName: data.uploadedByName || data.uploadedBy || 'Гість',
      uploadedAt: data.uploadedAt || data.createdAt,
      likes: Number(data.likes || 0),
      downloads: Number(data.downloads || 0),
      fileSize: data.fileSize || 0,
      width: data.width || 0,
      height: data.height || 0,
      name: data.name || 'Фото з місії',
      isNew: Date.now() - this.timeOf({ uploadedAt: data.uploadedAt || data.createdAt }) < NEW_BADGE_MS
    };
  }

  timeOf(item) { return item.uploadedAt?.toMillis?.() || new Date(item.uploadedAt || 0).getTime() || 0; }

  expireNewBadge(item) {
    if (this.newBadgeTimers.has(item.id)) return;
    const wait = Math.max(0, NEW_BADGE_MS - (Date.now() - this.timeOf(item)));
    this.newBadgeTimers.add(item.id);
    setTimeout(() => { this.newBadgeTimers.delete(item.id); this.render(); }, wait + 50);
  }

  bindControls() {
    $$('.gallery-filter').forEach(button => button.addEventListener('click', () => {
      this.filter = button.dataset.filter;
      $$('.gallery-filter').forEach(item => {
        const selected = item === button;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', String(selected));
      });
      this.render();
    }));
    $('#fileInput').addEventListener('change', event => this.upload([...event.target.files]));
    const drop = $('#dropZone');
    ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', event => this.upload([...event.dataTransfer.files]));
  }

  filteredItems() {
    if (this.filter === 'mine') return this.items.filter(item => item.uploadedBy === this.ownerId);
    if (this.filter === 'liked') return [...this.items].sort((a, b) => b.likes - a.likes);
    return this.items;
  }

  render() {
    const items = this.filteredItems();
    const root = $('#masonry');
    root.innerHTML = items.length ? items.map((item, index) => this.card(item, index)).join('') : '<div class="gallery-empty">Тут з’являться спільні спогади з місії ✦</div>';
    $$('.photo-open', root).forEach(button => button.addEventListener('click', () => this.openViewer(Number(button.dataset.index))));
    $$('.like-photo', root).forEach(button => button.addEventListener('click', event => { event.stopPropagation(); this.like(button.dataset.id); }));
    $$('.delete-photo', root).forEach(button => button.addEventListener('click', event => { event.stopPropagation(); this.remove(button.dataset.id); }));
    this.renderStats(items);
    this.renderActivity();
  }

  card(item, index) {
    const isNew = item.isNew ? '<span class="new-badge">✨ New</span>' : '';
    const remove = item.uploadedBy === this.ownerId ? `<button class="delete-photo" data-id="${item.id}" aria-label="Видалити своє фото">×</button>` : '';
    return `<article class="photo ${item.isNew ? 'photo-new' : ''}"><button class="photo-open" data-index="${index}" type="button" aria-label="Відкрити фото: ${escapeHtml(item.name)}"><img src="${escapeHtml(item.thumbnailUrl)}" loading="lazy" alt="${escapeHtml(item.name)}"></button>${isNew}${remove}<div class="photo-meta"><span>${escapeHtml(item.uploadedByName)}</span><button class="like-photo" data-id="${item.id}" type="button" aria-label="Вподобати фото">♥ ${item.likes}</button></div></article>`;
  }

  renderStats(items) {
    const contributors = new Set(this.items.map(item => item.uploadedBy)).size;
    const latest = this.items[0];
    $('#galleryStats').innerHTML = `<span>📸 ${this.items.length} фото</span><span>👥 ${contributors} авторів</span><span>🕒 ${latest ? relativeTime(latest.uploadedAt) : 'ще немає завантажень'}</span>`;
  }

  renderActivity() {
    const grouped = new Map();
    this.items.slice(0, 30).forEach(item => {
      const key = `${item.uploadedBy}-${new Date(this.timeOf(item)).toDateString()}`;
      const group = grouped.get(key) || { name: item.uploadedByName, count: 0, time: item.uploadedAt };
      group.count += 1;
      grouped.set(key, group);
    });
    $('#activityFeed').innerHTML = [...grouped.values()].slice(0, 3).map(item => `<span><b>${escapeHtml(item.name)}</b> додала ${item.count} ${item.count === 1 ? 'фото' : 'фото'} · ${relativeTime(item.time)}</span>`).join('');
  }

  async loadMore() {
    if (!this.cursor || this.loadingMore) return;
    this.loadingMore = true;
    try {
      const next = await getDocs(query(collection(db, 'gallery'), orderBy('uploadedAt', 'desc'), startAfter(this.cursor), limit(PAGE_SIZE)));
      const fresh = next.docs.map(item => this.normalize(item));
      const ids = new Set(this.items.map(item => item.id));
      this.items.push(...fresh.filter(item => !ids.has(item.id)));
      this.cursor = next.docs.at(-1) || this.cursor;
      if (fresh.length) this.render();
    } catch {
      this.toast('Не вдалося завантажити більше фото.');
    } finally {
      this.loadingMore = false;
    }
  }

  setupInfiniteScroll() {
    this.observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) this.loadMore(); }, { rootMargin: '600px' });
    this.observer.observe($('#gallerySentinel'));
  }

  async upload(files) {
    if (!this.ownerId) { this.toast('Галерея тимчасово недоступна. Спробуй оновити сторінку.'); return; }
    const images = files.filter(file => file.type.startsWith('image/'));
    if (!images.length) {
      this.toast('Оберіть зображення.');
      return;
    }
    const button = $('#uploadLabel');
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    let successCount = 0;
    let failCount = 0;

    for (let index = 0; index < images.length; index += 1) {
      const file = images[index];
      try {
        const compressed = await compressImage(file);
        const dimensions = await imageDimensions(compressed);
        const cloudinary = await this.uploadToCloudinary(compressed, progress => this.setProgress(index, images.length, progress));
        await addDoc(collection(db, 'gallery'), {
          photoUrl: cloudinary.secure_url,
          thumbnailUrl: cloudinary.secure_url.replace('/upload/', '/upload/f_auto,q_auto,w_900/'),
          uploadedBy: this.ownerId,
          uploadedByName: this.displayName,
          uploadedAt: serverTimestamp(),
          likes: 0,
          downloads: 0,
          fileSize: compressed.size,
          width: dimensions.width,
          height: dimensions.height,
          name: file.name.replace(/\.[^.]+$/, ''),
          publicId: cloudinary.public_id
        });
        successCount += 1;
      } catch {
        failCount += 1;
      }
    }

    $('#uploadProgress').hidden = true;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
    $('#fileInput').value = '';

    if (successCount && !failCount) this.toast('✓ Фото успішно завантажено');
    else if (successCount && failCount) this.toast(`Завантажено ${successCount}, помилок: ${failCount}`);
    else if (failCount) this.toast('Не вдалося завантажити фото. Спробуй ще раз.');
  }

  setProgress(index, total, percent) {
    const progress = $('#uploadProgress');
    progress.hidden = false;
    progress.innerHTML = `<span>Uploading ${index + 1}/${total}… ${percent}%</span><i><b style="width:${percent}%"></b></i>`;
  }

  uploadToCloudinary(file, onProgress) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      const body = new FormData();
      body.append('file', file);
      body.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      request.upload.addEventListener('progress', event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); });
      request.addEventListener('load', () => request.status >= 200 && request.status < 300 ? resolve(JSON.parse(request.responseText)) : reject(new Error('cloudinary-upload')));
      request.addEventListener('error', () => reject(new Error('cloudinary-network')));
      request.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);
      request.send(body);
    });
  }

  async like(id) {
    try {
      await updateDoc(doc(db, 'gallery', id), { likes: increment(1) });
    } catch {
      this.toast('Не вдалося поставити лайк.');
    }
  }

  async remove(id) {
    try {
      await deleteDoc(doc(db, 'gallery', id));
      this.toast('Фото прибрано з галереї.');
    } catch {
      this.toast('Не вдалося видалити фото.');
    }
  }

  openViewer(index) {
    this.viewerItems = this.filteredItems();
    this.viewerIndex = index;
    this.scale = 1;
    this.paintViewer();
    $('#lightbox').showModal();
  }

  paintViewer() {
    const item = this.viewerItems[this.viewerIndex];
    const image = $('#lightboxImage');
    image.src = item.photoUrl;
    image.alt = item.name;
    image.style.transform = 'scale(1)';
    $('#viewerCaption').textContent = `${item.uploadedByName} · ${relativeTime(item.uploadedAt)}`;
    $('#downloadPhoto').href = item.photoUrl;
    $('#viewerLike').textContent = `♥ ${item.likes}`;
    $('#viewerLike').onclick = () => this.like(item.id);
    $('#downloadPhoto').onclick = async () => {
      try {
        await updateDoc(doc(db, 'gallery', item.id), { downloads: increment(1) });
      } catch {
        this.toast('Не вдалося оновити лічильник завантажень.');
      }
    };
  }

  setupViewer() {
    $('#closeLightbox').addEventListener('click', () => $('#lightbox').close());
    $('#viewerPrev').addEventListener('click', () => this.moveViewer(-1));
    $('#viewerNext').addEventListener('click', () => this.moveViewer(1));
    $('#lightboxImage').addEventListener('dblclick', () => { this.scale = this.scale === 1 ? 2 : 1; $('#lightboxImage').style.transform = `scale(${this.scale})`; });
    document.addEventListener('keydown', event => {
      if (!$('#lightbox').open) return;
      if (event.key === 'Escape') $('#lightbox').close();
      if (event.key === 'ArrowLeft') this.moveViewer(-1);
      if (event.key === 'ArrowRight') this.moveViewer(1);
    });
    $('#lightboxImage').addEventListener('touchstart', event => { this.touchStart = event.changedTouches[0].clientX; }, { passive: true });
    $('#lightboxImage').addEventListener('touchend', event => { const delta = event.changedTouches[0].clientX - this.touchStart; if (Math.abs(delta) > 50) this.moveViewer(delta > 0 ? -1 : 1); }, { passive: true });
  }

  moveViewer(step) { this.viewerIndex = (this.viewerIndex + step + this.viewerItems.length) % this.viewerItems.length; this.paintViewer(); }
  showGalleryError() { $('#masonry').innerHTML = '<div class="gallery-empty">Архів зараз недоступний. Спробуй оновити сторінку трохи пізніше.</div>'; }
}
