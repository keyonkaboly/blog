(() => {
  'use strict';

  const SITE = "keyon's blog";
  const page = document.getElementById('page');
  const menu = document.getElementById('menu');
  const menuBtn = document.getElementById('menu-btn');
  const menuList = document.getElementById('menu-list');
  const scrim = document.getElementById('scrim');

  let sections = [];
  let entries = []; // newest first, as written by build.py
  const sectionBySlug = new Map();
  const indexById = new Map();
  const textCache = new Map();
  let renderToken = 0;

  // ---------- dates (entries are plain YYYY-MM-DD, read as local days) ----------
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const pad = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
  const fmt = (d, opts) => d.toLocaleDateString('en-US', opts);
  const longDate = d => fmt(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  function weekRange(monday) {
    const sunday = addDays(monday, 6);
    const sameYear = monday.getFullYear() === sunday.getFullYear();
    const start = fmt(monday, sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' });
    if (sameYear && monday.getMonth() === sunday.getMonth()) return `${start} – ${sunday.getDate()}, ${sunday.getFullYear()}`;
    return `${start} – ${fmt(sunday, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const entryHref = e => `#/entry/${encodeURIComponent(e.id)}`;
  const sectionHref = slug => `#/section/${encodeURIComponent(slug)}`;
  const sectionName = slug => (sectionBySlug.get(slug) || { name: slug }).name;
  const stripFrontMatter = t => t.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');

  async function fetchText(path) {
    if (textCache.has(path)) return textCache.get(path);
    const res = await fetch(encodeURI(path), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    const text = await res.text();
    textCache.set(path, text);
    return text;
  }

  // Images and links written relative to the markdown file should resolve from that file.
  function fixUrls(root, path) {
    const base = new URL(path, location.href);
    root.querySelectorAll('img[src], source[src], video[src], a[href]').forEach(el => {
      const attr = el.hasAttribute('src') ? 'src' : 'href';
      const value = el.getAttribute(attr);
      if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) return;
      el.setAttribute(attr, new URL(value, base).href);
    });
    root.querySelectorAll('a[href]').forEach(a => {
      if (/^https?:$/.test(a.protocol) && a.host !== location.host) { a.target = '_blank'; a.rel = 'noopener'; }
    });
  }

  // ---------- menu ----------
  function buildMenu() {
    menuList.innerHTML = sections.map(s => `
      <li><a href="${sectionHref(s.slug)}" data-slug="${esc(s.slug)}">
        <span>${esc(s.name)}</span><span class="menu-count">${s.count || ''}</span>
      </a></li>`).join('');
  }

  function setMenu(open, moveFocus = false) {
    menu.hidden = !open;
    scrim.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open && moveFocus) (menuList.querySelector('.is-active') || menuList.querySelector('a'))?.focus({ preventScroll: true });
  }

  function markActiveSection(slug) {
    menuList.querySelectorAll('a').forEach(a => a.classList.toggle('is-active', a.dataset.slug === slug));
  }

  // e.detail is 0 when the button was pressed from the keyboard
  menuBtn.addEventListener('click', e => setMenu(menu.hidden, e.detail === 0));
  scrim.addEventListener('click', () => setMenu(false));
  menuList.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); }
  });

  // ---------- views ----------
  function weekHtml(entry) {
    const monday = mondayOf(parseDate(entry.date));
    const start = isoDate(monday);
    const end = isoDate(addDays(monday, 6));
    const days = new Map();
    for (const e of entries) {
      if (e.date < start || e.date > end) continue;
      if (!days.has(e.date)) days.set(e.date, []);
      days.get(e.date).push(e);
    }
    const isThisWeek = isoDate(mondayOf(new Date())) === start;
    const rows = [...days.keys()].sort().map(day => {
      const d = parseDate(day);
      const items = days.get(day).map(e => `
        <li${e.id === entry.id ? ' class="is-current" aria-current="page"' : ''}>
          <a href="${entryHref(e)}">${esc(e.title)}</a>
          <span class="tag-sm">${esc(sectionName(e.section))}</span>
        </li>`).join('');
      return `
        <li class="day">
          <div class="day-label"><span class="dow">${fmt(d, { weekday: 'short' })}</span><span class="dom">${d.getDate()}</span></div>
          <ul class="day-entries">${items}</ul>
        </li>`;
    }).join('');
    return `
      <section class="week" aria-labelledby="week-heading">
        <h2 class="week-head" id="week-heading"><span class="eyebrow">${isThisWeek ? 'This week' : 'Week of'}</span>${weekRange(monday)}</h2>
        <ol class="week-days">${rows}</ol>
      </section>`;
  }

  async function showEntry(entry, token) {
    let body;
    try {
      body = marked.parse(stripFrontMatter(await fetchText(entry.path)));
    } catch (err) {
      console.error(err);
      body = '<p class="muted">This entry couldn\'t be loaded.</p>';
    }
    if (token !== renderToken) return; // the reader already moved on

    const i = indexById.get(entry.id);
    const newer = entries[i - 1];
    const older = entries[i + 1];
    const nav = [
      older ? `<a class="older" href="${entryHref(older)}"><span>← Older</span>${esc(older.title)}</a>` : '',
      newer ? `<a class="newer" href="${entryHref(newer)}"><span>Newer →</span>${esc(newer.title)}</a>` : '',
    ].join('');
    document.title = `${entry.title} · ${SITE}`;
    markActiveSection(entry.section);
    page.innerHTML = `
      <article class="entry">
        <header class="entry-head">
          <p class="entry-date"><time datetime="${entry.date}">${longDate(parseDate(entry.date))}</time></p>
          <h1 class="entry-title">${esc(entry.title)}</h1>
          <a class="tag" href="${sectionHref(entry.section)}">${esc(sectionName(entry.section))}</a>
        </header>
        <div class="entry-body">${body}</div>
        ${nav ? `<nav class="entry-nav" aria-label="More entries">${nav}</nav>` : ''}
      </article>
      ${weekHtml(entry)}`;
    fixUrls(page.querySelector('.entry-body'), entry.path);
    window.scrollTo(0, 0);
  }

  function showSection(slug) {
    const section = sectionBySlug.get(slug);
    if (!section) return showMessage("That page isn't in the journal.", true);
    const list = entries.filter(e => e.section === slug);
    const months = new Map();
    for (const e of list) {
      const key = e.date.slice(0, 7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(e);
    }
    const listing = list.length
      ? [...months].map(([key, items]) => `
          <div class="month">
            <h2 class="month-head">${fmt(parseDate(`${key}-01`), { month: 'long', year: 'numeric' })}</h2>
            <ul class="listing">${items.map(e => {
              const d = parseDate(e.date);
              return `<li><time datetime="${e.date}">${fmt(d, { weekday: 'short' })} ${d.getDate()}</time><a href="${entryHref(e)}">${esc(e.title)}</a></li>`;
            }).join('')}</ul>
          </div>`).join('')
      : '<p class="empty">Nothing written here yet.</p>';

    document.title = `${section.name} · ${SITE}`;
    markActiveSection(slug);
    page.innerHTML = `
      <section class="section-page">
        <header class="section-head">
          <p class="eyebrow">Section</p>
          <h1>${esc(section.name)}</h1>
          <p class="count">${list.length} ${list.length === 1 ? 'entry' : 'entries'}</p>
        </header>
        ${listing}
      </section>`;
    window.scrollTo(0, 0);
  }

  function showMessage(text, withHomeLink) {
    document.title = SITE;
    markActiveSection(null);
    page.innerHTML = `
      <div class="empty-state">
        <p>${text}</p>
        ${withHomeLink ? '<p><a href="#/">Back to the latest entry</a></p>' : ''}
      </div>`;
  }

  function route() {
    const token = ++renderToken;
    setMenu(false);
    const [kind, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    const arg = decodeURIComponent(rest.join('/'));

    if (kind === 'section') return showSection(arg);
    if (kind === 'entry') {
      const i = indexById.get(arg);
      return i === undefined ? showMessage("That page isn't in the journal.", true) : showEntry(entries[i], token);
    }
    if (!entries.length) return showMessage('No entries yet. The first page is still blank.');
    return showEntry(entries[0], token);
  }

  // ---------- start ----------
  async function init() {
    try {
      const res = await fetch('entries.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${res.status} entries.json`);
      const data = await res.json();
      sections = data.sections || [];
      entries = data.entries || [];
    } catch (err) {
      console.error(err);
      const hint = location.protocol === 'file:'
        ? ' Open it through a local server instead: run <code>python3 -m http.server</code> in the folder and visit localhost:8000.'
        : '';
      return showMessage(`The journal couldn't be loaded.${hint}`);
    }
    sections.forEach(s => sectionBySlug.set(s.slug, s));
    entries.forEach((e, i) => indexById.set(e.id, i));
    buildMenu();
    window.addEventListener('hashchange', route);
    route();
  }

  init();
})();
