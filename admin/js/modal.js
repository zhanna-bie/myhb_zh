import { escapeHtml } from '../../js/utils.js';

/** Reusable modal system for confirm, edit, preview, and settings dialogs. */
export class ModalManager {
  constructor(root = document.getElementById('modal-root')) {
    this.root = root;
    this.openModal = null;
    this.root.addEventListener('click', event => {
      if (event.target === this.root || event.target.closest('[data-modal-close]')) this.close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.openModal) this.close();
    });
  }

  /**
   * @param {{ title: string, body: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} options
   * @returns {Promise<boolean>}
   */
  confirm({ title, body, confirmLabel = 'Підтвердити', cancelLabel = 'Скасувати', danger = false }) {
    return new Promise(resolve => {
      this.open({
        title,
        body: `<p class="modal-text">${body}</p>`,
        footer: `
          <button class="button ghost" data-modal-close type="button">${escapeHtml(cancelLabel)}</button>
          <button class="button ${danger ? 'danger' : 'primary'}" data-modal-confirm type="button">${escapeHtml(confirmLabel)}</button>
        `,
        onMount: panel => {
          panel.querySelector('[data-modal-confirm]').addEventListener('click', () => {
            this.close();
            resolve(true);
          });
          panel.querySelectorAll('[data-modal-close]').forEach(button => {
            button.addEventListener('click', () => resolve(false), { once: true });
          });
        }
      });
    });
  }

  /**
   * @param {{ title: string, body: string, footer?: string, size?: string, onMount?: (panel: HTMLElement) => void }} options
   */
  open({ title, body, footer = '', size = '', onMount }) {
    this.close();
    this.root.hidden = false;
    this.root.innerHTML = `
      <div class="modal-backdrop" aria-hidden="true"></div>
      <div class="modal-panel ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal-header">
          <h2 id="modal-title">${escapeHtml(title)}</h2>
          <button class="modal-close" data-modal-close type="button" aria-label="Закрити">×</button>
        </header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}
      </div>
    `;
    this.openModal = this.root.querySelector('.modal-panel');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => this.root.classList.add('show'));
    onMount?.(this.openModal);
  }

  close() {
    if (!this.openModal) return;
    this.root.classList.remove('show');
    document.body.classList.remove('modal-open');
    setTimeout(() => {
      this.root.hidden = true;
      this.root.innerHTML = '';
      this.openModal = null;
    }, 220);
  }
}

export const modal = new ModalManager();
