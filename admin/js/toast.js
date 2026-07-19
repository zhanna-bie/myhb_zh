const ICONS = { success: '✓', warning: '⚠', error: '✕', info: 'ℹ' };
const DURATION = { success: 3200, warning: 4200, error: 5200, info: 3600 };

/** Toast notification manager with queue support. */
export class ToastManager {
  constructor(root = document.getElementById('toast-root')) {
    this.root = root;
    this.queue = [];
    this.active = 0;
    this.maxVisible = 4;
  }

  /** @param {string} message @param {'success'|'warning'|'error'|'info'} [type] */
  show(message, type = 'info') {
    this.queue.push({ message, type });
    this.flush();
  }

  success(message) { this.show(message, 'success'); }
  warning(message) { this.show(message, 'warning'); }
  error(message) { this.show(message, 'error'); }
  info(message) { this.show(message, 'info'); }

  flush() {
    while (this.active < this.maxVisible && this.queue.length) {
      const item = this.queue.shift();
      this.render(item);
    }
  }

  render({ message, type }) {
    this.active += 1;
    const toast = document.createElement('div');
    toast.className = `admin-toast admin-toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<span class="admin-toast__icon">${ICONS[type]}</span><span class="admin-toast__text">${message}</span><button class="admin-toast__close" aria-label="Закрити">×</button>`;
    this.root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const close = () => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => {
        toast.remove();
        this.active -= 1;
        this.flush();
      }, { once: true });
      setTimeout(() => {
        if (toast.isConnected) {
          toast.remove();
          this.active = Math.max(0, this.active - 1);
          this.flush();
        }
      }, 400);
    };

    toast.querySelector('.admin-toast__close').addEventListener('click', close);
    setTimeout(close, DURATION[type]);
  }
}

export const toast = new ToastManager();
