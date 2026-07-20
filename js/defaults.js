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

// Guidance cards shown per city until real train routes are added in the admin panel
// (collection `transport`). Нетішин не має власної станції — усі маршрути ведуть до
// Славути-1 (~17 км, далі таксі) або через Здолбунів/Шепетівку як вузлову пересадку.
// Розклад орієнтовний (див. .route-disclaimer на сторінці) — реальні номери потягів
// і час варто звірити на uz.gov.ua ближче до дати.
export const DEFAULT_ROUTES = [
  // Київ
  { id: 'kyiv-there-1', city: 'Київ', direction: 'ТУДИ', from: 'Київ-Пасажирський', to: 'Славута-1', date: '22.08.2026', trainNumber: '093', departure: '07:45', arrival: '12:35', duration: '4 год 50 хв', transfers: '1 (Шепетівка)', price: 'від 320 ₴', recommended: true },
  { id: 'kyiv-there-2', city: 'Київ', direction: 'ТУДИ', from: 'Київ-Пасажирський', to: 'Славута-1', date: '22.08.2026', trainNumber: '755 Інтерсіті', departure: '06:50', arrival: '13:10', duration: '6 год 20 хв', transfers: '1 (Здолбунів)', price: 'від 450 ₴' },
  { id: 'kyiv-back-1', city: 'Київ', direction: 'НАЗАД', from: 'Славута-1', to: 'Київ-Пасажирський', date: '23.08.2026', trainNumber: '094', departure: '19:05', arrival: '23:55', duration: '4 год 50 хв', transfers: '1 (Шепетівка)', price: 'від 320 ₴', recommended: true },
  { id: 'kyiv-back-2', city: 'Київ', direction: 'НАЗАД', from: 'Славута-1', to: 'Київ-Пасажирський', date: '23.08.2026', trainNumber: '756 Інтерсіті', departure: '18:20', arrival: '00:40', duration: '6 год 20 хв', transfers: '1 (Здолбунів)', price: 'від 450 ₴' },
  // Львів
  { id: 'lviv-there-1', city: 'Львів', direction: 'ТУДИ', from: 'Львів', to: 'Славута-1', date: '22.08.2026', trainNumber: '133', departure: '08:15', arrival: '11:55', duration: '3 год 40 хв', transfers: '1 (Здолбунів)', price: 'від 280 ₴', recommended: true },
  { id: 'lviv-there-2', city: 'Львів', direction: 'ТУДИ', from: 'Львів', to: 'Славута-1', date: '22.08.2026', trainNumber: '137', departure: '13:40', arrival: '17:30', duration: '3 год 50 хв', transfers: '1 (Здолбунів)', price: 'від 280 ₴' },
  { id: 'lviv-back-1', city: 'Львів', direction: 'НАЗАД', from: 'Славута-1', to: 'Львів', date: '23.08.2026', trainNumber: '134', departure: '19:10', arrival: '22:50', duration: '3 год 40 хв', transfers: '1 (Здолбунів)', price: 'від 280 ₴', recommended: true },
  { id: 'lviv-back-2', city: 'Львів', direction: 'НАЗАД', from: 'Славута-1', to: 'Львів', date: '23.08.2026', trainNumber: '138', departure: '20:45', arrival: '00:35', duration: '3 год 50 хв', transfers: '1 (Здолбунів)', price: 'від 280 ₴' },
  // Вінниця
  { id: 'vinnytsia-there-1', city: 'Вінниця', direction: 'ТУДИ', from: 'Вінниця', to: 'Славута-1', date: '22.08.2026', trainNumber: '087', departure: '08:20', arrival: '12:30', duration: '4 год 10 хв', transfers: '1 (Шепетівка)', price: 'від 300 ₴', recommended: true },
  { id: 'vinnytsia-there-2', city: 'Вінниця', direction: 'ТУДИ', from: 'Вінниця', to: 'Славута-1', date: '22.08.2026', trainNumber: '219', departure: '09:10', arrival: '13:40', duration: '4 год 30 хв', transfers: '1 (Хмельницький)', price: 'від 260 ₴' },
  { id: 'vinnytsia-back-1', city: 'Вінниця', direction: 'НАЗАД', from: 'Славута-1', to: 'Вінниця', date: '23.08.2026', trainNumber: '088', departure: '19:00', arrival: '23:10', duration: '4 год 10 хв', transfers: '1 (Шепетівка)', price: 'від 300 ₴', recommended: true },
  { id: 'vinnytsia-back-2', city: 'Вінниця', direction: 'НАЗАД', from: 'Славута-1', to: 'Вінниця', date: '23.08.2026', trainNumber: '220', departure: '20:15', arrival: '00:45', duration: '4 год 30 хв', transfers: '1 (Хмельницький)', price: 'від 260 ₴' }
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
