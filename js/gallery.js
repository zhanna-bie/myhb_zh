import { addDoc, collection, doc, getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, startAfter, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { $, $$, escapeHtml, imageDimensions, relativeTime } from './utils.js';

const PAGE_SIZE = 20;
const NEW_BADGE_MS = 8000;
const CLOUDINARY_CLOUD_NAME = 'mh1qp8ls';
const CLOUDINARY_UPLOAD_PRESET = 'gallery_upload';

export class LiveGallery {
  constructor({ visitor, displayName, toast }) {
    this.visitor = visitor;
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
    }, () => this.showGalleryError());
  }

  normalize(snapshot) {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      photoUrl: data.photoUrl || data.url,
      thumbnailUrl: data.thumbnailUrl || data.previewUrl || data.url,
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

  bindControls() {
    $$('.gallery-filter').forEach(button => button.addEventListener('click', () => {
      this.filter = button.dataset.filter;
      $$('.gallery-filter').forEach(item => item.classList.toggle('selected', item === button));
      this.render();
    }));
    $('#fileInput').addEventListener('change', event => this.upload([...event.target.files]));
    const drop = $('#dropZone');
    ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', event => this.upload([...event.dataTransfer.files]));
  }

  filteredItems() {
    if (this.filter === 'mine') return this.items.filter(item => item.uploadedBy === this.visitor);
    if (this.filter === 'liked') return [...this.items].sort((a, b) => b.likes - a.likes);
    return this.items;
  }

  render() {
    const items = this.filteredItems();
    const root = $('#masonry');
    root.innerHTML = items.length ? items.map((item, index) => this.card(item, index)).join('') : '<div class="gallery-empty">Тут з’являться спільні спогади з місії ✦</div>';
    $$('.photo', root).forEach(card => card.addEventListener('click', () => this.openViewer(Number(card.dataset.index))));
    $$('.like-photo', root).forEach(button => button.addEventListener('click', event => { event.stopPropagation(); this.like(button.dataset.id); }));
    this.renderStats(items);
    this.renderActivity();
  }

  card(item, index) {
    const isNew = item.isNew ? '<span class="new-badge">✨ New</span>' : '';
    return `<article class="photo ${item.isNew ? 'photo-new' : ''}" data-index="${index}"><img src="${escapeHtml(item.thumbnailUrl)}" loading="lazy" alt="${escapeHtml(item.name)}">${isNew}<div class="photo-meta"><span>${escapeHtml(item.uploadedByName)}</span><button class="like-photo" data-id="${item.id}" aria-label="Вподобати фото">♥ ${item.likes}</button></div></article>`;
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
    } finally { this.loadingMore = false; }
  }

  setupInfiniteScroll() {
    this.observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) this.loadMore(); }, { rootMargin: '600px' });
    this.observer.observe($('#gallerySentinel'));
  }

  async upload(files) {
    const images = files.filter(file => file.type.startsWith('image/'));
    if (!images.length) return;
    const button = $('#uploadLabel');
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    for (let index = 0; index < images.length; index += 1) {
      const file = images[index];
      try {
        const dimensions = await imageDimensions(file);
        const cloudinary = await this.uploadToCloudinary(file, progress => this.setProgress(index, images.length, progress));
        await addDoc(collection(db, 'gallery'), {
          photoUrl: cloudinary.secure_url,
          thumbnailUrl: cloudinary.secure_url.replace('/upload/', '/upload/f_auto,q_auto,w_900/'),
          uploadedBy: this.visitor,
          uploadedByName: this.displayName,
          uploadedAt: serverTimestamp(),
          likes: 0,
          downloads: 0,
          fileSize: file.size,
          width: dimensions.width,
          height: dimensions.height,
          name: file.name.replace(/\.[^.]+$/, ''),
          publicId: cloudinary.public_id
        });
      } catch (error) {
        console.error(error);
        this.toast('Не вдалося завантажити фото. Спробуй ще раз.');
      }
    }
    $('#uploadProgress').hidden = true;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
    $('#fileInput').value = '';
    this.toast('✓ Фото успішно завантажено');
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

  async like(id) { await updateDoc(doc(db, 'gallery', id), { likes: increment(1) }); }

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
    $('#downloadPhoto').onclick = () => updateDoc(doc(db, 'gallery', item.id), { downloads: increment(1) });
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
