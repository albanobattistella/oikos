/**
 * Shared sticky sub-tab bar (pill-style).
 * Used by kitchen modules and settings; extend to any future sub-module nav.
 *
 * @param {HTMLElement} anchorEl  - element relative to which the bar is inserted
 * @param {object}      opts
 * @param {Array<{id: string, label: string, icon?: string, separatorBefore?: boolean}>} opts.tabs
 * @param {string}      opts.activeId          - initially active tab id
 * @param {Function}    opts.onChange          - called with new id on tab switch
 * @param {string}      [opts.storageKey]      - sessionStorage key for persistence
 * @param {string}      [opts.extraClass]      - additional CSS class on bar element
 * @param {string}      [opts.ariaLabel]
 * @param {InsertPosition} [opts.insertPosition='afterbegin']
 * @returns {HTMLElement} the rendered bar element
 */
let subTabsCounter = 0;

export function renderSubTabs(anchorEl, {
  tabs,
  activeId,
  onChange,
  storageKey,
  extraClass,
  ariaLabel,
  insertPosition = 'afterbegin',
}) {
  let current = activeId;

  if (storageKey) {
    try { sessionStorage.setItem(storageKey, current); } catch { /* ignore */ }
  }

  const bar = document.createElement('div');
  const barId = `sub-tabs-${++subTabsCounter}`;
  bar.className = 'sub-tabs-bar' + (extraClass ? ' ' + extraClass : '');
  bar.setAttribute('role', 'tablist');
  if (ariaLabel) bar.setAttribute('aria-label', ariaLabel);

  for (const { id, label, icon, separatorBefore } of tabs) {
    if (separatorBefore) {
      const sep = document.createElement('span');
      sep.className = 'sub-tabs-separator';
      sep.setAttribute('aria-hidden', 'true');
      bar.appendChild(sep);
    }

    const btn = document.createElement('button');
    const safeId = safeDomId(id);
    const tabId = `${barId}-tab-${safeId}`;
    const panelId = `${barId}-panel-${safeId}`;
    btn.type = 'button';
    btn.id = tabId;
    btn.className = 'sub-tab' + (id === current ? ' sub-tab--active' : '');
    btn.dataset.tabId = id;
    btn.dataset.panelId = panelId;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', id === current ? 'true' : 'false');
    btn.setAttribute('aria-controls', panelId);

    if (icon) {
      const i = document.createElement('i');
      i.dataset.lucide = icon;
      i.className = 'sub-tab__icon';
      i.setAttribute('aria-hidden', 'true');
      btn.appendChild(i);
    }

    const span = document.createElement('span');
    span.className = 'sub-tab__label';
    span.textContent = label;
    btn.appendChild(span);

    bar.appendChild(btn);
  }

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab-id]');
    if (!btn || btn.dataset.tabId === current) return;

    current = btn.dataset.tabId;

    if (storageKey) {
      try { sessionStorage.setItem(storageKey, current); } catch { /* ignore */ }
    }

    bar.querySelectorAll('[data-tab-id]').forEach((b) => {
      const active = b.dataset.tabId === current;
      b.classList.toggle('sub-tab--active', active);
      b.setAttribute('aria-selected', String(active));
    });
    syncTabPanels(anchorEl, bar, current);

    onChange(current);
  });

  anchorEl.insertAdjacentElement(insertPosition, bar);
  syncTabPanels(anchorEl, bar, current);

  if (window.lucide) window.lucide.createIcons({ el: bar });

  return bar;
}

function safeDomId(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tab';
}

function syncTabPanels(anchorEl, bar, current) {
  const root = anchorEl.closest('.page') ?? anchorEl.parentElement;
  if (!root) return;

  bar.querySelectorAll('[data-tab-id]').forEach((btn) => {
    const panel = Array.from(root.querySelectorAll('[data-panel]'))
      .find((candidate) => candidate.dataset.panel === btn.dataset.tabId);
    if (!panel) return;

    const active = btn.dataset.tabId === current;
    panel.id = btn.dataset.panelId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', btn.id);
    panel.hidden = !active;
  });
}
