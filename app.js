import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './js/firebase.js';
import { $, $$, escapeHtml } from './js/utils.js';
import { LiveGallery } from './js/gallery.js';

const PARTY_DATE = new Date('2026-08-23T12:00:00+03:00');
const MEMORIES_DATE = new Date('2026-08-25T00:00:00+03:00');
const INVITES = { anna:'Анно', oksana:'Оксано', nastya:'Настю', alina:'Аліно', kris:'Кріс', bulka:'Булко', anya:'Аню', eva:'Єво', maryna:'Марино' };
const CHECKLIST = ['😊 Гарний настрій','🎫 Квитки','🧳 Речі для ночівлі','👕 Змінний одяг','🩴 Тапочки','🩱 Купальник','🧴 SPF','🏖 Рушник','🔋 Павербанк','💧 Вода'];
const DEFAULT_LOCATIONS = [{id:'drova',name:'Дрова',category:'Гриль · піца',menuUrl:'https://piceriya-drova-netishyn.choiceqr.com/online-menu',mapsUrl:'https://maps.app.goo.gl/VKrPLR8kP5mp2xsW6'},{id:'la-famiglia',name:'La Familia',category:'Італійська',menuUrl:'https://expz.menu/091d3b4d-23bb-4965-93d8-4e2602f732b3'},{id:'nonstop',name:'Non Stop',category:'Європейська',menuUrl:'https://nonstop.choiceqr.com/'},{id:'lisovyi',name:'Лісовий',category:'Українська',menuUrl:'https://rest-lisovyi-netishyn.choiceqr.com/section:menyu'},{id:'khutorok',name:'Хуторок',category:'Українська',menuUrl:'https://www.instagram.com/p/CfwKMILogTG/?img_index=3'}];

function inviteSlug() { return location.pathname.match(/\/invite\/([^/]+)/)?.[1]?.toLowerCase() || new URLSearchParams(location.search).get('invite')?.toLowerCase() || ''; }
function visitorId() { const slug = inviteSlug(); if (slug && INVITES[slug]) return `invite-${slug}`; let id = localStorage.getItem('partyVisitorId'); if (!id) { id = `guest-${crypto.randomUUID()}`; localStorage.setItem('partyVisitorId', id); } return id; }
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 3000); }
function inMemoriesMode() { return new Date() >= MEMORIES_DATE; }

function setupEntrance() {
  $('#enterBtn').addEventListener('click', () => { $('#gate').classList.add('out'); setTimeout(() => { $('#gate').hidden = true; $('#app').hidden = false; window.scrollTo({ top: 0 }); }, 650); });
  const menu = $('#menuBtn');
  menu.addEventListener('click', () => { const open = $('#mobileNav').classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('menu-open', open); });
  $$('.mobile-nav a').forEach(link => link.addEventListener('click', () => $('#mobileNav').classList.remove('open')));
}

function setupInvitation() {
  const name = INVITES[inviteSlug()];
  if (name) $('#inviteGreeting').textContent = `Привіт, ${name}! 👋 РАДІ БАЧИТИ ТЕБЕ НА МІСІЇ`;
}

function setupCountdown() {
  const tick = () => { const difference = Math.max(0, PARTY_DATE - Date.now()); const values = [['days', 86400000, 3], ['hours', 3600000, 2], ['mins', 60000, 2], ['secs', 1000, 2]]; values.forEach(([id, unit, digits]) => { const value = Math.floor(difference / unit) % (id === 'days' ? Infinity : id === 'hours' ? 24 : 60); $(`#${id}`).textContent = String(value).padStart(digits, '0'); }); if (!difference) $('#countdownTitle').innerHTML = 'Mission <em>has begun</em>'; };
  tick(); setInterval(tick, 1000);
}

async function loadWeather() {
  const status = $('#weatherStatus');
  try { const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=50.34&longitude=26.64&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code,wind_speed_10m_max&timezone=Europe%2FKyiv&forecast_days=10'); if (!response.ok) throw new Error(); const data = await response.json(); const current = data.current; $('#weatherCurrent').innerHTML = `<div class="temp">${Math.round(current.temperature_2m)}°</div><div><b>Нетішин зараз</b><p>Відчувається ${Math.round(current.apparent_temperature)}° · 💨 ${Math.round(current.wind_speed_10m)} км/год · 💧 ${current.relative_humidity_2m}%</p></div>`; $('#forecast').innerHTML = data.daily.time.map((date, index) => `<article class="weather-day"><b>${new Date(`${date}T12:00`).toLocaleDateString('uk-UA',{weekday:'short',day:'numeric',month:'short'})}</b><strong>${Math.round(data.daily.temperature_2m_min[index])}° — ${Math.round(data.daily.temperature_2m_max[index])}°</strong><span>💨 ${Math.round(data.daily.wind_speed_10m_max[index])} км/год</span><span>☔ ${data.daily.precipitation_probability_max[index]}%</span></article>`).join(''); status.textContent = 'Live data · Open-Meteo'; } catch { status.textContent = 'Weather currently unavailable.'; } }

function setupChecklist() { $('#checklistItems').innerHTML = CHECKLIST.map((item, index) => `<button class="check-card" data-id="${index}" aria-pressed="false"><span>${item.split(' ')[0]}</span><b>${item.slice(item.indexOf(' ') + 1)}</b></button>`).join(''); $$('.check-card').forEach(card => card.addEventListener('click', () => { card.classList.toggle('flipped'); card.setAttribute('aria-pressed', card.classList.contains('flipped')); })); }

function setupLocations() {
  let locations = DEFAULT_LOCATIONS; let votes = {};
  const render = () => { const total = Object.values(votes).reduce((sum, value) => sum + value, 0) || 1; $('#locationGrid').innerHTML = locations.map((place, index) => { const result = Math.round((votes[place.id] || 0) / total * 100); const photo = place.photos?.[0] ? `style="background-image:url('${escapeHtml(place.photos[0])}')"` : ''; return `<article class="place" ${photo}><span>0${index + 1} / ${escapeHtml(place.category)}</span><h3>${escapeHtml(place.name)}</h3><div class="place-links"><a href="${escapeHtml(place.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' Нетішин')}`)}" target="_blank" rel="noreferrer">Google Maps ↗</a><a href="${escapeHtml(place.menuUrl)}" target="_blank" rel="noreferrer">Меню ↗</a></div><footer><div class="vote-progress"><i style="width:${result}%"></i><span>★ ${result}%</span></div><button class="vote" data-id="${escapeHtml(place.id)}" ${inMemoriesMode() ? 'disabled' : ''}>${inMemoriesMode() ? 'Фінальний результат' : 'Голосувати'}</button></footer></article>`; }).join(''); $$('.vote').forEach(button => button.addEventListener('click', () => castVote(button.dataset.id))); };
  const castVote = async id => { try { await runTransaction(db, async transaction => { const reference = doc(db, 'votes', visitorId()); if ((await transaction.get(reference)).exists()) throw new Error('already-voted'); transaction.set(reference, { invitationId: visitorId(), type: 'restaurant', restaurant: id, timestamp: serverTimestamp() }); }); toast('Дякуємо за голос ✦'); } catch (error) { toast(error.message === 'already-voted' ? 'Твій голос уже врахований.' : 'Помилка підключення. Спробуй ще раз.'); } };
  onSnapshot(collection(db, 'restaurants'), snapshot => { if (!snapshot.empty) locations = snapshot.docs.map(item => ({ id: item.id, ...item.data() })); render(); });
  onSnapshot(collection(db, 'votes'), snapshot => { votes = {}; snapshot.forEach(item => { const id = item.data().restaurant || item.data().locationId; if (id) votes[id] = (votes[id] || 0) + 1; }); render(); }); render();
}

function setupRoutes() { let active = 'Київ'; let routes = []; const render = () => { const selection = routes.filter(route => route.city === active).sort((a,b) => Number(b.recommended) - Number(a.recommended)); $('#routeList').innerHTML = selection.length ? selection.map(route => `<article class="route-card ${route.recommended ? 'recommended' : ''}"><div><span class="route-label">${route.recommended ? '✦ РЕКОМЕНДОВАНО' : escapeHtml(route.direction || 'МАРШРУТ')}</span><h3>№${escapeHtml(route.trainNumber)} · ${escapeHtml(route.from)} → ${escapeHtml(route.to)}</h3><div class="route-meta"><span>${escapeHtml(route.date)}</span><span>${escapeHtml(route.departure)} → ${escapeHtml(route.arrival)}</span><span>${escapeHtml(route.duration)}</span><span>${escapeHtml(route.transfers || 'Прямий')}</span></div></div><div class="route-actions"><button class="copy-route" data-route="${encodeURIComponent(JSON.stringify(route))}">Копіювати</button><a class="button primary" href="${escapeHtml(route.bookingUrl || 'https://booking.uz.gov.ua/')}" target="_blank" rel="noreferrer">Купити ↗</a></div></article>`).join('') : '<div class="route-empty">Перевірені маршрути незабаром з’являться тут.</div>'; $$('.copy-route').forEach(button => button.addEventListener('click', async () => { const route = JSON.parse(decodeURIComponent(button.dataset.route)); await navigator.clipboard.writeText(`${route.from} → ${route.to}\n${route.date}\nПотяг №${route.trainNumber}`); toast('Маршрут скопійовано'); })); };
  $$('#routeTabs button').forEach(button => button.addEventListener('click', () => { active = button.dataset.city; $$('#routeTabs button').forEach(tab => tab.classList.toggle('selected', tab === button)); render(); })); onSnapshot(collection(db, 'transport'), snapshot => { routes = snapshot.docs.map(item => item.data()); render(); }); render(); }

function setupMemoriesMode() { if (!inMemoriesMode()) return; document.body.classList.add('memories-mode'); $('#gallery').parentElement.insertBefore($('#gallery'), $('#quick').nextSibling); $('#countdown').hidden = true; $('#checklist').hidden = true; $('#heroTitle').innerHTML = '❤️<br>Дякуємо, що зробили цей день <em>незабутнім.</em>'; $('#heroLead').textContent = 'Цей сайт став нашим спільним альбомом спогадів. Додавай улюблені моменти.'; $('#detailsButton').href = '#gallery'; $('#detailsButton').innerHTML = 'До спогадів <span>↓</span>'; $('#wishlist').innerHTML = '<div class="locked-wishlist archived"><div><p class="eyebrow">WISHLIST / ARCHIVED</p><h2>🎁 Wishlist <em>closed</em></h2><p>Дякуємо за кожен подарунок ❤️</p></div></div>'; $('#transport .section-head .muted').textContent = 'Дякуємо всім, хто приїхав!'; $$('.nav nav a, .mobile-nav a').forEach(link => { if (link.getAttribute('href') === '#gallery') link.textContent = 'Спогади'; }); }

setupEntrance(); setupInvitation(); setupCountdown(); loadWeather(); setupChecklist(); setupLocations(); setupRoutes(); setupMemoriesMode();
new LiveGallery({ visitor: visitorId(), displayName: INVITES[inviteSlug()] || 'Гість', toast }).init();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
