/* BOOK WORM – półka z książkami do przeczytania.
   Dane: Google Books (główne źródło) i Open Library (zapas: okładki, opisy, wyniki).
   Półka zapisuje się w pamięci telefonu (localStorage). */
(() => {
  'use strict';

  // ---------- Ustawienia ----------
  const GB = 'https://www.googleapis.com/books/v1';
  const OL = 'https://openlibrary.org';
  const OL_COVERS = 'https://covers.openlibrary.org/b';
  const STORE_LIST = 'bookworm.shelf.v1';
  const STORE_KEY = 'bookworm.googleKey';
  const STORE_HINT = 'bookworm.swipeHintDone';
  const STORE_TAB = 'bookworm.tab';
  const DELETE_W = 96;
  const STATUS = { todo: 'Do przeczytania', reading: 'Czytam', read: 'Przeczytane' };

  // ---------- Pamięć ----------
  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; }
      catch (e) { toast('Nie udało się zapisać zmian w pamięci telefonu.'); return false; }
    }
  };

  const state = {
    list: store.get(STORE_LIST, []),
    key: store.get(STORE_KEY, ''),
    filter: store.get(STORE_TAB, 'todo'),
    year: 'all',
    page: 'list',
    query: '',
    results: [],
    openRow: null
  };
  if (!STATUS[state.filter]) state.filter = 'todo';

  const saveList = () => store.set(STORE_LIST, state.list);
  const findItem = (key) => state.list.find((i) => i.key === key);

  // ---------- Pomocnicze ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yearOf = (d) => (d && /^\d{4}/.test(d) ? d.slice(0, 4) : '');
  const today = () => new Date().toISOString().slice(0, 10);
  const authorsText = (a) => (a && a.length ? a.join(', ') : 'Autor nieznany');

  function plural(n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10, h = n % 100;
    return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many;
  }
  const fmtNum = (n) => n.toLocaleString('pl-PL');
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const normTitle = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  const ICON = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17l9-10"/></svg>',
    thumb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4-7a2.5 2.5 0 0 1 2.9 2.9L13 10h5.5a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.1 21H7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2Z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7Z"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>',
    out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>'
  };

  // ---------- Okładki ----------
  function coverCandidates(b) {
    const list = [];
    if (b.cover) list.push(b.cover);
    if (b.isbn) list.push(`${OL_COVERS}/isbn/${b.isbn}-M.jpg?default=false`);
    if (b.olCover) list.push(`${OL_COVERS}/id/${b.olCover}-M.jpg?default=false`);
    return [...new Set(list)];
  }
  function posterHTML(b, cls = 'poster') {
    const c = coverCandidates(b);
    const letter = esc((b.title || '?').trim().charAt(0).toUpperCase());
    const ph = `<div class="${cls} poster-ph" aria-hidden="true">${letter}</div>`;
    if (!c.length) return ph;
    return `<img class="${cls}" src="${esc(c[0])}" data-fallbacks="${esc(c.slice(1).join('|'))}" data-letter="${letter}" alt="" loading="lazy" decoding="async">`;
  }
  // Gdy okładka się nie wczyta (albo to szare „brak obrazka” z Google), próbujemy kolejnej
  function nextCover(img) {
    const rest = (img.dataset.fallbacks || '').split('|').filter(Boolean);
    if (rest.length) {
      img.dataset.fallbacks = rest.slice(1).join('|');
      img.src = rest[0];
    } else {
      const ph = document.createElement('div');
      ph.className = img.className + ' poster-ph';
      ph.setAttribute('aria-hidden', 'true');
      ph.textContent = img.dataset.letter || '?';
      img.replaceWith(ph);
    }
  }
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('poster')) nextCover(t);
  }, true);
  document.addEventListener('load', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('poster') && t.naturalWidth > 0 && t.naturalWidth < 20) nextCover(t);
  }, true);

  // ---------- Pobieranie danych ----------
  class ApiError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

  async function getJSON(url, signal) {
    let res;
    try { res = await fetch(url, { signal, headers: { accept: 'application/json' } }); }
    catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ApiError('Brak połączenia z internetem.', 'offline');
    }
    if (res.status === 429) throw new ApiError('Za dużo zapytań. Spróbuj za chwilę albo dodaj klucz Google w ustawieniach.', 'rate');
    if (res.status === 400 || res.status === 403) throw new ApiError('Google Books odrzucił zapytanie. Sprawdź klucz w ustawieniach.', 'badkey');
    if (res.status === 404) throw new ApiError('Nie znaleziono.', 'notfound');
    if (!res.ok) throw new ApiError(`Serwer nie odpowiada (błąd ${res.status}). Spróbuj ponownie.`, 'http');
    return res.json();
  }

  function gbUrl(path, params = {}) {
    const url = new URL(GB + path);
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && url.searchParams.set(k, v));
    if (state.key) url.searchParams.set('key', state.key);
    return url;
  }

  function gbCover(links) {
    if (!links) return '';
    const u = links.thumbnail || links.smallThumbnail || '';
    return u.replace(/^http:/, 'https:').replace('&edge=curl', '');
  }
  function pickIsbn(ids) {
    if (!ids) return '';
    const i13 = ids.find((x) => x.type === 'ISBN_13');
    if (i13) return i13.identifier;
    const i10 = ids.find((x) => x.type === 'ISBN_10');
    return i10 ? (window.BWScanner.normalizeIsbn(i10.identifier) || '') : '';
  }
  function htmlToText(html) {
    if (!html) return '';
    const withBreaks = String(html).replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  function fromGoogle(v) {
    const i = v.volumeInfo || {};
    return {
      key: `g:${v.id}`,
      source: 'google',
      gid: v.id,
      title: [i.title, i.subtitle].filter(Boolean).join(': ') || 'Bez tytułu',
      authors: i.authors || [],
      year: yearOf(i.publishedDate),
      cover: gbCover(i.imageLinks),
      isbn: pickIsbn(i.industryIdentifiers),
      pages: i.pageCount || null,
      publisher: i.publisher || '',
      lang: i.language || '',
      description: htmlToText(i.description || ''),
      categories: i.categories || []
    };
  }
  function fromOpenLibrary(d) {
    const isbn = (d.isbn || []).map((x) => window.BWScanner.normalizeIsbn(x)).find(Boolean) || '';
    return {
      key: `ol:${String(d.key || '').replace('/works/', '')}`,
      source: 'openlibrary',
      olWork: d.key || '',
      title: d.title || 'Bez tytułu',
      authors: d.author_name || [],
      year: d.first_publish_year ? String(d.first_publish_year) : '',
      cover: '',
      olCover: d.cover_i || null,
      isbn,
      pages: d.number_of_pages_median || null,
      publisher: (d.publisher || [])[0] || '',
      lang: (d.language || [])[0] || '',
      description: ''
    };
  }

  async function searchGoogle(q, signal) {
    const data = await getJSON(gbUrl('/volumes', { q, maxResults: 30, printType: 'books', orderBy: 'relevance' }), signal);
    return (data.items || []).map(fromGoogle);
  }
  async function searchOpenLibrary(q, signal) {
    const url = new URL(OL + '/search.json');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '15');
    url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,isbn,number_of_pages_median,publisher,language');
    const data = await getJSON(url, signal);
    return (data.docs || []).filter((d) => d.key).map(fromOpenLibrary);
  }

  function dedupe(books) {
    const seen = new Map();
    const out = [];
    for (const b of books) {
      const k = `${normTitle(b.title)}|${normTitle((b.authors || [])[0])}`;
      const prev = seen.get(k);
      if (prev) {
        // Uzupełnij brakujące okładki z duplikatu
        if (!prev.cover && b.cover) prev.cover = b.cover;
        if (!prev.isbn && b.isbn) prev.isbn = b.isbn;
        if (!prev.olCover && b.olCover) prev.olCover = b.olCover;
        continue;
      }
      seen.set(k, b);
      out.push(b);
    }
    return out;
  }

  async function findByIsbn(isbn) {
    try {
      const g = await searchGoogle(`isbn:${isbn}`);
      if (g.length) return { ...g[0], isbn: g[0].isbn || isbn };
    } catch (e) {
      if (e.code === 'offline') throw e;
    }
    try {
      const ed = await getJSON(`${OL}/isbn/${isbn}.json`);
      const work = ed.works && ed.works[0] && ed.works[0].key;
      let w = {};
      if (work) { try { w = await getJSON(`${OL}${work}.json`); } catch (e) { /* bez dzieła */ } }
      let authors = [];
      const aKeys = (w.authors || []).map((a) => a.author && a.author.key).filter(Boolean).slice(0, 3);
      if (aKeys.length) {
        authors = (await Promise.all(aKeys.map((k) => getJSON(`${OL}${k}.json`).then((a) => a.name).catch(() => null)))).filter(Boolean);
      }
      return {
        key: work ? `ol:${work.replace('/works/', '')}` : `isbn:${isbn}`,
        source: 'openlibrary',
        olWork: work || '',
        title: ed.title || w.title || 'Bez tytułu',
        authors,
        year: yearOf(ed.publish_date && (ed.publish_date.match(/\d{4}/) || [''])[0]),
        cover: '',
        olCover: (ed.covers && ed.covers[0]) || null,
        isbn,
        pages: ed.number_of_pages || null,
        publisher: (ed.publishers || [])[0] || '',
        description: olDescription(w)
      };
    } catch (e) {
      if (e.code === 'notfound') return null;
      throw e;
    }
  }

  const olDescription = (w) => (w && w.description ? (typeof w.description === 'string' ? w.description : w.description.value || '') : '').replace(/\r/g, '').trim();

  async function fetchDetails(b) {
    let d = { ...b };
    if (b.source === 'google' && b.gid) {
      try { d = { ...d, ...stripEmpty(fromGoogle(await getJSON(gbUrl(`/volumes/${b.gid}`)))) , key: b.key }; }
      catch (e) { if (e.code === 'offline') throw e; }
    }
    if (!d.description) {
      try {
        let work = d.olWork;
        if (!work && d.isbn) {
          const ed = await getJSON(`${OL}/isbn/${d.isbn}.json`);
          work = ed.works && ed.works[0] && ed.works[0].key;
          if (!d.olCover && ed.covers && ed.covers[0]) d.olCover = ed.covers[0];
        }
        if (work) {
          const w = await getJSON(`${OL}${work}.json`);
          d.description = olDescription(w);
          d.descSource = d.description ? 'openlibrary' : '';
          if (!d.olCover && w.covers && w.covers[0]) d.olCover = w.covers[0];
        }
      } catch (e) { /* bez opisu */ }
    }
    return d;
  }
  function stripEmpty(o) {
    const r = {};
    Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) r[k] = v; });
    return r;
  }

  // ---------- Nawigacja ----------
  function go(page) {
    state.page = page;
    $('#page-list').hidden = page !== 'list';
    $('#page-search').hidden = page !== 'search';
    $$('.tab').forEach((t) => (t.getAttribute('data-goto') === page ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
    window.scrollTo(0, 0);
    if (page === 'list') renderList();
    if (page === 'search') renderResults();
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) go(g.getAttribute('data-goto'));
  });

  // ---------- Strona 1: Moja półka ----------
  function readYear(i) { return yearOf(i.readAt) || 'none'; }

  function visibleItems() {
    let items = state.list.filter((i) => i.status === state.filter);
    if (state.filter === 'read') {
      if (state.year !== 'all') items = items.filter((i) => readYear(i) === state.year);
      items.sort((a, b) => String(b.readAt || '').localeCompare(String(a.readAt || '')) || (b.addedAt || 0) - (a.addedAt || 0));
    } else if (state.filter === 'reading') {
      items.sort((a, b) => (b.startedAt || b.addedAt || 0) - (a.startedAt || a.addedAt || 0));
    } else {
      items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }
    return items;
  }

  function renderYears() {
    const box = $('#years');
    const read = state.list.filter((i) => i.status === 'read');
    if (state.filter !== 'read' || !read.length) { box.hidden = true; return; }
    const counts = {};
    read.forEach((i) => { const y = readYear(i); counts[y] = (counts[y] || 0) + 1; });
    const years = Object.keys(counts).filter((y) => y !== 'none').sort((a, b) => b.localeCompare(a));
    if (counts.none) years.push('none');
    if (state.year !== 'all' && !counts[state.year]) state.year = 'all';
    const chip = (val, label, n) => `<button type="button" role="tab" class="year" data-year="${val}" aria-selected="${state.year === val}">${label}<span class="count">${n}</span></button>`;
    box.innerHTML = chip('all', 'Wszystkie', read.length) + years.map((y) => chip(y, y === 'none' ? 'Bez daty' : y, counts[y])).join('');
    box.hidden = false;
  }

  function renderSummary(items) {
    const el = $('#summary');
    if (state.filter !== 'read' || !items.length) { el.hidden = true; return; }
    const pages = items.reduce((s, i) => s + (i.pages || 0), 0);
    const n = items.length;
    const lead = state.year === 'all' ? 'Łącznie' : state.year === 'none' ? 'Bez daty' : `W ${state.year}`;
    el.innerHTML = `${lead}: <b>${n}</b> ${plural(n, 'książka', 'książki', 'książek')}${pages ? ` · <b>${fmtNum(pages)}</b> ${plural(pages, 'strona', 'strony', 'stron')}` : ''}`;
    el.hidden = false;
  }

  function stepHTML(i) {
    if (i.status === 'todo') return `<button type="button" class="step to-reading" data-act="start">${ICON.book}Zacznij czytać</button>`;
    if (i.status === 'reading') return `<button type="button" class="step to-read" data-act="finish">${ICON.check}Przeczytane</button>`;
    return `${i.readAt ? `<span class="read-date">${ICON.check}${esc(fmtDate(i.readAt))}</span>` : ''}
      <span class="thumbs" role="group" aria-label="Ocena">
        <button type="button" class="thumb up" data-act="up" aria-pressed="${i.rating === 1}" aria-label="Podobała mi się">${ICON.thumb}</button>
        <button type="button" class="thumb down" data-act="down" aria-pressed="${i.rating === -1}" aria-label="Nie podobała mi się">${ICON.thumb}</button>
      </span>`;
  }

  function renderList() {
    renderYears();
    const items = visibleItems();
    const ul = $('#watchlist');
    state.openRow = null;
    ul.innerHTML = items.map((i) => `
      <li class="row" data-key="${esc(i.key)}">
        <button type="button" class="row-delete" data-act="delete" tabindex="-1" aria-label="Usuń ${esc(i.title)} z półki">${ICON.trash}Usuń</button>
        <div class="row-content" data-act="open" role="button" tabindex="0" aria-label="${esc(i.title)}, pokaż szczegóły">
          ${posterHTML(i)}
          <div class="row-main">
            <h3 class="row-title">${esc(i.title)}</h3>
            <p class="row-author">${esc(authorsText(i.authors))}</p>
            <div class="row-controls">${stepHTML(i)}${i.note ? `<span class="row-note" title="Masz notatkę">${ICON.note}</span>` : ''}</div>
          </div>
        </div>
      </li>`).join('');
    renderSummary(items);

    const c = { todo: 0, reading: 0, read: 0 };
    state.list.forEach((i) => { c[i.status] = (c[i.status] || 0) + 1; });
    $('#count-todo').textContent = c.todo;
    $('#count-reading').textContent = c.reading;
    $('#count-read').textContent = c.read;

    const empty = $('#list-empty');
    if (!state.list.length) {
      empty.hidden = false;
      $('h2', empty).textContent = 'Pusta półka';
      $('p', empty).textContent = 'Nie masz jeszcze żadnych książek. Wyszukaj tytuł albo zeskanuj kod z okładki.';
      $('button', empty).hidden = false;
    } else if (!items.length) {
      empty.hidden = false;
      const msg = {
        todo: ['Nic w kolejce', 'Dodaj książki, które chcesz przeczytać. Znajdziesz je w wyszukiwarce.'],
        reading: ['Nic nie czytasz', 'Otwórz książkę z listy „Do przeczytania” i stuknij „Zacznij czytać”.'],
        read: ['Jeszcze nic', 'Gdy skończysz książkę, stuknij „Przeczytane”, a pojawi się tutaj z datą.']
      }[state.filter];
      $('h2', empty).textContent = msg[0];
      $('p', empty).textContent = msg[1];
      $('button', empty).hidden = state.filter !== 'todo';
    } else {
      empty.hidden = true;
    }
    $('#swipe-hint').hidden = !(items.length && !store.get(STORE_HINT, false));
  }

  $$('.seg').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    state.year = 'all';
    store.set(STORE_TAB, state.filter);
    $$('.seg').forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
    renderList();
  }));
  $$('.seg').forEach((x) => x.setAttribute('aria-selected', x.dataset.filter === state.filter ? 'true' : 'false'));
  $('#years').addEventListener('click', (e) => {
    const b = e.target.closest('.year');
    if (!b) return;
    state.year = b.dataset.year;
    renderList();
  });

  function updateItem(key, patch) {
    const it = findItem(key);
    if (!it) return null;
    Object.assign(it, patch);
    saveList();
    return it;
  }
  function setStatus(key, status) {
    const it = findItem(key);
    if (!it || it.status === status) return;
    const patch = { status };
    if (status === 'reading' && !it.startedAt) patch.startedAt = Date.now();
    if (status === 'read' && !it.readAt) patch.readAt = today();
    if (status !== 'read') patch.readAt = it.status === 'read' ? '' : it.readAt;
    updateItem(key, patch);
  }
  function setRating(key, val) {
    const it = findItem(key);
    if (it) updateItem(key, { rating: it.rating === val ? 0 : val });
  }

  let lastRemoved = null;
  function removeItem(key) {
    const idx = state.list.findIndex((i) => i.key === key);
    if (idx < 0) return;
    const [it] = state.list.splice(idx, 1);
    saveList();
    lastRemoved = { it, idx };
    store.set(STORE_HINT, true);
    renderList();
    toast(`Usunięto „${it.title}”`, 'Cofnij', () => {
      if (!lastRemoved) return;
      state.list.splice(Math.min(lastRemoved.idx, state.list.length), 0, lastRemoved.it);
      lastRemoved = null;
      saveList();
      renderList();
    });
  }

  $('#watchlist').addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const key = row.dataset.key;
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (suppressClick) { suppressClick = false; return; }
    if (a === 'delete') { removeItem(key); return; }
    if (state.openRow) { closeRow(state.openRow); return; }
    const it = findItem(key);
    if (!it) return;
    if (a === 'start') { setStatus(key, 'reading'); renderList(); toast(`„${it.title}” przeniesiona do „Czytam”`); return; }
    if (a === 'finish') { setStatus(key, 'read'); renderList(); toast(`Brawo! „${it.title}” przeczytana`); return; }
    if (a === 'up') { setRating(key, 1); renderList(); return; }
    if (a === 'down') { setRating(key, -1); renderList(); return; }
    if (a === 'open') openDetail(it);
  });
  $('#watchlist').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.row-content')) {
      e.preventDefault();
      const it = findItem(e.target.closest('.row').dataset.key);
      if (it) openDetail(it);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.matches('.row-content')) {
      removeItem(e.target.closest('.row').dataset.key);
    }
  });

  // ---------- Przesunięcie w lewo = usuń ----------
  let drag = null;
  let suppressClick = false;
  function setX(row, x, animate) {
    const c = $('.row-content', row);
    row.classList.toggle('dragging', !animate);
    if (x < 0) row.classList.add('revealing');
    c.style.transform = x ? `translateX(${x}px)` : '';
  }
  function closeRow(row) {
    setX(row, 0, true);
    setTimeout(() => { if (state.openRow !== row && !(drag && drag.row === row)) row.classList.remove('revealing'); }, 280);
    $('.row-delete', row).tabIndex = -1;
    if (state.openRow === row) state.openRow = null;
  }
  function openRow(row) {
    if (state.openRow && state.openRow !== row) closeRow(state.openRow);
    setX(row, -DELETE_W, true);
    $('.row-delete', row).tabIndex = 0;
    state.openRow = row;
    store.set(STORE_HINT, true);
    $('#swipe-hint').hidden = true;
  }
  const wl = $('#watchlist');
  wl.addEventListener('pointerdown', (e) => {
    const content = e.target.closest('.row-content');
    if (!content || e.button > 0) return;
    const row = content.parentElement;
    drag = { row, content, x0: e.clientX, y0: e.clientY, base: state.openRow === row ? -DELETE_W : 0, x: 0, active: false, dead: false, id: e.pointerId, width: row.getBoundingClientRect().width };
  });
  wl.addEventListener('pointermove', (e) => {
    if (!drag || drag.dead || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag.dead = true; return; }
      if (Math.abs(dx) < 10) return;
      drag.active = true;
      if (state.openRow && state.openRow !== drag.row) closeRow(state.openRow);
      try { drag.content.setPointerCapture(e.pointerId); } catch (_) {}
    }
    let x = drag.base + dx;
    if (x > 0) x = x / 4;
    if (x < -drag.width) x = -drag.width;
    drag.x = x;
    setX(drag.row, x, false);
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    if (!d.active) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 350);
    if (d.x < -d.width * 0.6) {
      setX(d.row, -d.width, true);
      setTimeout(() => removeItem(d.row.dataset.key), 180);
    } else if (d.x < -DELETE_W / 2) openRow(d.row);
    else closeRow(d.row);
  }
  wl.addEventListener('pointerup', endDrag);
  wl.addEventListener('pointercancel', (e) => { if (drag && drag.active) endDrag(e); else drag = null; });
  document.addEventListener('pointerdown', (e) => {
    if (state.openRow && !state.openRow.contains(e.target)) closeRow(state.openRow);
  });

  // ---------- Strona 2: Wyszukiwarka ----------
  const input = $('#search-input');
  const status = $('#search-status');
  let searchTimer = null;
  let searchCtrl = null;

  function setStatusText(text, isError) {
    status.textContent = text;
    status.classList.toggle('error', !!isError);
  }
  function renderSkeleton() {
    $('#results').innerHTML = Array.from({ length: 5 }, () => `
      <li class="skeleton"><div class="result" aria-hidden="true">
        <div class="poster"></div>
        <div class="row-main"><div class="sk-line" style="width:70%"></div><div class="sk-line" style="width:45%"></div><div class="sk-line" style="width:25%"></div></div>
        <span></span>
      </div></li>`).join('');
  }
  function renderResults() {
    $('#scan-card').hidden = !!state.query;
    $('#results').innerHTML = state.results.map((r, idx) => {
      const onList = findItem(r.key) || findByIsbnOnShelf(r.isbn);
      return `
      <li>
        <button type="button" class="result" data-idx="${idx}">
          ${posterHTML(r)}
          <div class="row-main">
            <h3 class="row-title">${esc(r.title)}</h3>
            <p class="row-author">${esc(authorsText(r.authors))}</p>
            <p class="row-meta">${r.year ? `<span>${esc(r.year)}</span>` : ''}${r.pages ? `<span>${r.pages} str.</span>` : ''}${onList ? `<span class="on-list">${ICON.check}${esc(STATUS[onList.status])}</span>` : ''}</p>
          </div>
          ${ICON.chev}
        </button>
      </li>`;
    }).join('');
  }
  const findByIsbnOnShelf = (isbn) => (isbn ? state.list.find((i) => i.isbn === isbn) : null);

  async function runSearch(q) {
    q = q.trim();
    state.query = q;
    if (searchCtrl) searchCtrl.abort();
    if (q.length < 2) {
      state.results = [];
      renderResults();
      setStatusText(q.length ? 'Wpisz co najmniej 2 znaki.' : '');
      return;
    }
    const isbn = window.BWScanner.normalizeIsbn(q);
    if (isbn) { lookupIsbn(isbn); return; }
    searchCtrl = new AbortController();
    const signal = searchCtrl.signal;
    renderSkeleton();
    $('#scan-card').hidden = true;
    setStatusText('Szukam…');
    const [g, o] = await Promise.allSettled([searchGoogle(q, signal), searchOpenLibrary(q, signal)]);
    if (signal.aborted) return;
    const google = g.status === 'fulfilled' ? g.value : [];
    const ol = o.status === 'fulfilled' ? o.value : [];
    // Google najpierw; z Open Library dokładamy to, czego Google nie ma
    state.results = dedupe([...google, ...ol]).slice(0, 40);
    renderResults();
    if (state.results.length) {
      setStatusText(`${state.results.length} ${plural(state.results.length, 'wynik', 'wyniki', 'wyników')}`);
    } else if (g.status === 'rejected' && o.status === 'rejected') {
      setStatusText(g.reason.message || 'Nie udało się wyszukać.', true);
    } else {
      setStatusText(`Brak wyników dla „${q}”. Spróbuj samego nazwiska autora albo innej pisowni.`);
    }
  }

  input.addEventListener('input', () => {
    $('#search-clear').hidden = !input.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(input.value), 420);
  });
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    runSearch(input.value);
    input.blur();
  });
  $('#search-clear').addEventListener('click', () => {
    input.value = '';
    $('#search-clear').hidden = true;
    runSearch('');
    input.focus();
  });
  $('#results').addEventListener('click', (e) => {
    const b = e.target.closest('.result[data-idx]');
    if (!b) return;
    const r = state.results[+b.dataset.idx];
    if (r) openDetail(findItem(r.key) || findByIsbnOnShelf(r.isbn) || r);
  });

  async function lookupIsbn(isbn) {
    setStatusText(`Szukam książki o ISBN ${isbn}…`);
    renderSkeleton();
    try {
      const b = await findByIsbn(isbn);
      if (!b) {
        state.results = [];
        renderResults();
        setStatusText(`Nie znalazłem książki o ISBN ${isbn}. Wpisz tytuł albo autora.`, true);
        return null;
      }
      state.results = [b];
      renderResults();
      setStatusText('Znaleziono po ISBN');
      openDetail(findItem(b.key) || findByIsbnOnShelf(b.isbn) || b);
      return b;
    } catch (e) {
      state.results = [];
      renderResults();
      setStatusText(e.message, true);
      return null;
    }
  }

  // ---------- Karta szczegółów ----------
  const sheet = $('#sheet');
  const sheetBody = $('#sheet-body');
  const backdrop = $('#sheet-backdrop');
  let current = null;
  let detailToken = 0;
  let descOpen = false;

  function lockScroll(on) { document.documentElement.style.overflow = on ? 'hidden' : ''; }
  function anySheetOpen() { return !sheet.hidden || !$('#settings').hidden || !$('#scanner').hidden; }

  function openDetail(data) {
    current = { ...data };
    descOpen = false;
    renderDetail(true);
    backdrop.hidden = false;
    sheet.hidden = false;
    lockScroll(true);
    sheetBody.scrollTop = 0;
    loadDetail(data);
  }
  function closeDetail() {
    flushNote();
    sheet.hidden = true;
    if (!anySheetOpen()) { backdrop.hidden = true; lockScroll(false); }
    current = null;
    detailToken++;
    if (state.page === 'list') renderList(); else renderResults();
  }

  async function loadDetail(b) {
    const token = ++detailToken;
    const it = findItem(b.key);
    // Książki z półki mają już opis – dociągamy tylko, gdy go brakuje
    if (it && it.description && it.detailsAt) { renderDetail(false); return; }
    try {
      const d = await fetchDetails(b);
      if (token !== detailToken) return;
      const keep = { note: current.note, status: current.status };
      current = { ...current, ...stripEmpty(d), ...stripEmpty(keep) };
      if (it) {
        updateItem(it.key, stripEmpty({
          title: d.title, authors: d.authors, year: d.year, cover: d.cover, olCover: d.olCover, isbn: d.isbn,
          pages: d.pages, publisher: d.publisher, description: d.description, descSource: d.descSource, detailsAt: Date.now()
        }));
      }
    } catch (e) {
      if (token !== detailToken) return;
      current.loadError = e.message;
    }
    renderDetail(false);
  }

  function extractLinks(text) {
    const re = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;
    const out = [];
    let m;
    while ((m = re.exec(text || ''))) {
      let u = m[0].replace(/[),.;!?]+$/, '');
      if (!/^https?:/i.test(u)) u = 'https://' + u;
      try { const url = new URL(u); out.push({ href: url.href, label: url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 ? url.pathname : '') }); } catch (e) { /* pomiń */ }
    }
    return out.slice(0, 6);
  }
  function noteLinksHTML(text) {
    return extractLinks(text).map((l) => `<a class="note-link" href="${esc(l.href)}" target="_blank" rel="noopener">${ICON.link}<span>${esc(l.label)}</span></a>`).join('');
  }

  function empikUrl(d) {
    const q = [d.title.split(':')[0], (d.authors || [])[0]].filter(Boolean).join(' ');
    return `https://www.empik.com/szukaj/produkt?q=${encodeURIComponent(q)}`;
  }

  function renderDetail(loading) {
    const d = current;
    if (!d) return;
    const item = findItem(d.key);
    const facts = [];
    if (d.year) facts.push(['Wydanie', d.year]);
    if (d.pages) facts.push(['Strony', String(d.pages)]);
    if (d.publisher) facts.push(['Wydawca', d.publisher]);
    if (d.isbn) facts.push(['ISBN', d.isbn]);

    const desc = d.description || '';
    const longDesc = desc.length > 520;

    sheetBody.innerHTML = `
      <div class="detail-head detail-head-book">
        ${posterHTML(d)}
        <div style="min-width:0">
          <h2 class="sheet-title" id="sheet-title">${esc(d.title)}</h2>
          <p class="authors">${esc(authorsText(d.authors))}</p>
        </div>
      </div>

      ${item ? `
      <div class="block">
        <h3 class="label">Status</h3>
        <div class="status-seg" role="group" aria-label="Status książki">
          ${['todo', 'reading', 'read'].map((s) => `<button type="button" data-act="status" data-status="${s}" aria-pressed="${item.status === s}">${STATUS[s]}</button>`).join('')}
        </div>
        ${item.status === 'read' ? `
        <div class="date-row">
          <label for="read-date">Przeczytana</label>
          <input type="date" id="read-date" value="${esc(item.readAt || '')}" max="${today()}">
          <span class="thumbs" role="group" aria-label="Ocena">
            <button type="button" class="thumb up" data-act="up" aria-pressed="${item.rating === 1}" aria-label="Podobała mi się">${ICON.thumb}</button>
            <button type="button" class="thumb down" data-act="down" aria-pressed="${item.rating === -1}" aria-label="Nie podobała mi się">${ICON.thumb}</button>
          </span>
        </div>` : ''}
      </div>

      <div class="block">
        <h3 class="label"><label for="note">Notatka</label></h3>
        <textarea class="note" id="note" placeholder="Np. link, skąd pobrać książkę, albo kto ją poleca" spellcheck="true">${esc(item.note || '')}</textarea>
        <div class="note-meta"><span class="note-saved" id="note-saved"></span></div>
        <div class="note-links" id="note-links">${noteLinksHTML(item.note)}</div>
      </div>` : ''}

      <div class="block">
        <h3 class="label">Opis</h3>
        ${desc
          ? `<p class="overview${longDesc && !descOpen ? ' clamped' : ''}" style="white-space:pre-line">${esc(desc)}</p>
             ${longDesc ? `<button type="button" class="more-btn" data-act="more">${descOpen ? 'Zwiń' : 'Czytaj dalej'}</button>` : ''}
             ${d.descSource === 'openlibrary' ? '<p class="muted tiny">Opis z Open Library.</p>' : ''}`
          : `<p class="muted">${loading ? 'Wczytuję opis…' : (d.loadError ? esc(d.loadError) : 'Brak opisu tej książki.')}</p>`}
      </div>

      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}

      <a class="btn btn-wide shop-btn" href="${esc(empikUrl(d))}" target="_blank" rel="noopener">
        <span class="shop-name"><span class="shop-logo">${ICON.bag}</span>Szukaj w Empik i Empik Go</span>${ICON.out}
      </a>

      ${item
        ? `<button type="button" class="btn btn-wide btn-danger-ghost" data-act="remove">${ICON.trash}Usuń z półki</button>`
        : `<div class="add-row">
             <button type="button" class="btn btn-primary" data-act="add" data-status="todo">${ICON.plus}Do przeczytania</button>
             <button type="button" class="btn" data-act="add" data-status="reading">Czytam</button>
           </div>`}
    `;
  }

  // Notatka zapisuje się sama
  let noteTimer = null;
  function flushNote() {
    const ta = $('#note');
    if (!ta || !current) return;
    clearTimeout(noteTimer);
    const it = findItem(current.key);
    if (it && (it.note || '') !== ta.value) {
      updateItem(it.key, { note: ta.value });
      current.note = ta.value;
    }
  }
  sheetBody.addEventListener('input', (e) => {
    if (e.target.id !== 'note') return;
    $('#note-saved').textContent = 'Zapisuję…';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      flushNote();
      $('#note-saved').textContent = 'Zapisano';
      $('#note-links').innerHTML = noteLinksHTML(e.target.value);
    }, 500);
  });
  sheetBody.addEventListener('focusout', (e) => { if (e.target.id === 'note') flushNote(); });
  sheetBody.addEventListener('change', (e) => {
    if (e.target.id === 'read-date' && current) {
      const it = findItem(current.key);
      if (it) { updateItem(it.key, { readAt: e.target.value || '' }); toast('Zapisano datę'); }
    }
  });

  sheetBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !current) return;
    const a = b.dataset.act;
    if (a === 'more') { descOpen = !descOpen; renderDetail(false); return; }
    if (a === 'add') {
      if (!findItem(current.key)) {
        const { loadError, ...data } = current;
        const st = b.dataset.status || 'todo';
        state.list.push({ ...data, status: st, rating: 0, note: '', addedAt: Date.now(), startedAt: st === 'reading' ? Date.now() : null, readAt: '', detailsAt: data.description ? Date.now() : null });
        saveList();
        toast(`Dodano „${current.title}” do „${STATUS[st]}”`);
      }
      renderDetail(false);
      return;
    }
    if (a === 'remove') { const k = current.key; closeDetail(); removeItem(k); return; }
    flushNote();
    if (a === 'status') setStatus(current.key, b.dataset.status);
    if (a === 'up') setRating(current.key, 1);
    if (a === 'down') setRating(current.key, -1);
    const st = sheetBody.scrollTop;
    renderDetail(false);
    sheetBody.scrollTop = st;
  });

  $('#sheet-close').addEventListener('click', closeDetail);
  backdrop.addEventListener('click', () => {
    if (!$('#scanner').hidden) closeScanner();
    else if (!$('#settings').hidden) closeSettings();
    else closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#scanner').hidden) closeScanner();
    else if (!$('#settings').hidden) closeSettings();
    else if (!sheet.hidden) closeDetail();
  });

  // Przesunięcie karty w dół zamyka ją
  [sheet, $('#settings'), $('#scanner')].forEach((sh) => {
    let y0 = null, dy = 0;
    sh.addEventListener('touchstart', (e) => {
      if (e.target.closest('textarea, input, video')) { y0 = null; return; }
      const body = $('.sheet-body', sh);
      y0 = body.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0;
    }, { passive: true });
    sh.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 0) { sh.style.transform = `translateY(${dy}px)`; sh.style.transition = 'none'; }
    }, { passive: true });
    sh.addEventListener('touchend', () => {
      if (y0 === null) return;
      sh.style.transition = 'transform .2s ease-out';
      if (dy > 110) {
        sh.style.transform = 'translateY(100%)';
        setTimeout(() => {
          sh.style.transform = ''; sh.style.transition = '';
          if (sh === sheet) closeDetail(); else if (sh.id === 'settings') closeSettings(); else closeScanner();
        }, 190);
      } else sh.style.transform = '';
      y0 = null;
    });
  });

  // ---------- Skaner ----------
  const scannerEl = $('#scanner');
  const video = $('#scanner-video');
  let cam = null;

  function scanMsg(text, cls) {
    const el = $('#scan-status');
    el.textContent = text;
    el.className = 'scan-status' + (cls ? ' ' + cls : '');
  }
  async function startCamera() {
    $('#vf-off').hidden = true;
    scanMsg('Nakieruj aparat na kod kreskowy z tyłu książki. Trzymaj go poziomo, w ramce.');
    cam = new window.BWScanner.CameraScanner(video, onScanned);
    try {
      await cam.start();
    } catch (e) {
      cam = null;
      $('#vf-off-text').textContent = e.message;
      $('#vf-off').hidden = false;
      scanMsg('Możesz też zrobić zdjęcie kodu albo wpisać ISBN.');
    }
  }
  function stopCamera() { if (cam) cam.stop(); cam = null; }

  function openScanner() {
    backdrop.hidden = false;
    scannerEl.hidden = false;
    lockScroll(true);
    $('#isbn-input').value = '';
    startCamera();
  }
  function closeScanner() {
    stopCamera();
    scannerEl.hidden = true;
    if (!anySheetOpen()) { backdrop.hidden = true; lockScroll(false); }
  }
  async function onScanned(code) {
    if (navigator.vibrate) navigator.vibrate(60);
    const isbn = window.BWScanner.normalizeIsbn(code);
    if (!isbn) {
      scanMsg(`Odczytałem kod ${code}, ale to nie jest ISBN książki. Spróbuj kodu z napisem ISBN.`, 'error');
      setTimeout(() => { if (!scannerEl.hidden) startCamera(); }, 1800);
      return;
    }
    scanMsg(`Odczytano ISBN ${isbn}`, 'ok');
    stopCamera();
    closeScanner();
    go('search');
    input.value = isbn;
    $('#search-clear').hidden = false;
    state.query = isbn;
    await lookupIsbn(isbn);
  }

  $('#scan-open').addEventListener('click', openScanner);
  $('#scan-card').addEventListener('click', openScanner);
  $('#scanner-close').addEventListener('click', closeScanner);
  $('#camera-retry').addEventListener('click', startCamera);
  $('#scan-photo').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    stopCamera();
    scanMsg('Szukam kodu na zdjęciu…');
    try {
      const code = await window.BWScanner.decodeFile(f);
      if (code) onScanned(code);
      else { scanMsg('Nie widzę kodu na zdjęciu. Zrób zdjęcie z bliska, ostre i bez odblasków, albo wpisz ISBN.', 'error'); }
    } catch (err) {
      scanMsg('Nie udało się otworzyć zdjęcia. Spróbuj jeszcze raz.', 'error');
    }
  });
  $('#isbn-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const isbn = window.BWScanner.normalizeIsbn($('#isbn-input').value);
    if (!isbn) { scanMsg('To nie wygląda na poprawny ISBN. Sprawdź cyfry (10 albo 13).', 'error'); return; }
    onScanned(isbn);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (!scannerEl.hidden && !cam) startCamera();
  });

  // ---------- Ustawienia ----------
  const settings = $('#settings');
  function openSettings() {
    $('#key-input').value = state.key;
    $('#key-status').textContent = '';
    $('#backup-status').textContent = '';
    backdrop.hidden = false;
    settings.hidden = false;
    lockScroll(true);
  }
  function closeSettings() {
    settings.hidden = true;
    if (!anySheetOpen()) { backdrop.hidden = true; lockScroll(false); }
  }
  $('#open-settings').addEventListener('click', openSettings);
  $('#settings-close').addEventListener('click', closeSettings);

  $('#key-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = $('#key-input').value.trim();
    const st = $('#key-status');
    const prev = state.key;
    state.key = val;
    if (!val) { store.set(STORE_KEY, ''); st.textContent = 'Usunięto klucz. Appka działa bez niego.'; st.className = 'small ok'; return; }
    st.textContent = 'Sprawdzam klucz…'; st.className = 'small';
    try {
      await getJSON(gbUrl('/volumes', { q: 'isbn:9780306406157', maxResults: 1 }));
      store.set(STORE_KEY, val);
      st.textContent = 'Klucz działa.'; st.className = 'small ok';
    } catch (err) {
      state.key = prev;
      st.textContent = err.code === 'badkey' ? 'Google nie przyjął tego klucza. Skopiuj go jeszcze raz w całości.' : err.message;
      st.className = 'small err';
    }
  });

  $('#export-btn').addEventListener('click', async () => {
    const payload = JSON.stringify({ app: 'bookworm', version: 1, exportedAt: new Date().toISOString(), items: state.list }, null, 2);
    const name = `bookworm-polka-${today()}.json`;
    const file = new File([payload], name, { type: 'application/json' });
    const bs = $('#backup-status');
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'BOOK WORM – kopia półki' });
        bs.textContent = 'Kopia gotowa.';
        return;
      }
    } catch (err) { if (err.name === 'AbortError') return; }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    bs.textContent = `Zapisano plik ${name}.`;
  });

  $('#import-input').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    const bs = $('#backup-status');
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const items = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(items) || (data.app && data.app !== 'bookworm')) throw new Error('format');
      let added = 0, updated = 0;
      items.forEach((it) => {
        if (!it || !it.key || !it.title) return;
        const ex = findItem(it.key);
        const clean = { status: STATUS[it.status] ? it.status : 'todo', rating: it.rating || 0, note: it.note || '', readAt: it.readAt || '' };
        if (ex) { Object.assign(ex, clean); updated++; }
        else { state.list.push({ ...it, ...clean, addedAt: it.addedAt || Date.now() }); added++; }
      });
      saveList();
      renderList();
      bs.textContent = `Zaimportowano: ${added} ${plural(added, 'nowa książka', 'nowe książki', 'nowych książek')}, zaktualizowano ${updated}.`;
    } catch (err) {
      bs.textContent = 'To nie jest plik kopii z BOOK WORM. Wybierz plik .json wyeksportowany z appki.';
    }
  });

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, actionLabel, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
    t.hidden = false;
    if (actionLabel) $('button', t).addEventListener('click', () => { action(); t.hidden = true; }, { once: true });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, actionLabel ? 5000 : 2600);
  }

  // ---------- Start ----------
  renderList();
  renderResults();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
