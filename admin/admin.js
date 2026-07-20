import { initAuth } from './js/auth.js';
import { destroyDashboard, renderDashboard } from './js/dashboard.js';
import { destroyGallery, renderGalleryAdmin } from './js/gallery.js';
import { destroyRestaurants, renderRestaurants } from './js/restaurants.js';
import { destroyRoutes, renderRoutes } from './js/routes.js';
import { destroyNews, renderNews } from './js/news.js';
import { destroyWishlist, renderWishlist } from './js/wishlist.js';
import { destroyVotes, renderVotes } from './js/votes.js';
import { destroySettings, renderSettings } from './js/settings.js';
import { $, $$, setActiveNav } from './js/helpers.js';

const destroyers = {
  dashboard: destroyDashboard,
  gallery: destroyGallery,
  restaurants: destroyRestaurants,
  routes: destroyRoutes,
  news: destroyNews,
  wishlist: destroyWishlist,
  votes: destroyVotes,
  settings: destroySettings
};

const renderers = {
  dashboard: renderDashboard,
  gallery: user => renderGalleryAdmin(user),
  restaurants: renderRestaurants,
  routes: renderRoutes,
  news: renderNews,
  wishlist: renderWishlist,
  votes: renderVotes,
  settings: renderSettings
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
  // Show which account is signed in — permission problems are then self-evident.
  const meta = $('.topbar-meta strong');
  if (meta) meta.textContent = user.email;
  bindNavigation();
  navigate('dashboard');
});
