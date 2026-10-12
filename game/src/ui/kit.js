// Front-end UI kit shared by the menu / lobby / settings / pause / results screens: DOM helpers, the
// Screen base class, headers, dialogs (alert / confirm / progress / custom), UI toasts, the loading
// screen and a few inline icons. Styles live in game/style.css ("front-end" section, #fe ...).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Builds one element from an HTML string. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 16V4h12" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2.4"/></svg>',
  hash: '<svg viewBox="0 0 24 24"><path d="M9 3L7 21M17 3l-2 18M4 9h17M3 15h17" stroke="currentColor" stroke-width="2"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M3.5 21c.8-4.6 4.2-7 8.5-7s7.7 2.4 8.5 7z" fill="currentColor"/></svg>',
  crown: '<svg viewBox="0 0 24 24"><path d="M3 7l5 4 4-7 4 7 5-4-2 12H5z" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.6l-6 3.3 1.3-6.7-5-4.7 6.8-.8z" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M9 5h11v14H9l-6-7z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 9l5 6M17 9l-5 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
};

/** Standard screen header: back button, title (zh + small en), optional right-side HTML. */
export function header(zh, en, { back = '返回', right = '' } = {}) {
  return `<header class="fe-head">
    <button class="fe-back" data-act="back" aria-label="${esc(back)}">${ICON.back}<span>${esc(back)}</span></button>
    <div class="fe-title"><b>${esc(zh)}</b><small>${esc(en)}</small></div>
    <div class="fe-head-r">${right}</div></header>`;
}

/**
 * Base class: a full-screen <section> in #fe. Subclasses fill this.el, react to [data-act] clicks in
 * onAct(act, target, event) and may override enter(data) / leave() / back() (true = consumed).
 */
export class Screen {
  constructor(app, cls, html = '') {
    this.app = app;
    this.el = el(`<section class="scr ${cls}">${html}</section>`);
    app.feRoot.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || !this.el.contains(t) || t.disabled) return;
      if (t.dataset.act === 'back') { this.app.back(); return; }
      this.onAct(t.dataset.act, t, e);
    });
  }
  $(s) { return this.el.querySelector(s); }
  $$(s) { return [...this.el.querySelectorAll(s)]; }
  onAct() {}
  enter() {}
  leave() {}
  /** Android Back / Esc on this screen. Return true when handled (default: go back to the menu). */
  back() { this.app.show('menu'); return true; }
}

// ---------------------------------------------------------------- dialogs

export class Dialogs {
  constructor(app) {
    this.app = app;
    this.stack = [];
  }

  get open() { return this.stack.length > 0; }

  /**
   * Opens a modal. o: { title, body (HTML string or Element), buttons: [{ label, cls, value }],
   * dismiss: value returned by Back / tapping outside (undefined = Back still closes with null,
   * false = not dismissable), cls }. Returns { el, close(value), done: Promise<value> }.
   */
  show(o) {
    const wrap = el(`<div class="fe-dlg-wrap"><div class="fe-dlg ${o.cls || ''}" role="dialog">
      ${o.title ? `<h3>${esc(o.title)}</h3>` : ''}<div class="fe-dlg-body"></div><div class="fe-dlg-btns"></div></div></div>`);
    const body = wrap.querySelector('.fe-dlg-body');
    if (o.body instanceof Element) body.appendChild(o.body); else body.innerHTML = o.body || '';
    const btns = wrap.querySelector('.fe-dlg-btns');
    for (const b of o.buttons || []) {
      const n = el(`<button class="fe-btn ${b.cls || ''}">${b.label}</button>`);
      n.addEventListener('click', () => d.close(b.value));
      btns.appendChild(n);
    }
    if (!o.buttons?.length) btns.remove();
    let resolve;
    const d = {
      el: wrap,
      dismiss: o.dismiss,
      done: new Promise((r) => { resolve = r; }),
      close: (value) => {
        const i = this.stack.indexOf(d);
        if (i < 0) return;
        this.stack.splice(i, 1);
        wrap.remove();
        o.onClose?.(value);
        resolve(value);
      },
    };
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap && o.dismiss !== false) d.close(o.dismiss ?? null); });
    this.app.feRoot.appendChild(wrap);
    this.stack.push(d);
    const first = wrap.querySelector('input, .fe-btn.pri');
    if (first && !matchMedia('(pointer: coarse)').matches) setTimeout(() => first.focus(), 30);
    return d;
  }

  alert(title, text, { ok = '確定' } = {}) {
    return this.show({ title, body: `<p>${esc(text)}</p>`, buttons: [{ label: ok, cls: 'pri', value: true }], dismiss: true }).done;
  }

  confirm(title, text, { ok = '確定', cancel = '取消', danger = false } = {}) {
    return this.show({ title, body: `<p>${esc(text)}</p>`, dismiss: false,
      buttons: [{ label: cancel, value: false }, { label: ok, cls: danger ? 'danger' : 'pri', value: true }] }).done.then((v) => !!v);
  }

  /** Busy dialog with a live status line; cancel (optional) resolves done with 'cancel'. */
  progress(title, text, { cancel = '取消' } = {}) {
    const d = this.show({ title, cls: 'busy', body: `<div class="fe-busy"><i class="fe-spin"></i><span>${esc(text)}</span></div>`,
      buttons: cancel ? [{ label: cancel, value: 'cancel' }] : [], dismiss: cancel ? 'cancel' : false });
    d.setText = (t) => { const s = d.el.querySelector('.fe-busy span'); if (s) s.textContent = t; };
    return d;
  }

  /** Back: closes the top dialog (when dismissable). Always consumes the press while a dialog is up. */
  back() {
    const d = this.stack[this.stack.length - 1];
    if (!d) return false;
    if (d.dismiss !== false) d.close(d.dismiss ?? null);
    return true;
  }

  closeAll() { for (const d of [...this.stack]) d.close(null); }
}

// ---------------------------------------------------------------- toast

export function toast(app, text, ms = 1800) {
  let t = app.feRoot.querySelector('.fe-toast');
  if (!t) { t = el('<div class="fe-toast"></div>'); app.feRoot.appendChild(t); }
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------------------------------------------------------------- loading screen (#boot)

const TIPS = [
  '爆頭傷害約為身體的四倍，瞄準頭部能更快清場。',
  '回合之間有 20 秒購買時間，記得補充彈藥與護甲。',
  '倒地後隊友可以救起你；單人時可用腎上腺素自救兩次。',
  '防暴屍正面有護盾，繞到側面或背後射擊。',
  '爆裂者死亡時會爆炸，別讓它靠近隊友。',
  '每次升級可選擇一項強化：攻擊、生命、換彈、機動或擊退。',
  '補給箱會在回合結束後出現，內含彈藥、護甲與生命。',
];

export class Loading {
  constructor() {
    this.el = document.getElementById('boot');
    if (!this.el.querySelector('.boot-tip')) this.el.appendChild(el('<div class="boot-tip"></div>'));
    this.logo = this.el.querySelector('.boot-logo');
    this.sub = this.el.querySelector('.boot-sub');
    this.bar = this.el.querySelector('.boot-bar i');
    this.msg = this.el.querySelector('.boot-msg');
    this.tip = this.el.querySelector('.boot-tip');
    this.visible = !this.el.classList.contains('gone');
  }
  show({ title = '災厄前線', sub = 'CALAMITY FRONT', msg = '載入中…', tip = false } = {}) {
    this.logo.textContent = title;
    this.sub.textContent = sub;
    this.msg.textContent = msg;
    this.tip.textContent = tip ? '提示　' + TIPS[(Math.random() * TIPS.length) | 0] : '';
    this.el.classList.toggle('match', !!tip);
    this.progress(0);
    this.el.classList.remove('gone');
    this.visible = true;
  }
  progress(p, msg) {
    this.bar.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%';
    if (msg) this.msg.textContent = msg;
  }
  hide() { this.el.classList.add('gone'); this.visible = false; }
}

/** Copies text to the clipboard (async API, then the execCommand fallback for older WebViews). */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
