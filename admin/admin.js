import { initAuth } from './auth.js';
import { destroyDashboard, renderDashboard } from './dashboard.js';
import { destroyGallery, renderGalleryAdmin } from './gallery.js';
import { destroyRestaurants, renderRestaurants } from './restaurants.js';
import { destroyRoutes, renderRoutes } from './routes.js';
import { destroyNews, renderNews } from './news.js';
import { destroyWishlist, renderWishlist } from './wishlist.js';
import { destroyVotes, renderVotes } from './votes.js';
import { destroySettings, renderGuests, renderSettings } from './settings.js';
import { $, $$, setActiveNav } from './helpers.js';

const destroyers = {
  dashboard: destroyDashboard,
  gallery: destroyGallery,
  restaurants: destroyRestaurants,
  routes: destroyRoutes,
  news: destroyNews,
  wishlist: destroyWishlist,
  votes: destroyVotes,
  settings: destroySettings,
  guests: destroySettings
};

const renderers = {
  dashboard: renderDashboard,
  gallery: user => renderGalleryAdmin(user),
  restaurants: renderRestaurants,
  routes: renderRoutes,
  news: renderNews,
  wishlist: renderWishlist,
  votes: renderVotes,
  settings: renderSettings,
  guests: renderGuests
};

let currentView = 'dashboard';
let currentUser = null;

function destroyCurrentView() {
  destroyers[currentView]?.();
}

function navigate(view) {
  if (!renderers[view]) return;
  destroyCurrentView();
  currentView = view;
  setActiveNav(null, view);
  renderers[view](currentUser);
  if (window.innerWidth < 960) $('#sidebar').classList.remove('open');
}

function bindNavigation() {
  $$('[data-view]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      navigate(link.dataset.view);
    });
  });

  $('#sidebarToggle')?.addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  $('#sidebarBackdrop')?.addEventListener('click', () => {
    $('#sidebar').classList.remove('open');
  });
}

initAuth(user => {
  if (!user) return;
  currentUser = user;
  bindNavigation();
  navigate('dashboard');
});
