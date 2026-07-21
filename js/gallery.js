import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db, ensureGuestSession } from './firebase.js';
import { $, $$, compressImage, escapeHtml, imageDimensions, relativeTime } from './utils.js';

const PAGE_SIZE = 20;
const NEW_BADGE_MS = 8000;
// Retro mission-style captions for the photo cards (the old grid design guests liked).
const PHOTO_LABELS = ['opening night', 'mission crew', 'night signal', 'golden hour', 'warm echo', 'soft landing', 'orbit friends', 'star dust', 'first light', 'slow dance'];
const CLOUDINARY_CLOUD_NAME = 'mh1qp8ls';
const CLOUDINARY_UPLOAD_PRESET = 'gallery_upload';

export class LiveGallery {
  /** @param {{ guest: { guestId: string, nickname: string }, toast: (message: string) => void }} options */
  constructor({ guest, toast }) {
    this.guest = guest;
    this.toast = toast;
    this.items = [];
    this.authorQuery = '';
    this.cursor = null;
    this.loadingMore = false;
    this.observer = null;
    this.unsubscribe = null;
    this.statsUnsubscribe = null;
    this.stats = { total: 0 };
    this.viewerIndex = 0;
    this.scale = 1;
    this.touchStart = null;
    this.newBadgeTimers = new Set();
    this.justLikedId = null;
    this.pendingLikes = new Set();
  }

  // Live getter, not a field snapshotted in the constructor: for a returning
  // guest, ensureGuestIdentity() resolves before the background anonymous
  // sign-in retry finishes (deliberately, so a returning guest never waits
  // on it — see js/guest.js). LiveGallery can end up constructed in that
  // window, and a snapshotted ownerId would freeze at null for the rest of
  // the page's life even after auth finishes — silently breaking every
  // upload/like for that whole visit. Reading auth.currentUser fresh here
  // means it self-heals the moment auth actually resolves.
  get ownerId() {
    return auth.currentUser?.uid || null;
  }

  init() {
    this.bindControls();
    this.subscribe();
    this.subscribeStats();
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
      // Keep an open lightbox (e.g. mid like-toggle) in sync with live updates too.
      if ($('#lightbox').open) {
        const openId = this.viewerItems?.[this.viewerIndex]?.id;
        const freshIndex = this.viewerItems?.findIndex(item => item.id === openId);
        if (freshIndex >= 0) { this.viewerItems[freshIndex] = this.items.find(item => item.id === openId) || this.viewerItems[freshIndex]; this.paintViewer(); }
      }
      newest.filter(item => item.isNew).forEach(item => this.expireNewBadge(item));
    }, () => this.showGalleryError());
  }

  subscribeStats() {
    this.statsUnsubscribe = onSnapshot(collection(db, 'gallery'), snapshot => {
      this.stats = { total: snapshot.size };
      this.renderStats();
    }, () => this.renderStats());
  }

  normalize(snapshot) {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      photoUrl: data.photoUrl || data.url,
      thumbnailUrl: data.thumbnailUrl || data.previewUrl || data.url || data.photoUrl,
      uploadedBy: data.uploadedBy || 'Гість',
      guestId: data.guestId || '',
      uploadedByName: data.uploadedByName || data.uploadedBy || 'Гість',
      uploadedAt: data.uploadedAt || data.createdAt,
      likedBy: Array.isArray(data.likedBy) ? data.likedBy : [],
      likes: Array.isArray(data.likedBy) ? data.likedBy.length : Number(data.likes || 0),
      downloads: Number(data.downloads || 0),
      fileSize: data.fileSize || 0,
      width: data.width || 0,
      height: data.height || 0,
      name: data.name || 'Фото зі святкування',
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
    $('#gallerySearch').addEventListener('input', event => {
      this.authorQuery = event.target.value.trim().toLowerCase();
      this.render();
    });
    $('#fileInput').addEventListener('change', event => this.upload([...event.target.files]));
    const drop = $('#dropZone');
    ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', event => this.upload([...event.dataTransfer.files]));
    drop.addEventListener('click', () => $('#fileInput').click());
    drop.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        $('#fileInput').click();
      }
    });
  }

  filteredItems() {
    const sorted = [...this.items].sort((a, b) => this.timeOf(b) - this.timeOf(a));
    if (!this.authorQuery) return sorted;
    return sorted.filter(item => item.uploadedByName.toLowerCase().includes(this.authorQuery));
  }

  render() {
    const items = this.filteredItems();
    const root = $('#masonry');
    const empty = this.authorQuery
      ? `<div class="gallery-empty">Нічого не знайшли за «${escapeHtml(this.authorQuery)}» ✦<br>Перевір ім'я або очисти пошук.</div>`
      : '<div class="gallery-empty">Поки що фотографій немає ❤️<br>Першим завантаж своє фото.</div>';
    root.innerHTML = items.length ? items.map((item, index) => this.card(item, index)).join('') : empty;
    $$('.photo-open', root).forEach(button => button.addEventListener('click', () => this.openViewer(Number(button.dataset.index))));
    $$('.like-photo', root).forEach(button => button.addEventListener('click', event => { event.stopPropagation(); this.like(button.dataset.id); }));
    $$('.delete-photo', root).forEach(button => button.addEventListener('click', event => { event.stopPropagation(); this.remove(button.dataset.id); }));
    this.renderStats();
  }

  photoLabel(id) {
    let hash = 0;
    for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) % 997;
    return PHOTO_LABELS[hash % PHOTO_LABELS.length];
  }

  isMine(item) { return item.uploadedBy === this.ownerId || (item.guestId && item.guestId === this.guest.guestId); }

  card(item, index) {
    const isNew = item.isNew ? '<span class="new-badge">✨ New</span>' : '';
    const remove = this.isMine(item) ? `<button class="delete-photo" data-id="${item.id}" aria-label="Видалити своє фото" type="button">×</button>` : '';
    const liked = item.likedBy.includes(this.ownerId);
    const justLiked = item.id === this.justLikedId ? 'like-pop' : '';
    // Download/share live in the lightbox (openViewer) now, not here — three
    // buttons crammed into a masonry-width card meant "Поділитися" routinely
    // overflowed/clipped. The grid card keeps only like; open it for the rest.
    return `<article class="photo ${item.isNew ? 'photo-new' : ''}"><button class="photo-open" data-index="${index}" type="button" aria-label="Відкрити фото: ${escapeHtml(item.name)}"><img src="${escapeHtml(item.thumbnailUrl)}" loading="lazy" decoding="async" alt="${escapeHtml(item.name)}"></button>${isNew}${remove}<div class="photo-caption"><span class="photo-label">✦ ${this.photoLabel(item.id)}</span><button class="like-photo ${liked ? 'liked' : ''} ${justLiked}" data-id="${item.id}" type="button" aria-label="Вподобати фото" aria-pressed="${liked}">♥ ${item.likes}</button></div><div class="photo-meta"><span><b>${escapeHtml(item.uploadedByName)}</b><small>${relativeTime(item.uploadedAt)}</small></span></div></article>`;
  }

  renderStats() {
    $('#galleryStats').innerHTML = `<span>📸 ${this.stats.total} фото</span>`;
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
    if (!this.ownerId) await ensureGuestSession().catch(() => {});
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
          guestId: this.guest.guestId,
          uploadedByName: this.guest.nickname,
          uploadedAt: serverTimestamp(),
          likedBy: [],
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
    // arrayUnion/arrayRemove are idempotent server-side, so a rapid double
    // click could never actually duplicate a guest's id in likedBy — but
    // without this guard, click-click-click-click would fire four
    // overlapping writes toggling back and forth, and if they resolve out of
    // order the count can settle on the wrong final state. One in-flight
    // write per photo at a time keeps the toggle predictable.
    if (this.pendingLikes.has(id)) return;
    const item = this.items.find(photo => photo.id === id);
    if (!item) return;
    if (!this.ownerId) await ensureGuestSession().catch(() => {});
    if (!this.ownerId) { this.toast('Не вдалося оновити лайк.'); return; }
    this.pendingLikes.add(id);
    const before = item.likedBy;
    const liked = before.includes(this.ownerId);
    const after = liked ? before.filter(uid => uid !== this.ownerId) : [...before, this.ownerId];
    if (!liked) {
      // Brief pulse on the heart that was just liked (not on unlike). Tracked
      // by id and cleared on a timer, same pattern as newBadgeTimers above —
      // render() rebuilds the button from scratch each time, so the "just
      // liked" state has to survive the re-render rather than live on the DOM node.
      this.justLikedId = id;
      setTimeout(() => { if (this.justLikedId === id) { this.justLikedId = null; this.render(); } }, 450);
    }
    // Optimistic update: the live onSnapshot in subscribe() only covers the
    // first PAGE_SIZE items, so a like on anything loaded via loadMore()
    // would otherwise never visibly update until a reload. Applying the
    // toggle locally first makes every like/unlike feel instant regardless
    // of pagination or network latency; a failed write rolls it back to `before`.
    this.applyLikeState(item, after);
    try {
      await updateDoc(doc(db, 'gallery', id), { likedBy: liked ? arrayRemove(this.ownerId) : arrayUnion(this.ownerId) });
    } catch {
      this.applyLikeState(item, before);
      this.toast('Не вдалося оновити лайк.');
    } finally {
      this.pendingLikes.delete(id);
    }
  }

  applyLikeState(item, likedBy) {
    item.likedBy = likedBy;
    item.likes = likedBy.length;
    this.render();
    const viewerItem = this.viewerItems?.find(photo => photo.id === item.id);
    if (viewerItem) { viewerItem.likedBy = item.likedBy; viewerItem.likes = item.likes; this.paintViewer(); }
  }

  async share(item) {
    if (!item) return;
    const shareData = { title: 'Birthday Party', text: `${item.uploadedByName} додали фото`, url: item.photoUrl };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(item.photoUrl);
        this.toast('Посилання на фото скопійовано');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') this.toast('Не вдалося поділитися фото.');
    }
  }

  async trackDownload(id) {
    try {
      await updateDoc(doc(db, 'gallery', id), { downloads: increment(1) });
    } catch {
      this.toast('Не вдалося оновити лічильник завантажень.');
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
    if (!this.viewerItems.length) return;
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
    const liked = item.likedBy.includes(this.ownerId);
    $('#viewerLike').textContent = `${liked ? '💛' : '♥'} ${item.likes}`;
    $('#viewerLike').onclick = () => this.like(item.id);
    $('#downloadPhoto').onclick = () => this.trackDownload(item.id);
    $('#sharePhoto').onclick = () => this.share(item);
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
