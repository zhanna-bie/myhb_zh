import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, ensureGuestSession } from './js/firebase.js';
import { $, $$, escapeHtml } from './js/utils.js';
import { LiveGallery } from './js/gallery.js';

const DEFAULT_PARTY_DATE = '2026-08-23T12:00:00+03:00';
const DEFAULT_MEMORIES_DATE = '2026-08-25T00:00:00+03:00';
const DEFAULT_CHECKLIST = ['😊 Гарний настрій', '🎫 Квитки', '🧳 Речі для ночівлі', '👕 Змінний одяг'];
const DEFAULT_SWIM_CHECKLIST = ['🩱 Купальник', '🧴 SPF', '🏖 Рушник', '🩴 Тапочки'];
const INVITES = { anna: 'Анно', oksana: 'Оксано', nastya: 'Настю', alina: 'Аліно', kris: 'Кріс', bulka: 'Булко', anya: 'Аню', eva: 'Єво', maryna: 'Марино' };
// venue: 'out' — святкування у закладі, 'home' — доставка додому, 'both' — і те, і те.
const DEFAULT_LOCATIONS = [
  { id: 'drova', name: 'Дрова', category: 'Гриль · піца', venue: 'out', menuUrl: 'https://piceriya-drova-netishyn.choiceqr.com/online-menu', mapsUrl: 'https://maps.app.goo.gl/VKrPLR8kP5mp2xsW6' },
  { id: 'la-famiglia', name: 'La Familia', category: 'Італійська', venue: 'out', menuUrl: 'https://expz.menu/091d3b4d-23bb-4965-93d8-4e2602f732b3' },
  { id: 'nonstop', name: 'Non Stop', category: 'Європейська', venue: 'both', menuUrl: 'https://nonstop.choiceqr.com/' },
  { id: 'lisovyi', name: 'Лісовий', category: 'Українська', venue: 'both', menuUrl: 'https://rest-lisovyi-netishyn.choiceqr.com/section:menyu' },
  { id: 'craft-pizza', name: 'Craft', category: 'Піца · суші · бургери', venue: 'home', menuUrl: 'https://menu.ps.me/eYPqnK2Jxq4' },
  { id: 'hamster-kebab', name: 'HAMSTER Кебаб', category: 'Кебаб · шаурма', venue: 'home', menuUrl: 'https://hamster-kebab1.ps.me/' }
];

// Guidance cards shown per city until real train routes are added in the admin
// panel (collection `transport`). `note` marks them as simple text cards.
const DEFAULT_ROUTES = [
  { city: 'Київ', title: '🚆 Потягом', note: 'Шукай прямі потяги Київ → Нетішин на 22–23 серпня в застосунку Укрзалізниці. Якщо прямого немає — бери квиток до Славути чи Здолбунова, звідти ~30–50 км.', origin: 'Київ' },
  { city: 'Київ', title: '🚗 Автомобілем', note: '≈330 км трасою через Житомир і Новоград-Волинський, орієнтовно 4–4.5 години в дорозі.', origin: 'Київ' },
  { city: 'Львів', title: '🚆 Потягом через Здолбунів', note: 'Більшість потягів зі Львова в бік Києва зупиняються у Здолбунові — звідти ~50 км до Нетішина (таксі або скажи нам, зустрінемо).', origin: 'Львів' },
  { city: 'Львів', title: '🚗 Автомобілем', note: '≈270 км через Рівне, орієнтовно 4 години в дорозі.', origin: 'Львів' },
  { city: 'Вінниця', title: '🚆 Потягом через Шепетівку', note: 'Шепетівка — велика вузлова станція за ~45 км від Нетішина; далі приміський потяг на Славуту/Нетішин або авто.', origin: 'Вінниця' },
  { city: 'Вінниця', title: '🚗 Автомобілем', note: '≈220 км через Хмельницький, орієнтовно 3.5 години в дорозі.', origin: 'Вінниця' }
];

const state = {
  partyDate: new Date(DEFAULT_PARTY_DATE),
  memoriesDate: new Date(DEFAULT_MEMORIES_DATE),
  weatherLat: 50.34,
  weatherLon: 26.64
};

function inviteSlug() {
  return location.pathname.match(/\/invite\/([^/]+)/)?.[1]?.toLowerCase() || new URLSearchParams(location.search).get('invite')?.toLowerCase() || '';
}

function visitorId() {
  const slug = inviteSlug();
  if (slug && INVITES[slug]) return `invite-${slug}`;
  let id = localStorage.getItem('partyVisitorId');
  if (!id) {
    id = `guest-${crypto.randomUUID()}`;
    localStorage.setItem('partyVisitorId', id);
  }
  return id;
}

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

function setupInvitation() {
  const name = INVITES[inviteSlug()];
  if (name) $('#inviteGreeting').textContent = `Привіт, ${name}! 👋 РАДІ, ЩО ТИ ТУТ`;
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
  $('#wishlist').innerHTML = '<div class="locked-wishlist"><div><p class="eyebrow">Wishlist</p><h2>🔒 Wishlist</h2><p>Скоро тут з’являться подарунки.<br>Очікуйте оновлення.</p></div><span class="lock-orbit" aria-hidden="true">✦</span></div>';
}

function setupLocations() {
  let locations = DEFAULT_LOCATIONS;
  let votes = {};
  let venueChoice = ['home', 'out'].includes(localStorage.getItem('partyVenue')) ? localStorage.getItem('partyVenue') : '';

  const paintTabs = () => {
    $$('#venueTabs button').forEach(tab => {
      const selected = tab.dataset.venue === venueChoice;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    $('#venueStepLabel').hidden = !venueChoice;
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

  const render = () => {
    paintTabs();
    const grid = $('#locationGrid');
    if (!venueChoice) {
      grid.innerHTML = '<div class="route-empty venue-hint">✨ Обери формат вище — і побачиш варіанти для голосування.</div>';
      return;
    }
    const visible = locations.filter(place => place.enabled !== false && (place.venue || 'out') !== (venueChoice === 'home' ? 'out' : 'home'));
    const total = Object.values(votes).reduce((sum, value) => sum + value, 0) || 1;
    grid.innerHTML = visible.length ? visible.map((place, index) => {
      const result = Math.round((votes[place.id] || 0) / total * 100);
      const photo = place.photos?.[0] || place.photoUrl || '';
      const mapUrl = place.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} Нетішин`)}`;
      const art = photo ? `<img class="place-image" src="${escapeHtml(photo)}" alt="${escapeHtml(place.name)}" loading="lazy">` : `<div class="place-art art-${index % 4}" aria-hidden="true" data-emoji="${emojiFor(place.category)}"></div>`;
      return `<article class="place ${photo ? 'has-photo' : ''}">${art}<div class="place-shade"></div><div class="place-content"><span>0${index + 1} <b>${escapeHtml(place.category)}</b></span><h3>${escapeHtml(place.name)}</h3><div class="place-links"><a href="${escapeHtml(place.menuUrl)}" target="_blank" rel="noreferrer">Меню ↗</a><a href="${escapeHtml(mapUrl)}" target="_blank" rel="noreferrer">Мапа ↗</a></div><footer><div class="vote-result" aria-label="${result}% голосів"><strong>♥ ${result}%</strong><div class="vote-progress"><i style="width:${result}%"></i></div></div><button class="vote" data-id="${escapeHtml(place.id)}" ${inMemoriesMode() ? 'disabled' : ''} type="button">${inMemoriesMode() ? 'Фінальний результат' : 'Голосувати'}</button></footer></div></article>`;
    }).join('') : '<div class="route-empty">У цьому форматі поки немає варіантів.</div>';

    $$('.vote', grid).forEach(button => button.addEventListener('click', () => castVote(button.dataset.id)));
  };

  const castVote = async id => {
    try {
      await runTransaction(db, async transaction => {
        const reference = doc(db, 'votes', visitorId());
        if ((await transaction.get(reference)).exists()) throw new Error('already-voted');
        transaction.set(reference, { invitationId: visitorId(), type: 'restaurant', restaurant: id, venue: venueChoice || 'out', timestamp: serverTimestamp() });
      });
      toast('Дякуємо за голос ✦');
    } catch (error) {
      toast(error.message === 'already-voted' ? 'Твій голос уже врахований.' : 'Помилка підключення. Спробуй ще раз.');
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

  onSnapshot(collection(db, 'votes'), snapshot => {
    votes = {};
    snapshot.forEach(item => {
      const id = item.data().restaurant || item.data().locationId;
      if (id) votes[id] = (votes[id] || 0) + 1;
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

    let selection = routes.filter(route => route.city === active).sort((a, b) => (a.sortOrder ?? a.order ?? 0) - (b.sortOrder ?? b.order ?? 0) || Number(b.recommended) - Number(a.recommended));
    if (!selection.length) selection = DEFAULT_ROUTES.filter(route => route.city === active);

    const simpleCard = route => `<article class="route-card route-simple"><div class="route-card-main"><span class="route-label">Рекомендація</span><h3>${escapeHtml(route.title)}</h3><p class="route-note">${escapeHtml(route.note)}</p></div><div class="route-actions"><a class="copy-route" href="https://booking.uz.gov.ua/" target="_blank" rel="noreferrer">Розклад УЗ ↗</a><a class="button primary" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(route.origin)}&destination=${encodeURIComponent('Нетішин')}" target="_blank" rel="noreferrer">Маршрут на мапі ↗</a></div></article>`;
    const trainCard = route => `<article class="route-card ${route.recommended ? 'recommended' : ''}"><div class="route-card-main"><span class="route-label">${escapeHtml(route.direction || 'Маршрут')}${route.recommended ? ' · ⭐ Найкращий варіант' : ''}</span><h3>🚆 №${escapeHtml(route.trainNumber)}</h3><p class="route-points"><b>${escapeHtml(route.from)}</b><span>→</span><b>${escapeHtml(route.to)}</b></p><div class="route-meta"><span><small>Відправлення</small>${escapeHtml(route.departure)}</span><span><small>Прибуття</small>${escapeHtml(route.arrival)}</span><span><small>У дорозі</small>${escapeHtml(route.duration)}</span><span><small>Пересадки</small>${escapeHtml(route.transfers || 'Прямий')}</span>${route.price ? `<span><small>Від</small>${escapeHtml(route.price)}</span>` : ''}</div></div><div class="route-actions"><button class="copy-route" data-route="${encodeURIComponent(JSON.stringify(route))}" type="button">Скопіювати маршрут</button><button class="button primary buy-ticket" data-route="${encodeURIComponent(JSON.stringify(route))}" type="button">Купити квиток ↗</button></div></article>`;

    // Reset animation class first so re-selecting the same city / re-rendering still replays it
    list.classList.remove('route-list-in');
    list.innerHTML = selection.map(route => route.note ? simpleCard(route) : trainCard(route)).join('');

    // Force a reflow so the animation restarts every time the list is repainted (city switch, live Firestore update, etc.)
    void list.offsetWidth;
    list.classList.add('route-list-in');

    $$('.copy-route').forEach(button => {
      if (!button.dataset.route) return; // simple guidance cards use plain links here
      button.addEventListener('click', async () => {
        const route = JSON.parse(decodeURIComponent(button.dataset.route));
        copyText(`${route.from} → ${route.to}\nДата: ${route.date}\nПотяг №${route.trainNumber}`, 'Маршрут скопійовано');
      });
    });

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

setupInvitation();
setupSettings();
setupCountdown();
loadWeather();
setupNews();
setupChecklist();
setupWishlist();
setupLocations();
setupRoutes();
setupTicketDialog();
setupMemoriesMode();
ensureGuestSession().then(user => {
  new LiveGallery({ ownerId: user.uid, displayName: INVITES[inviteSlug()] || 'Гість', toast }).init();
}).catch(() => {
  new LiveGallery({ ownerId: null, displayName: INVITES[inviteSlug()] || 'Гість', toast }).init();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});