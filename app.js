import { collection, doc, onSnapshot, serverTimestamp, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './js/firebase.js';
import { $, $$, escapeHtml } from './js/utils.js';
import { LiveGallery } from './js/gallery.js';
import { ensureGuestIdentity } from './js/guest.js';
import { DEFAULT_CHECKLIST, DEFAULT_LOCATIONS, DEFAULT_ROUTES, DEFAULT_SETTINGS, DEFAULT_SWIM_CHECKLIST } from './js/defaults.js';

const DEFAULT_PARTY_DATE = DEFAULT_SETTINGS.birthdayDate;
const DEFAULT_MEMORIES_DATE = DEFAULT_SETTINGS.memoriesModeDate;
const MAX_VOTES = 3;

const state = {
  partyDate: new Date(DEFAULT_PARTY_DATE),
  memoriesDate: new Date(DEFAULT_MEMORIES_DATE),
  weatherLat: 50.34,
  weatherLon: 26.64
};

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 3200);
}

async function copyText(value, successMessage = 'Скопійовано') {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;opacity:0';
      document.body.append(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    toast(successMessage);
    return true;
  } catch {
    toast('Не вдалося скопіювати. Спробуй ще раз.');
    return false;
  }
}

function inMemoriesMode() {
  return new Date() >= state.memoriesDate;
}

function setupInvitation(guest) {
  $('#heroTitle').innerHTML = `Привіт, ${escapeHtml(guest.nickname)}! ❤️<br><em>Рада, що ти тут.</em>`;
}

function setupCountdown() {
  const tick = () => {
    if (inMemoriesMode()) return;
    const difference = Math.max(0, state.partyDate - Date.now());
    const values = [['days', 86400000, 3], ['hours', 3600000, 2], ['mins', 60000, 2], ['secs', 1000, 2]];
    values.forEach(([id, unit, digits]) => {
      const mod = id === 'days' ? Infinity : id === 'hours' ? 24 : 60;
      const value = Math.floor(difference / unit) % mod;
      $(`#${id}`).textContent = String(value).padStart(digits, '0');
    });
    if (!difference) $('#countdownTitle').innerHTML = 'Святкування <em>почалося</em>';
  };
  tick();
  setInterval(tick, 1000);
}

async function loadWeather() {
  const status = $('#weatherStatus');
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${state.weatherLat}&longitude=${state.weatherLon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code,wind_speed_10m_max&timezone=Europe%2FKyiv&forecast_days=10`);
    if (!response.ok) throw new Error('weather');
    const data = await response.json();
    const current = data.current;
    $('#weatherCurrent').innerHTML = `<div class="temp">${Math.round(current.temperature_2m)}°</div><div><b>Нетішин зараз</b><p>Відчувається ${Math.round(current.apparent_temperature)}° · 💨 ${Math.round(current.wind_speed_10m)} км/год · 💧 ${current.relative_humidity_2m}%</p></div>`;
    $('#forecast').innerHTML = data.daily.time.map((date, index) => `<article class="weather-day"><b>${new Date(`${date}T12:00`).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' })}</b><strong>${Math.round(data.daily.temperature_2m_min[index])}° — ${Math.round(data.daily.temperature_2m_max[index])}°</strong><span>💨 ${Math.round(data.daily.wind_speed_10m_max[index])} км/год</span><span>☔ ${data.daily.precipitation_probability_max[index]}%</span></article>`).join('');
    status.textContent = 'Live data · Open-Meteo';
  } catch {
    status.textContent = 'Weather currently unavailable.';
  }
}

function renderChecklist(items, root) {
  $(root).innerHTML = items.map((item, index) => {
    const emoji = item.split(' ')[0];
    const label = item.slice(item.indexOf(' ') + 1);
    return `<button class="check-card" data-id="${index}" aria-label="Позначити: ${escapeHtml(label)}" aria-pressed="false" type="button"><span aria-hidden="true">${emoji}</span><b>${escapeHtml(label)}</b></button>`;
  }).join('');
  $$('.check-card', $(root)).forEach(card => card.addEventListener('click', () => {
    card.classList.toggle('flipped');
    card.setAttribute('aria-pressed', String(card.classList.contains('flipped')));
  }));
}

function setupChecklist() {
  const render = (items, swim) => {
    renderChecklist(items, '#checklistItems');
    renderChecklist(swim, '#checklistSwim');
    $('#swimBlock').hidden = !swim.length;
  };
  render(DEFAULT_CHECKLIST, DEFAULT_SWIM_CHECKLIST);
  onSnapshot(doc(db, 'checklist', 'items'), snapshot => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    const items = Array.isArray(data.items) && data.items.length ? data.items : DEFAULT_CHECKLIST;
    const swim = Array.isArray(data.swimming) ? data.swimming : DEFAULT_SWIM_CHECKLIST;
    render(items, swim);
  }, () => {});
}

function setupNews() {
  onSnapshot(collection(db, 'news'), snapshot => {
    const items = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => !item.hidden)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    const pinned = items[0];
    const banner = $('#newsBanner');
    if (!pinned) {
      banner.hidden = true;
      banner.textContent = '';
      return;
    }
    banner.hidden = false;
    banner.textContent = pinned.title ? `${pinned.title}: ${pinned.content || pinned.text || ''}` : (pinned.content || pinned.text || '');
  }, () => {});
}

function setupSettings() {
  onSnapshot(doc(db, 'settings', 'main'), snapshot => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    if (data.birthdayDate) state.partyDate = new Date(data.birthdayDate);
    if (data.memoriesModeDate) state.memoriesDate = new Date(data.memoriesModeDate);
    if (data.weatherLat) state.weatherLat = Number(data.weatherLat);
    if (data.weatherLon) state.weatherLon = Number(data.weatherLon);
    loadWeather();
    if (inMemoriesMode()) setupMemoriesMode();
  }, () => {});
}

function setupWishlist() {
  if (inMemoriesMode()) return;
  $('#wishlist').innerHTML = '<div class="locked-wishlist"><div><p class="eyebrow">Wishlist</p><h2>🔒 Wishlist</h2><p>Ще збираю список — зовсім скоро з\'явиться тут ✦</p></div><span class="lock-orbit" aria-hidden="true">✦</span></div>';
}

function setupLocations(guest) {
  let locations = DEFAULT_LOCATIONS;
  // Display order per category now lives in settings/votingOrder (admin drag-and-drop
  // lists) as arrays of restaurant ids, not a per-restaurant numeric field — a place
  // can appear in both, one, or neither list independently. Seed a sensible fallback
  // from DEFAULT_LOCATIONS' own venue field so something reasonable shows before the
  // votingOrder doc has ever loaded (or if it's still empty).
  let order = {
    venue: DEFAULT_LOCATIONS.filter(place => ['out', 'both'].includes(place.venue)).map(place => place.id),
    home: DEFAULT_LOCATIONS.filter(place => ['home', 'both'].includes(place.venue)).map(place => place.id)
  };
  let votes = {}; // placeId -> total vote count (both categories combined tally per place)
  let myVotes = new Map(); // slot ('slot1'|'slot2'|'slot3') -> { placeId, venue }
  let justVotedId = null; // brief pulse on the card just voted for — cleared on a timer, mirrors js/gallery.js's justLikedId
  let venueChoice = ['home', 'out'].includes(localStorage.getItem('partyVenue')) ? localStorage.getItem('partyVenue') : '';

  const paintTabs = () => {
    $$('#venueTabs button').forEach(tab => {
      const selected = tab.dataset.venue === venueChoice;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    $('#venueStepLabel').hidden = !venueChoice;
  };

  const paintVoteHint = () => {
    const hint = $('#voteLimitHint');
    hint.hidden = !venueChoice || inMemoriesMode();
    if (hint.hidden) return;
    const left = MAX_VOTES - myVotes.size;
    hint.textContent = left > 0 ? `Обрано ${myVotes.size} з ${MAX_VOTES} — залишилось голосів: ${left}` : `Максимум обрано (${MAX_VOTES}/${MAX_VOTES}) — знімай голос, щоб обрати інший`;
    hint.classList.toggle('is-full', left <= 0);
  };

  const emojiFor = (category = '') => {
    const c = category.toLowerCase();
    if (c.includes('піца')) return '🍕';
    if (c.includes('італ')) return '🍝';
    if (c.includes('кебаб') || c.includes('шаурма')) return '🌯';
    if (c.includes('суші')) return '🍣';
    if (c.includes('гриль')) return '🔥';
    if (c.includes('україн')) return '🥟';
    return '🍽';
  };

  const myVotedPlaceIds = () => new Set([...myVotes.values()].map(vote => vote.placeId));

  const render = () => {
    paintTabs();
    paintVoteHint();
    const grid = $('#locationGrid');
    if (!venueChoice) {
      grid.innerHTML = '<div class="route-empty venue-hint">✨ Обери формат вище — і побачиш варіанти для голосування.</div>';
      return;
    }
    const orderKey = venueChoice === 'home' ? 'home' : 'venue';
    const byId = Object.fromEntries(locations.map(place => [place.id, place]));
    const visible = (order[orderKey] || [])
      .map(id => byId[id])
      .filter(place => place && place.enabled !== false);
    const total = Object.values(votes).reduce((sum, value) => sum + value, 0) || 1;
    const mine = myVotedPlaceIds();
    const votesUsed = myVotes.size;
    grid.innerHTML = visible.length ? visible.map((place, index) => {
      const result = Math.round((votes[place.id] || 0) / total * 100);
      const photo = place.photos?.[0] || place.photoUrl || '';
      const mapUrl = place.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} Нетішин`)}`;
      const art = photo ? `<img class="place-image" src="${escapeHtml(photo)}" alt="${escapeHtml(place.name)}" loading="lazy">` : `<div class="place-art art-${index % 4}" aria-hidden="true" data-emoji="${emojiFor(place.category)}"></div>`;
      const voted = mine.has(place.id);
      const locked = !voted && votesUsed >= MAX_VOTES;
      const label = inMemoriesMode() ? 'Фінальний результат' : voted ? '✓ Твій голос · зняти' : locked ? 'Ліміт 3 голоси' : 'Голосувати';
      const votePop = place.id === justVotedId ? 'vote-pop' : '';
      return `<article class="place ${photo ? 'has-photo' : ''} ${votePop}">${art}<div class="place-shade"></div><div class="place-content"><span>0${index + 1} <b>${escapeHtml(place.category)}</b></span><h3>${escapeHtml(place.name)}</h3><div class="place-links"><a href="${escapeHtml(place.menuUrl)}" target="_blank" rel="noreferrer">Меню ↗</a><a href="${escapeHtml(mapUrl)}" target="_blank" rel="noreferrer">Мапа ↗</a></div><footer><div class="vote-result" aria-label="${result}% голосів"><strong>♥ ${result}%</strong><div class="vote-progress"><i style="width:${result}%"></i></div></div><button class="vote ${voted ? 'is-voted' : ''}" data-id="${escapeHtml(place.id)}" ${inMemoriesMode() || locked ? 'disabled' : ''} type="button">${label}</button></footer></div></article>`;
    }).join('') : '<div class="route-empty">У цьому форматі поки немає варіантів.</div>';

    $$('.vote', grid).forEach(button => button.addEventListener('click', () => toggleVote(button.dataset.id)));
  };

  const toggleVote = async placeId => {
    const existingSlot = [...myVotes.entries()].find(([, vote]) => vote.placeId === placeId)?.[0];
    try {
      if (existingSlot) {
        await deleteDoc(doc(db, 'votes', `${guest.guestId}_${existingSlot}`));
        toast('Голос знято');
        return;
      }
      if (myVotes.size >= MAX_VOTES) {
        toast(`Максимум ${MAX_VOTES} голоси. Спочатку зніми один.`);
        return;
      }
      const freeSlot = ['slot1', 'slot2', 'slot3'].find(slot => !myVotes.has(slot));
      justVotedId = placeId;
      setTimeout(() => { if (justVotedId === placeId) { justVotedId = null; render(); } }, 450);
      await setDoc(doc(db, 'votes', `${guest.guestId}_${freeSlot}`), {
        guestId: guest.guestId,
        placeId,
        venue: venueChoice || 'out',
        timestamp: serverTimestamp()
      });
      toast('Дякуємо за голос ✦');
    } catch {
      toast('Помилка підключення. Спробуй ще раз.');
    }
  };

  $$('#venueTabs button').forEach(tab => tab.addEventListener('click', () => {
    venueChoice = tab.dataset.venue;
    localStorage.setItem('partyVenue', venueChoice);
    render();
  }));

  onSnapshot(collection(db, 'restaurants'), snapshot => {
    if (!snapshot.empty) locations = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    render();
  }, () => render());

  onSnapshot(doc(db, 'settings', 'votingOrder'), snapshot => {
    const data = snapshot.data();
    if (data?.venue?.length || data?.home?.length) order = { venue: data.venue || [], home: data.home || [] };
    render();
  }, () => render());

  onSnapshot(collection(db, 'votes'), snapshot => {
    votes = {};
    myVotes = new Map();
    snapshot.forEach(item => {
      const data = item.data();
      if (data.placeId) votes[data.placeId] = (votes[data.placeId] || 0) + 1;
      if (data.guestId === guest.guestId) {
        const slot = item.id.slice(guest.guestId.length + 1);
        myVotes.set(slot, { placeId: data.placeId, venue: data.venue });
      }
    });
    render();
  }, () => render());

  render();
}

function setupRoutes() {
  let active = 'Київ';
  let routes = [];

  const render = () => {
    const list = $('#routeList');

    if (inMemoriesMode()) {
      list.classList.remove('route-list-in');
      list.innerHTML = '<div class="route-empty archived">Маршрути архівовано. Дякуємо всім, хто доїхав ❤️</div>';
      return;
    }

    let selection = routes.filter(route => route.city === active);
    if (!selection.length) selection = DEFAULT_ROUTES.filter(route => route.city === active);
    const byDirection = direction => selection
      .filter(route => (route.direction || 'ТУДИ') === direction)
      .sort((a, b) => (a.sortOrder ?? a.order ?? 0) - (b.sortOrder ?? b.order ?? 0) || Number(b.recommended) - Number(a.recommended));

    const trainCard = route => `<article class="route-card ${route.recommended ? 'recommended' : ''}"><div class="route-card-main"><span class="route-label">${escapeHtml(route.direction || 'Маршрут')}${route.dateNote ? ` · ${escapeHtml(route.dateNote)}` : ''}${route.recommended ? ' · ⭐ Найкращий варіант' : ''}</span><h3>🚆 №${escapeHtml(route.trainNumber)}</h3><p class="route-points"><b>${escapeHtml(route.from)}</b><span>→</span><b>${escapeHtml(route.to)}</b></p><div class="route-meta"><span><small>Відправлення</small>${escapeHtml(route.departure)}</span><span><small>Прибуття</small>${escapeHtml(route.arrival)}</span><span><small>У дорозі</small>${escapeHtml(route.duration)}</span><span><small>Пересадки</small>${escapeHtml(route.transfers || 'Прямий')}</span>${route.price ? `<span><small>Від</small>${escapeHtml(route.price)}</span>` : ''}</div></div><div class="route-actions"><button class="button primary buy-ticket" data-route="${encodeURIComponent(JSON.stringify(route))}" type="button">Купити квиток ↗</button><small class="route-hint">Звідки: ${escapeHtml(route.from)} · Куди: ${escapeHtml(route.to)} · Дата: ${escapeHtml(route.date)}</small></div></article>`;

    const group = (label, items) => items.length ? `<h3 class="route-choice-label route-group-label">${label}</h3>${items.map(trainCard).join('')}` : '';

    // Reset animation class first so re-selecting the same city / re-rendering still replays it
    list.classList.remove('route-list-in');
    const there = byDirection('ТУДИ');
    const back = byDirection('НАЗАД');
    list.innerHTML = there.length || back.length
      ? group('Туди · до Кривина', there) + group('Назад · з Кривина', back)
      : '<div class="route-empty">Перевірених маршрутів поки немає. Вони з’являться тут одразу після додавання.</div>';

    // Force a reflow so the animation restarts every time the list is repainted (city switch, live Firestore update, etc.)
    void list.offsetWidth;
    list.classList.add('route-list-in');

    $$('.buy-ticket').forEach(button => button.addEventListener('click', () => openTicketDialog(JSON.parse(decodeURIComponent(button.dataset.route)))));
  };

  $$('#routeTabs button').forEach(button => button.addEventListener('click', () => {
    active = button.dataset.city;
    $$('#routeTabs button').forEach(tab => {
      const selected = tab === button;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    render();
  }));

  onSnapshot(collection(db, 'transport'), snapshot => {
    routes = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    render();
  }, () => render());

  render();
}

function openTicketDialog(route) {
  const dialog = $('#ticketDialog');
  const bookingUrl = route.bookingUrl || 'https://booking.uz.gov.ua/';
  $('#ticketDialogTitle').textContent = `Потяг №${route.trainNumber}`;
  $('#ticketDialogDetails').innerHTML = `<dl><div><dt>Відправлення</dt><dd>${escapeHtml(route.from)}</dd></div><div><dt>Прибуття</dt><dd>${escapeHtml(route.to)}</dd></div><div><dt>Дата</dt><dd>${escapeHtml(route.date)}</dd></div><div><dt>Час</dt><dd>${escapeHtml(route.departure)} → ${escapeHtml(route.arrival)}</dd></div></dl><p>Сайт Укрзалізниці відкрито в новій вкладці. Скопіюй дані, щоб швидше оформити квиток.</p>`;
  $('#copyTicketDetails').onclick = () => copyText(`${route.from} → ${route.to}\nДата: ${route.date}\nПотяг №${route.trainNumber}\n${route.departure} → ${route.arrival}`, 'Дані для квитка скопійовано');
  window.open(bookingUrl, '_blank', 'noopener,noreferrer');
  if (!dialog.open) dialog.showModal();
}

function setupTicketDialog() {
  const dialog = $('#ticketDialog');
  $('#closeTicketDialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}

function setupMemoriesMode() {
  if (!inMemoriesMode()) return;
  document.body.classList.add('memories-mode');
  const gallery = $('#gallery');
  const quick = $('#quick');
  if (gallery && quick) gallery.parentElement.insertBefore(gallery, quick);
  if (quick) quick.hidden = true;
  $('#countdown').hidden = true;
  $('#checklist').hidden = true;
  $('#heroTitle').innerHTML = '❤️ Дякую,<br>що зробили цей день <em>особливим.</em>';
  $('#heroLead').textContent = 'Було дуже круто ❤️ Цей сайт став нашим спільним альбомом спогадів. Додавай улюблені моменти.';
  $('#detailsButton').href = '#gallery';
  $('#detailsButton').innerHTML = 'До спогадів <span>↓</span>';
  $('#wishlist').hidden = true;
  $$('.nav a[href="#wishlist"], .mobile-nav a[href="#wishlist"], .mobile-nav a[href="#checklist"]').forEach(link => { link.hidden = true; });
  $('#transport .section-head .muted').textContent = 'Дякуємо всім, хто приїхав!';
  const desktopGallery = $('.nav nav a[href="#gallery"]');
  if (desktopGallery) {
    desktopGallery.textContent = 'Спогади';
    desktopGallery.parentElement.prepend(desktopGallery);
  }
  $$('.mobile-nav a[href="#gallery"]').forEach(link => {
    const badge = link.querySelector('b');
    link.textContent = '';
    link.append('Спогади ', badge || document.createElement('b'));
    if (badge) badge.textContent = '01';
    link.parentElement.prepend(link);
  });
}

function setupScrollReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Targets the static <section> wrappers, not their dynamically re-rendered
  // inner grids — so a live Firestore update (a new vote, a new photo) can't
  // re-trigger the fade and make the page flicker for someone already there.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px' });
  $$('.section.block').forEach(section => observer.observe(section));
}

setupSettings();
setupCountdown();
loadWeather();
setupNews();
setupChecklist();
setupWishlist();
setupRoutes();
setupTicketDialog();
setupMemoriesMode();
setupScrollReveal();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

ensureGuestIdentity().then(guest => {
  setupInvitation(guest);
  setupLocations(guest);
  new LiveGallery({ guest, toast }).init();
}).catch(() => {
  toast('Не вдалося визначити гостя. Онови сторінку.');
});