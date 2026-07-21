// Shared seed content for the public site (fallback while Firestore is empty)
// and the admin panel (one-time seeding into Firestore — see admin/js/seed.js).
// Keeping this in one place means the public fallback and the admin's initial
// Firestore data can never drift apart.

// venue: 'out' — святкування у закладі, 'home' — доставка додому, 'both' — і те, і те.
export const DEFAULT_LOCATIONS = [
  { id: 'drova', name: 'Дрова', category: 'Гриль · піца', venue: 'out', menuUrl: 'https://piceriya-drova-netishyn.choiceqr.com/online-menu', mapsUrl: 'https://maps.app.goo.gl/VKrPLR8kP5mp2xsW6' },
  { id: 'la-famiglia', name: 'La Familia', category: 'Італійська', venue: 'out', menuUrl: 'https://expz.menu/091d3b4d-23bb-4965-93d8-4e2602f732b3' },
  { id: 'nonstop', name: 'Non Stop', category: 'Європейська', venue: 'both', menuUrl: 'https://nonstop.choiceqr.com/' },
  { id: 'lisovyi', name: 'Лісовий', category: 'Українська', venue: 'both', menuUrl: 'https://rest-lisovyi-netishyn.choiceqr.com/section:menyu' },
  { id: 'craft-pizza', name: 'Craft', category: 'Піца · суші · бургери', venue: 'home', menuUrl: 'https://menu.ps.me/eYPqnK2Jxq4' },
  { id: 'hamster-kebab', name: 'HAMSTER Кебаб', category: 'Кебаб · шаурма', venue: 'home', menuUrl: 'https://hamster-kebab1.ps.me/' }
];

// Real researched routes to Кривин (Нетішин has no station of its own; Кривин is
// the actual stop closest to town). Sources: poizdato.net full stop-by-stop
// schedules for train №78 (Одеса—Ковель, daily) and №107 (Solotvyno—Kyiv-Pas,
// SPECIAL/irregular calendar — flagged in `transfers`). Times are as published;
// always re-check the exact running-day calendar on uz.gov.ua before buying,
// see .route-disclaimer on the page.
// `direction` stays exactly 'ТУДИ'/'НАЗАД' — that's the grouping key the public
// site filters on. `dateNote` is optional extra clarity shown next to it (e.g.
// overnight journeys where the boarding date isn't the same as the event day).
export const DEFAULT_ROUTES = [
  // Київ — потяг №78 не заходить у Київ напряму, тож ніч перед святом їдемо
  // на Вінницю звичайним потягом і там пересідаємо на нього.
  { id: 'kyiv-there-1', city: 'Київ', direction: 'ТУДИ', dateNote: 'виїзд 21.08 ввечері', from: 'Київ-Пасажирський', to: 'Кривин', date: '21.08.2026', trainNumber: '103 → 78', departure: '22:42', arrival: '07:29', duration: '8 год 47 хв', transfers: '1 (Вінниця, ~50 хв)', price: 'від 350 ₴', recommended: true },
  { id: 'kyiv-there-2', city: 'Київ', direction: 'ТУДИ', dateNote: 'виїзд 21.08 ввечері', from: 'Київ-Пасажирський', to: 'Кривин', date: '21.08.2026', trainNumber: '81 → 78', departure: '23:28', arrival: '07:29', duration: '8 год 01 хв', transfers: '1 (Вінниця, ~28 хв — тісніше)', price: 'від 350 ₴' },
  { id: 'kyiv-back-1', city: 'Київ', direction: 'НАЗАД', dateNote: 'нічний, вже після півночі', from: 'Кривин', to: 'Київ-Пасажирський', date: '24.08.2026', trainNumber: '98', departure: '00:52', arrival: '05:55', duration: '5 год 03 хв', transfers: 'Прямий, без пересадки', price: 'від 320 ₴', recommended: true },
  { id: 'kyiv-back-2', city: 'Київ', direction: 'НАЗАД', dateNote: 'виїзд одразу після 18:00', from: 'Кривин', to: 'Київ-Пасажирський', date: '23.08.2026', trainNumber: '78 + пересадка', departure: '22:14', arrival: '~05:30', duration: '~7 год', transfers: '1 (Вінниця о 02:23, далі часті потяги)', price: 'орієнтовно' },
  // Львів — пряме сполучення є лише через потяг №107, що ходить НЕ щодня
  // (особливий графік) — обов'язково звір конкретну дату на uz.gov.ua.
  { id: 'lviv-there-1', city: 'Львів', direction: 'ТУДИ', from: 'Львів', to: 'Кривин', date: '22.08.2026', trainNumber: '107', departure: '04:16', arrival: '07:22', duration: '3 год 06 хв', transfers: 'Прямий · ⚠️ перевір дні курсування', price: 'орієнтовно', recommended: true },
  { id: 'lviv-back-1', city: 'Львів', direction: 'НАЗАД', from: 'Кривин', to: 'Львів', date: '23.08.2026', trainNumber: '107', departure: '20:00', arrival: '22:51', duration: '2 год 51 хв', transfers: 'Прямий · ⚠️ перевір дні курсування', price: 'орієнтовно', recommended: true },
  // Вінниця — потяг №78 йде прямо через Вінницю, без пересадок.
  { id: 'vinnytsia-there-1', city: 'Вінниця', direction: 'ТУДИ', dateNote: 'виїзд вночі 22.08', from: 'Вінниця', to: 'Кривин', date: '22.08.2026', trainNumber: '78', departure: '02:22', arrival: '07:29', duration: '5 год 07 хв', transfers: 'Прямий, без пересадки', price: 'від 250 ₴', recommended: true },
  { id: 'vinnytsia-back-1', city: 'Вінниця', direction: 'НАЗАД', dateNote: 'приїзд вночі 24.08', from: 'Кривин', to: 'Вінниця', date: '23.08.2026', trainNumber: '78', departure: '22:14', arrival: '02:23', duration: '4 год 09 хв', transfers: 'Прямий, без пересадки', price: 'від 250 ₴', recommended: true }
];

export const DEFAULT_CHECKLIST = ['😊 Гарний настрій', '🎫 Квитки', '🧳 Речі для ночівлі', '👕 Змінний одяг'];
export const DEFAULT_SWIM_CHECKLIST = ['🩱 Купальник', '🧴 SPF', '🏖 Рушник', '🩴 Тапочки'];

export const DEFAULT_SETTINGS = {
  birthdayDate: '2026-08-22T12:00:00+03:00',
  memoriesModeDate: '2026-08-24T00:00:00+03:00',
  weatherLat: '50.34',
  weatherLon: '26.64',
  cloudinaryCloudName: 'mh1qp8ls',
  cloudinaryUploadPreset: 'gallery_upload',
  galleryPageSize: '20'
};
