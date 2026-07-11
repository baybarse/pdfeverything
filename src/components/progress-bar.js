/* ============================================================
   Progress Bar Component
   Animated progress indicator with label and percentage
   ============================================================ */

/**
 * Create a progress bar component.
 * Optionally mount into a parent container.
 *
 * @param {HTMLElement} [container]
 * @returns {{ element: HTMLElement, el: HTMLElement, setProgress: Function, set: Function, update: Function, show: Function, hide: Function, reset: Function, destroy: Function }}
 */
export function createProgressBar(container) {
  const el = document.createElement('div');
  el.className = 'progress-container';
  el.innerHTML = `
    <div class="progress-info">
      <span class="progress-label">Processing...</span>
      <span class="progress-percent">0%</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill" style="width: 0%"></div>
    </div>
  `;

  const label = el.querySelector('.progress-label');
  const percent = el.querySelector('.progress-percent');
  const fill = el.querySelector('.progress-fill');

  const api = {
    element: el,
    el,
    setProgress(value, message) {
      const clamped = Math.min(100, Math.max(0, value));
      fill.style.width = `${clamped}%`;
      percent.textContent = `${Math.round(clamped)}%`;
      if (message) label.textContent = message;
    },
    set(value, message) {
      api.setProgress(value, message);
    },
    update(value, message) {
      api.setProgress(value, message);
    },
    show() {
      el.classList.add('visible');
    },
    hide() {
      el.classList.remove('visible');
    },
    reset() {
      fill.style.width = '0%';
      percent.textContent = '0%';
      label.textContent = 'Processing...';
    },
    destroy() {
      api.hide();
      api.reset();
    },
  };

  if (container) container.appendChild(el);

  return api;
}
