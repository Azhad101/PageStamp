/* ==========================================================================
   PAGESTAMP — Personal Reading Passport JavaScript Engine
   Vanilla JS App State, Open Library API Integration, SPA Routing & Animations
   ========================================================================== */

(function () {
  'use strict';

  // Key for localStorage persistence
  const STORAGE_KEY_PROFILE = 'pagestamp_user_profile_v1';
  const STORAGE_KEY_BOOKS = 'pagestamp_user_books_v1';
  const STORAGE_KEY_SOUND = 'pagestamp_sound_pref_v1';
  const STORAGE_KEY_SOUVENIRS = 'pagestamp_souvenirs_v1';

  // ==========================================================================
  // JOY LAYER — celebration particles, toasts, ink trail, animated counters
  // Kept as small, dependency-free helpers so they can't break core app logic.
  // ==========================================================================
  const Joy = (function () {
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function burst(originEl, opts) {
      if (prefersReducedMotion || !originEl) return;
      const options = Object.assign({ count: 22, colors: ['#d4af37', '#f4e086', '#8b0000', '#9a7b1c'], spread: 220, duration: 1.1 }, opts || {});
      const rect = originEl.getBoundingClientRect();
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;

      const field = document.createElement('div');
      field.className = 'joy-particle-field';
      document.body.appendChild(field);

      for (let i = 0; i < options.count; i++) {
        const p = document.createElement('div');
        p.className = 'joy-particle';
        const angle = Math.random() * Math.PI * 2;
        const dist = options.spread * (0.4 + Math.random() * 0.6);
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist - Math.random() * 60; // slight upward bias
        const size = 4 + Math.random() * 7;
        const color = options.colors[Math.floor(Math.random() * options.colors.length)];
        const dur = options.duration * (0.8 + Math.random() * 0.5);

        p.style.left = originX + 'px';
        p.style.top = originY + 'px';
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.background = color;
        p.style.setProperty('--px', px + 'px');
        p.style.setProperty('--py', py + 'px');
        p.style.setProperty('--pr', (Math.random() * 360) + 'deg');
        p.style.setProperty('--pdur', dur + 's');

        field.appendChild(p);
      }

      setTimeout(() => field.remove(), (options.duration * 1000) + 300);
    }

    function toast(message, icon) {
      if (!message) return;
      const el = document.createElement('div');
      el.className = 'joy-toast';
      el.innerHTML = `<span class="joy-toast-icon">${icon || '✦'}</span><span>${message}</span>`;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('toast-show'));
      setTimeout(() => el.remove(), 2700);
    }

    function inkTrailAt(x, y) {
      if (prefersReducedMotion) return;
      const dot = document.createElement('div');
      dot.className = 'ink-trail-dot';
      dot.style.left = (x - 2.5) + 'px';
      dot.style.top = (y - 2.5) + 'px';
      document.body.appendChild(dot);
      setTimeout(() => dot.remove(), 650);
    }

    // Animates a number from its current textContent up to `target`.
    function countTo(el, target, duration) {
      if (!el) return;
      const start = parseInt(el.textContent, 10) || 0;
      if (prefersReducedMotion || start === target) {
        el.textContent = target;
        return;
      }
      const dur = duration || 600;
      const startTime = performance.now();
      function tick(now) {
        const progress = Math.min(1, (now - startTime) / dur);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
        const value = Math.round(start + (target - start) * eased);
        el.textContent = value;
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = target;
      }
      requestAnimationFrame(tick);
    }

    return { burst, toast, inkTrailAt, countTo, prefersReducedMotion };
  })();

  // ==========================================================================
  // SOUND LAYER — page-flip, stamp thud, pen-scratch, unlock chime.
  // All sounds are synthesized on the fly with the Web Audio API (no external
  // audio files to fetch), so the passport feels alive even offline. Muting
  // preference persists across sessions.
  // ==========================================================================
  const Sound = (function () {
    let ctx = null;
    let muted = false;

    try {
      muted = localStorage.getItem(STORAGE_KEY_SOUND) === 'muted';
    } catch (e) { /* ignore */ }

    function ensureContext() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    }

    function noiseBuffer(c, duration) {
      const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    // A soft paper "swoosh" — used whenever the user turns to a new page
    // (switching views, opening the passport, boarding a book).
    function pageFlip() {
      if (muted) return;
      const c = ensureContext();
      if (!c) return;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c, 0.28);
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(2200, c.currentTime);
      filter.frequency.exponentialRampToValueAtTime(650, c.currentTime + 0.25);
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, c.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.26);
      src.connect(filter); filter.connect(gain); gain.connect(c.destination);
      src.start(); src.stop(c.currentTime + 0.3);
    }

    // A heavy ink-stamp "thud" — timed to land with the visual stamp impact.
    function stampThud() {
      if (muted) return;
      const c = ensureContext();
      if (!c) return;

      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(170, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(45, c.currentTime + 0.22);
      const oscGain = c.createGain();
      oscGain.gain.setValueAtTime(0.0001, c.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.85, c.currentTime + 0.012);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.32);
      osc.connect(oscGain); oscGain.connect(c.destination);
      osc.start(); osc.stop(c.currentTime + 0.34);

      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c, 0.07);
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.55, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
      src.connect(filter); filter.connect(gain); gain.connect(c.destination);
      src.start(); src.stop(c.currentTime + 0.09);
    }

    // A few short scratchy strokes — played while a personal note is jotted.
    function penScratch() {
      if (muted) return;
      const c = ensureContext();
      if (!c) return;
      const strokes = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < strokes; i++) {
        const t0 = c.currentTime + i * 0.13;
        const src = c.createBufferSource();
        src.buffer = noiseBuffer(c, 0.09);
        const filter = c.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2500 + Math.random() * 1500;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
        src.connect(filter); filter.connect(gain); gain.connect(c.destination);
        src.start(t0); src.stop(t0 + 0.1);
      }
    }

    // A bright little arpeggio — for milestone and souvenir unlocks.
    function chime() {
      if (muted) return;
      const c = ensureContext();
      if (!c) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const t0 = c.currentTime + i * 0.09;
        const osc = c.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t0); osc.stop(t0 + 0.55);
      });
    }

    function isMuted() { return muted; }

    function toggleMuted() {
      muted = !muted;
      try { localStorage.setItem(STORAGE_KEY_SOUND, muted ? 'muted' : 'on'); } catch (e) { /* ignore */ }
      return muted;
    }

    // Browsers block audio until a user gesture — prime the context quietly
    // on the first click/keypress anywhere on the page.
    function primeOnFirstGesture() {
      const handler = () => {
        ensureContext();
        document.removeEventListener('click', handler);
        document.removeEventListener('keydown', handler);
      };
      document.addEventListener('click', handler, { once: true });
      document.addEventListener('keydown', handler, { once: true });
    }
    primeOnFirstGesture();

    return { pageFlip, stampThud, penScratch, chime, isMuted, toggleMuted };
  })();

  // ==========================================================================
  // PASSPORT OFFICER — in-character notification voice. Replaces generic
  // toasts with short lines "delivered" by the officer stamping your book,
  // picked at random from a small phrase bank per event type.
  // ==========================================================================
  const Officer = (function () {
    const LINES = {
      stamped: [
        (d) => `Stamp approved for "${d.title}". Filed, sealed, and logged.`,
        (d) => `"${d.title}" — processed and stamped without a second glance.`,
        (d) => `The Officer stamps "${d.title}" firmly. Welcome to the archive.`
      ],
      milestone: [
        (d) => `Milestone cleared: ${d.label}. The Officer allows a rare smile.`,
        (d) => `${d.label} — noted for the official record.`
      ],
      boarding: [
        (d) => `Boarding pass issued for "${d.title}". Gate is open — bon voyage.`,
        (d) => `"${d.title}" cleared for departure.`
      ],
      touchdown: [
        (d) => `Touchdown logged for "${d.title}". Present it at the stamp desk when ready.`
      ],
      atlasLocked: [
        () => `No pin to show yet, traveler. Finish a book first.`
      ],
      souvenir: [
        (d) => `The Officer slides a small souvenir across the counter: "${d.title}."`
      ]
    };

    function pick(key, data) {
      const bank = LINES[key] || [() => 'Noted.'];
      const fn = bank[Math.floor(Math.random() * bank.length)];
      try { return fn(data || {}); } catch (e) { return 'Noted.'; }
    }

    function renderToast(message, icon) {
      const el = document.createElement('div');
      el.className = 'officer-toast';
      el.innerHTML = `
        <div class="officer-toast-badge">${icon || '🛂'}</div>
        <div class="officer-toast-body">
          <div class="officer-toast-heading">PASSPORT OFFICER</div>
          <div class="officer-toast-msg">${message}</div>
        </div>
      `;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('toast-show'));
      setTimeout(() => el.remove(), 3700);
    }

    function say(key, data, icon) {
      const escapedData = {};
      if (data) {
        Object.keys(data).forEach(k => {
          escapedData[k] = typeof data[k] === 'string' ? escapeHtml(data[k]) : data[k];
        });
      }
      renderToast(pick(key, escapedData), icon);
    }

    return { say };
  })();

  // ==========================================================================
  // GENRE READING VISAS — "Read N books in a genre, unlock a visa stamp"
  // Genres are auto-detected from Open Library subject data when a book is
  // added, but the user can always override the tag(s) from the book's detail
  // page. A book can carry more than one genre tag (e.g. a sci-fi classic).
  // ==========================================================================
  const GenreVisas = (function () {
    // The visa catalog. `id` must be stable (used as a storage/DOM key).
    // `keywords` are lower-cased substrings matched against Open Library
    // subject strings for auto-detection; `matchTag` is the canonical genre
    // tag stored on the book once detected (or chosen manually).
    const CATALOG = [
      {
        id: 'classics',
        matchTag: 'classics',
        required: 10,
        icon: '🏛️',
        title: 'Classics Visa',
        subtitle: 'Read 10 classics',
        keywords: ['classic', 'classic literature', 'literary fiction', 'literature']
      },
      {
        id: 'mystery',
        matchTag: 'mystery',
        required: 20,
        icon: '🕵️',
        title: 'Detective Visa',
        subtitle: 'Read 20 mysteries',
        keywords: ['mystery', 'mysteries', 'detective', 'crime fiction', 'crime', 'noir', 'whodunit']
      },
      {
        id: 'sci-fi',
        matchTag: 'sci-fi',
        required: 15,
        icon: '🚀',
        title: 'Voyager Visa',
        subtitle: 'Read 15 sci-fi novels',
        keywords: ['science fiction', 'sci-fi', 'space opera', 'dystopia', 'dystopian']
      },
      {
        id: 'fantasy',
        matchTag: 'fantasy',
        required: 15,
        icon: '🐉',
        title: "Realmwalker's Visa",
        subtitle: 'Read 15 fantasy tales',
        keywords: ['fantasy', 'epic fantasy', 'sword and sorcery', 'magic', 'fairy tales']
      },
      {
        id: 'romance',
        matchTag: 'romance',
        required: 12,
        icon: '💌',
        title: "Sweetheart's Visa",
        subtitle: 'Read 12 romance novels',
        keywords: ['romance', 'love stories']
      },
      {
        id: 'thriller',
        matchTag: 'thriller',
        required: 15,
        icon: '🗡️',
        title: 'Suspense Visa',
        subtitle: 'Read 15 thrillers',
        keywords: ['thriller', 'suspense', 'psychological thriller', 'espionage']
      },
      {
        id: 'horror',
        matchTag: 'horror',
        required: 10,
        icon: '🕯️',
        title: "Nightwalker's Visa",
        subtitle: 'Read 10 horror titles',
        keywords: ['horror', 'ghost stories', 'supernatural', 'gothic fiction']
      },
      {
        id: 'nonfiction',
        matchTag: 'nonfiction',
        required: 12,
        icon: '🗺️',
        title: "Scholar's Visa",
        subtitle: 'Read 12 nonfiction books',
        keywords: ['nonfiction', 'non-fiction', 'biography', 'history', 'essays', 'memoir']
      },
      {
        id: 'poetry',
        matchTag: 'poetry',
        required: 8,
        icon: '🖋️',
        title: "Wordsmith's Visa",
        subtitle: 'Read 8 poetry collections',
        keywords: ['poetry', 'poems']
      },
      {
        id: 'ya',
        matchTag: 'ya',
        required: 15,
        icon: '🌟',
        title: "Young Explorer's Visa",
        subtitle: 'Read 15 YA novels',
        keywords: ['young adult', 'juvenile fiction', 'ya']
      }
    ];

    function byId(id) {
      return CATALOG.find(v => v.id === id);
    }

    // Given an array of Open Library subject strings, return the set of
    // canonical genre tags detected (a book can match more than one).
    function detectTagsFromSubjects(subjects) {
      if (!subjects || !subjects.length) return [];
      const lowerSubjects = subjects.map(s => String(s).toLowerCase());
      const matched = new Set();

      CATALOG.forEach(visa => {
        const hit = visa.keywords.some(kw => lowerSubjects.some(s => s.includes(kw)));
        if (hit) matched.add(visa.matchTag);
      });

      return Array.from(matched);
    }

    // Count of finished books carrying a given genre tag.
    function finishedCountForTag(books, tag) {
      return books.filter(b => b.status === 'finished' && Array.isArray(b.genreTags) && b.genreTags.includes(tag)).length;
    }

    function progressForVisa(books, visa) {
      const count = finishedCountForTag(books, visa.matchTag);
      const percent = Math.min(100, Math.round((count / visa.required) * 100));
      return { count, percent, unlocked: count >= visa.required };
    }

    return { CATALOG, byId, detectTagsFromSubjects, finishedCountForTag, progressForVisa };
  })();

  // ==========================================================================
  // POSTCARDS & SOUVENIRS — small collectible surprises unlocked at reading
  // milestones. Unlocked ids persist in localStorage; `evaluate()` compares
  // the current stats against the catalog and reports anything newly earned
  // so the caller can queue a reveal.
  // ==========================================================================
  const Souvenirs = (function () {
    const CATALOG = [
      { id: 'first-stamp', icon: '📮', title: 'Welcome Postcard', blurb: 'Your very first stamp — the journey begins.', trigger: (s) => s.finishedCount >= 1 },
      { id: 'five-stamps', icon: '🧧', title: 'Frequent Flyer Card', blurb: 'Five stamps in your passport already.', trigger: (s) => s.finishedCount >= 5 },
      { id: 'ten-stamps', icon: '🎟️', title: 'Decade Traveler Ticket', blurb: 'Ten books logged — a true explorer.', trigger: (s) => s.finishedCount >= 10 },
      { id: 'twentyfive-stamps', icon: '🏺', title: 'Antique Souvenir', blurb: 'Twenty-five stamps — a collector\'s shelf.', trigger: (s) => s.finishedCount >= 25 },
      { id: 'fifty-stamps', icon: '👑', title: 'Golden Jubilee Medal', blurb: 'Fifty books. Legendary status.', trigger: (s) => s.finishedCount >= 50 },
      { id: 'first-country', icon: '🗺️', title: 'First Pin Postcard', blurb: 'Your first country discovered on the atlas.', trigger: (s) => s.countryCount >= 1 },
      { id: 'five-countries', icon: '🧭', title: "Globetrotter's Compass", blurb: 'Five countries discovered on your map.', trigger: (s) => s.countryCount >= 5 },
      { id: 'ten-countries', icon: '🌐', title: 'World Wanderer Snowglobe', blurb: 'Ten countries pinned to your atlas.', trigger: (s) => s.countryCount >= 10 },
      { id: 'mood-variety', icon: '🎭', title: 'Every Mood Postcard', blurb: 'Loved, liked, and disliked — you\'ve felt it all.', trigger: (s) => s.moods.has('Loved it') && s.moods.has('It was okay') && s.moods.has('Not for me') },
      { id: 'goal-complete', icon: '🏆', title: "Champion's Trophy", blurb: 'Yearly reading goal fully completed.', trigger: (s) => s.goalPercent >= 100 },
      { id: 'first-visa', icon: '🛂', title: 'Genre Visa Souvenir', blurb: 'Unlocked your first genre reading visa.', trigger: (s) => s.genresUnlocked >= 1 }
    ];

    function computeStats(appState) {
      const finished = appState.books.filter(b => b.status === 'finished');
      const moods = new Set(finished.map(b => b.moodTag).filter(Boolean));
      const countries = new Set(
        finished
          .map(b => countryForBook(b))
          .filter(Boolean)
          .map(c => c.code)
      );
      const goal = Math.max(1, appState.profile.yearlyGoal || 1);
      const genresUnlocked = GenreVisas.CATALOG.filter(v => GenreVisas.progressForVisa(appState.books, v).unlocked).length;
      return {
        finishedCount: finished.length,
        moods,
        countryCount: countries.size,
        goalPercent: (finished.length / goal) * 100,
        genresUnlocked
      };
    }

    // Which catalog ids currently qualify, regardless of what's already unlocked.
    function qualifyingIds(appState) {
      const stats = computeStats(appState);
      return CATALOG.filter(item => {
        try { return item.trigger(stats); } catch (e) { return false; }
      }).map(item => item.id);
    }

    // Used once, on a brand-new install, so pre-existing demo progress
    // doesn't trigger a flood of "new" reveals the moment the app opens.
    function computeBaseline(appState) {
      return qualifyingIds(appState);
    }

    // Compares current qualification against what's already been collected;
    // persists and returns any newly-earned items (full catalog objects).
    function evaluate(appState, alreadyCollected, onPersist) {
      const nowQualifying = qualifyingIds(appState);
      const newlyEarned = nowQualifying.filter(id => alreadyCollected.indexOf(id) === -1);
      if (newlyEarned.length) {
        newlyEarned.forEach(id => alreadyCollected.push(id));
        if (onPersist) onPersist();
      }
      return newlyEarned.map(id => CATALOG.find(c => c.id === id)).filter(Boolean);
    }

    function byId(id) {
      return CATALOG.find(c => c.id === id);
    }

    return { CATALOG, computeStats, computeBaseline, evaluate, byId };
  })();

  // ==========================================================================
  // INITIAL DEMO DATA (Pre-loaded if localStorage is empty)
  // ==========================================================================
  const defaultProfile = {
    name: 'Bibliophile Explorer',
    yearlyGoal: 12,
    avatar: '📖',
    passportNo: 'BK-2026-' + Math.floor(1000 + Math.random() * 9000),
    issueDate: new Date().toISOString().split('T')[0]
  };

  const defaultBooks = [
    {
      id: 'demo-1',
      title: 'Dune',
      author: 'Frank Herbert',
      coverUrl: 'https://covers.openlibrary.org/b/id/8575747-M.jpg',
      status: 'finished',
      progress: 100,
      dateFinished: '2026-07-20',
      moodTag: 'Loved it',
      personalNote: 'Mind-blowing worldbuilding. The spice must flow!',
      genreTags: ['sci-fi']
    },
    {
      id: 'demo-2',
      title: 'The Great Gatsby',
      author: 'F. Scott Fitzgerald',
      coverUrl: 'https://covers.openlibrary.org/b/id/7222246-M.jpg',
      status: 'finished',
      progress: 100,
      dateFinished: '2026-07-15',
      moodTag: 'Loved it',
      personalNote: 'Gorgeous prose. The green light at the end of the dock.',
      genreTags: ['classics']
    },
    {
      id: 'demo-3',
      title: '1984',
      author: 'George Orwell',
      coverUrl: 'https://covers.openlibrary.org/b/id/8575806-M.jpg',
      status: 'currently-reading',
      progress: 65,
      dateFinished: null,
      moodTag: null,
      personalNote: '',
      genreTags: ['classics', 'sci-fi']
    },
    {
      id: 'demo-4',
      title: 'The Hobbit',
      author: 'J.R.R. Tolkien',
      coverUrl: 'https://covers.openlibrary.org/b/id/8406786-M.jpg',
      status: 'want-to-read',
      progress: 0,
      dateFinished: null,
      moodTag: null,
      personalNote: '',
      genreTags: ['fantasy', 'classics']
    }
  ];

  // ==========================================================================
  // APP STATE MANAGEMENT
  // ==========================================================================
  let state = {
    profile: loadProfile(),
    books: loadBooks(),
    // null signals "no save file yet" — a baseline gets computed once the
    // Souvenirs catalog is available, so pre-existing demo progress doesn't
    // trigger a flood of reveals the moment the app opens.
    souvenirs: loadSouvenirsRaw(),
    activeView: 'home',
    activeStampFilter: 'all',
    activeStampPage: 1,
    pendingFinishBookId: null
  };

  const STAMPS_PER_PAGE = 6;

  function loadProfile() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROFILE);
      return saved ? JSON.parse(saved) : { ...defaultProfile };
    } catch (e) {
      console.warn('Could not parse profile from localStorage', e);
      return { ...defaultProfile };
    }
  }

  function loadBooks() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BOOKS);
      return saved ? JSON.parse(saved) : [...defaultBooks];
    } catch (e) {
      console.warn('Could not parse books from localStorage', e);
      return [...defaultBooks];
    }
  }

  function loadSouvenirsRaw() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SOUVENIRS);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.warn('Could not parse souvenirs from localStorage', e);
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(state.profile));
      localStorage.setItem(STORAGE_KEY_BOOKS, JSON.stringify(state.books));
      localStorage.setItem(STORAGE_KEY_SOUVENIRS, JSON.stringify(state.souvenirs || []));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  // ==========================================================================
  // DOM ELEMENT REFERENCES
  // ==========================================================================
  const DOM = {
    bootOverlay: document.getElementById('passport-boot-screen'),
    bookFrontCover: document.getElementById('book-front-cover'),
    appLayout: document.querySelector('.app-layout'),
    btnReplayBoot: document.getElementById('btn-replay-boot'),
    btnReopenPassport: document.getElementById('btn-reopen-passport'),
    
    sidebar: document.getElementById('main-sidebar'),
    sidebarHitZone: document.getElementById('sidebar-hit-zone'),
    btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
    btnToggleSound: document.getElementById('btn-toggle-sound'),
    soundToggleIcon: document.getElementById('sound-toggle-icon'),
    
    navItems: document.querySelectorAll('.nav-menu .nav-item'),
    views: document.querySelectorAll('.view-section'),
    
    // Sidebar profile elements
    sidebarAvatar: document.getElementById('sidebar-avatar'),
    sidebarHolderName: document.getElementById('sidebar-holder-name'),
    
    // Passport aging target (the open booklet spread itself)
    passportSpread: document.querySelector('.passport-open-spread'),
    // Passport Booklet Open Spread elements
    homeUserName: document.getElementById('home-user-name'),
    homePassportNum: document.getElementById('home-passport-num'),
    homeIssueDate: document.getElementById('home-issue-date'),
    userAvatarDisplay: document.getElementById('user-avatar-display'),
    mrzLine1: document.getElementById('mrz-line-1'),
    mrzLine2: document.getElementById('mrz-line-2'),
    
    statFinishedCount: document.getElementById('stat-finished-count'),
    statWantCount: document.getElementById('stat-want-count'),
    homeChallengeRing: document.getElementById('home-challenge-ring'),
    homeChallengePercent: document.getElementById('home-challenge-percent'),
    homeCurrentBookContainer: document.getElementById('home-current-book-container'),
    passportCollageContainer: document.getElementById('passport-collage-container'),
    stampFilterBtns: document.querySelectorAll('.stamp-filters .filter-btn'),
    stampPageControls: document.getElementById('stamp-page-controls'),
    stampPageDots: document.getElementById('stamp-page-dots'),
    btnStampPagePrev: document.getElementById('btn-stamp-page-prev'),
    btnStampPageNext: document.getElementById('btn-stamp-page-next'),
    stampPageFooterNum: document.getElementById('stamp-page-footer-num'),
    btnEditName: document.getElementById('btn-edit-name'),
    btnChangeAvatar: document.getElementById('btn-change-avatar'),
    
    // Search elements
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    btnSubmitSearch: document.getElementById('btn-submit-search'),
    searchResultsGrid: document.getElementById('search-results-grid'),
    searchStatus: document.getElementById('search-status'),
    genreChips: document.querySelectorAll('.chip-btn'),
    
    // Want to Read elements
    shelfBooksGrid: document.getElementById('shelf-books-grid'),
    boardingGateDropzone: document.getElementById('boarding-gate-dropzone'),
    
    // Currently Reading elements
    readingActiveContainer: document.getElementById('reading-active-container'),
    
    // Challenge Visa Page elements
    yearlyGoalInput: document.getElementById('yearly-goal-input'),
    btnSaveGoal: document.getElementById('btn-save-goal'),
    visaProgressText: document.getElementById('visa-progress-text'),
    visaSlotsGrid: document.getElementById('visa-slots-grid'),
    milestone25: document.getElementById('milestone-25'),
    milestone50: document.getElementById('milestone-50'),
    milestone75: document.getElementById('milestone-75'),
    milestone100: document.getElementById('milestone-100'),

    // World Atlas elements
    atlasCountriesCount: document.getElementById('atlas-countries-count'),
    atlasCountriesTotal: document.getElementById('atlas-countries-total'),
    atlasPinsLayer: document.getElementById('atlas-pins-layer'),
    atlasLegend: document.getElementById('atlas-legend'),
    
    // Finish Modal elements
    modalFinish: document.getElementById('modal-finish'),
    btnCloseFinishModal: document.getElementById('btn-close-finish-modal'),
    btnCancelFinish: document.getElementById('btn-cancel-finish'),
    finishBookForm: document.getElementById('finish-book-form'),
    finishModalCover: document.getElementById('finish-modal-cover'),
    finishModalTitle: document.getElementById('finish-modal-title'),
    finishModalAuthor: document.getElementById('finish-modal-author'),
    finishModalDate: document.getElementById('finish-modal-date'),
    animatedStampBadge: document.getElementById('animated-stamp-badge'),
    stampMoodText: document.getElementById('stamp-mood-text'),
    stampDateText: document.getElementById('stamp-date-text'),
    finishPersonalNote: document.getElementById('finish-personal-note'),
    
    // Detail Modal elements
    modalDetail: document.getElementById('modal-detail'),
    btnCloseDetailModal: document.getElementById('btn-close-detail-modal'),
    detailModalContent: document.getElementById('detail-modal-content'),
    
    // Profile Modal elements
    modalProfile: document.getElementById('modal-profile'),
    btnCloseProfileModal: document.getElementById('btn-close-profile-modal'),
    profileForm: document.getElementById('profile-form'),
    inputProfileName: document.getElementById('input-profile-name'),
    emojiBtns: document.querySelectorAll('.emoji-btn'),

    // Souvenir Collection & Reveal Modal elements
    souvenirGrid: document.getElementById('souvenir-grid'),
    souvenirCountText: document.getElementById('souvenir-count-text'),
    modalSouvenir: document.getElementById('modal-souvenir'),
    btnCloseSouvenirModal: document.getElementById('btn-close-souvenir-modal'),
    souvenirModalContent: document.getElementById('souvenir-modal-content')
  };

  // ==========================================================================
  // REALISTIC 3D PASSPORT BOOK OPENING ANIMATION
  // ==========================================================================
  function playBootAnimation() {
    if (!DOM.bootOverlay || !DOM.bookFrontCover) return;

    // Keep the site inert and hidden behind the overlay until the passport
    // has finished opening — the website "opens" only once this completes.
    if (DOM.appLayout) DOM.appLayout.classList.remove('site-revealed');

    DOM.bootOverlay.classList.remove('hidden');
    DOM.bootOverlay.style.pointerEvents = '';
    DOM.bookFrontCover.classList.remove('open-book');

    // Manual only: the passport stays closed until the user clicks it.
    const triggerOpen = () => {
      DOM.bookFrontCover.classList.add('open-book');
      Sound.pageFlip();

      // Wait for the page-turn animation (1.4s) to finish, then fade the
      // overlay out (0.35s) and reveal the site right as that fade completes.
      setTimeout(() => {
        DOM.bootOverlay.classList.add('hidden');

        const revealSite = () => {
          if (DOM.appLayout) DOM.appLayout.classList.add('site-revealed');
        };

        // The overlay's fade-out is short (0.35s); just wait it out directly
        // rather than chaining a transitionend listener plus a separate
        // safety timeout, which was adding unnecessary delay.
        setTimeout(revealSite, 350);
      }, 1400);
    };

    DOM.bootOverlay.onclick = () => {
      DOM.bootOverlay.onclick = null;
      triggerOpen();
    };
  }

  // ==========================================================================
  // SIDEBAR SLIDING & HOVER CONTROLLER
  // ==========================================================================
  function initSidebarHover() {
    if (!DOM.sidebar || !DOM.sidebarHitZone) return;

    let hoverTimeout = null;

    const openSidebar = () => {
      clearTimeout(hoverTimeout);
      DOM.sidebar.classList.add('sidebar-open');
    };

    const closeSidebar = () => {
      hoverTimeout = setTimeout(() => {
        DOM.sidebar.classList.remove('sidebar-open');
      }, 350);
    };

    DOM.sidebarHitZone.addEventListener('mouseenter', openSidebar);
    DOM.sidebar.addEventListener('mouseenter', openSidebar);
    
    DOM.sidebarHitZone.addEventListener('mouseleave', closeSidebar);
    DOM.sidebar.addEventListener('mouseleave', closeSidebar);

    if (DOM.btnToggleSidebar) {
      DOM.btnToggleSidebar.addEventListener('click', () => {
        DOM.sidebar.classList.toggle('sidebar-open');
      });
    }
  }

  // ==========================================================================
  // ROUTER & NAVIGATION
  // ==========================================================================
  function switchView(viewName, opts) {
    const options = opts || {};
    if (!options.silent && viewName !== state.activeView) {
      Sound.pageFlip();
    }
    state.activeView = viewName;
    
    DOM.navItems.forEach(item => {
      if (item.getAttribute('data-view') === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    DOM.views.forEach(section => {
      if (section.id === `view-${viewName}`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    renderActiveView();
  }

  function renderActiveView() {
    updateProfileUI();

    switch (state.activeView) {
      case 'home':
        renderPassportFirstPage();
        break;
      case 'shelf':
        renderShelf();
        break;
      case 'reading':
        renderCurrentlyReading();
        break;
      case 'challenge':
        renderChallengeVisaPage();
        break;
      case 'atlas':
        renderWorldAtlas();
        break;
      default:
        break;
    }
  }

  // ==========================================================================
  // PROFILE & PASSPORT COVER UI
  // ==========================================================================
  function updateProfileUI() {
    DOM.sidebarHolderName.textContent = state.profile.name;
    DOM.sidebarAvatar.textContent = state.profile.avatar;
    
    DOM.homeUserName.textContent = state.profile.name;
    DOM.userAvatarDisplay.textContent = state.profile.avatar;
    DOM.homePassportNum.textContent = state.profile.passportNo;
    DOM.homeIssueDate.textContent = state.profile.issueDate;

    // Generate dynamic MRZ line
    const cleanName = state.profile.name.toUpperCase().replace(/[^A-Z]/g, '');
    if (DOM.mrzLine1) {
      DOM.mrzLine1.textContent = `P<LECTURA${cleanName.padEnd(25, '<')}`;
    }
  }

  // ==========================================================================
  // PASSPORT AGING — visual wear that grows with the number of stamps.
  // ==========================================================================
  function applyPassportAging(finishedCount) {
    if (!DOM.passportSpread) return;
    DOM.passportSpread.classList.remove('wear-level-1', 'wear-level-2', 'wear-level-3', 'wear-level-4', 'wear-level-5');
    let level = 0;
    if (finishedCount >= 30) level = 5;
    else if (finishedCount >= 15) level = 4;
    else if (finishedCount >= 7) level = 3;
    else if (finishedCount >= 3) level = 2;
    else if (finishedCount >= 1) level = 1;
    if (level > 0) DOM.passportSpread.classList.add(`wear-level-${level}`);
  }

  // ==========================================================================
  // 1. AUTHENTIC PASSPORT OPEN BOOKLET PAGE SPREAD (HOMEPAGE)
  // ==========================================================================
  function renderPassportFirstPage() {
    const finishedBooks = state.books.filter(b => b.status === 'finished');
    const wantCount = state.books.filter(b => b.status === 'want-to-read').length;
    const currentlyReadingBook = state.books.find(b => b.status === 'currently-reading');

    Joy.countTo(DOM.statFinishedCount, finishedBooks.length);
    Joy.countTo(DOM.statWantCount, wantCount);
    applyPassportAging(finishedBooks.length);

    // Challenge Progress Ring Calculation
    const goal = state.profile.yearlyGoal || 1;
    const percent = Math.min(100, Math.round((finishedBooks.length / goal) * 100));
    
    DOM.homeChallengePercent.textContent = `${percent}%`;
    if (DOM.homeChallengePercent) {
      DOM.homeChallengePercent.style.transition = 'transform 0.3s var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))';
      DOM.homeChallengePercent.style.transform = 'scale(1.15)';
      setTimeout(() => { DOM.homeChallengePercent.style.transform = 'scale(1)'; }, 150);
    }
    const circumference = 2 * Math.PI * 18; // r = 18
    const offset = circumference - (percent / 100) * circumference;
    DOM.homeChallengeRing.style.strokeDasharray = `${circumference}`;
    DOM.homeChallengeRing.style.strokeDashoffset = `${offset}`;

    // Render Currently Reading Mini Preview
    if (currentlyReadingBook) {
      DOM.homeCurrentBookContainer.innerHTML = `
        <div class="home-current-card">
          <img src="${escapeHtml(currentlyReadingBook.coverUrl)}" alt="Cover" class="mini-cover" onerror="this.onerror=null; this.src='https://via.placeholder.com/40x58/2b1a1d/d4af37?text=Book';">
          <div class="home-current-details">
            <h4 class="home-current-title">${escapeHtml(currentlyReadingBook.title)}</h4>
            <p class="home-current-author">${escapeHtml(currentlyReadingBook.author)}</p>
            <div class="mini-progress-bar">
              <div class="mini-progress-fill" style="width: ${currentlyReadingBook.progress}%;"></div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.PageStamp.navigateTo('reading')">Continue</button>
        </div>
      `;
    } else {
      DOM.homeCurrentBookContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 0.5rem;">
          <p style="font-size: 0.78rem;">No active reading voyage currently selected.</p>
          <button class="btn btn-secondary btn-sm" style="margin-top: 0.35rem;" onclick="window.PageStamp.navigateTo('search')">Find a Book</button>
        </div>
      `;
    }

    // Render Organic Passport Stamp Collage on Page 02
    renderStampCollage(finishedBooks);
  }

  function renderStampCollage(allFinished) {
    let filtered = allFinished;

    if (state.activeStampFilter !== 'all') {
      filtered = allFinished.filter(b => b.moodTag === state.activeStampFilter);
    }

    if (filtered.length === 0) {
      DOM.passportCollageContainer.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1; background: transparent; border: 1px dashed var(--border-parchment); padding: 2rem 1rem;">
          <div class="empty-icon">🏵️</div>
          <h3 style="color: var(--ink-blue); font-size: 1.1rem;">No Stamps Collected Yet</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem;">Mark completed books as finished to stamp them onto your passport page collage!</p>
          <button class="btn btn-primary" style="margin-top: 0.75rem;" onclick="window.PageStamp.navigateTo('search')">Search Books</button>
        </div>
      `;
      DOM.stampPageControls.classList.add('hidden');
      DOM.stampPageFooterNum.textContent = 'PAGE 02';
      return;
    }

    // Split the collected stamps into fixed-size pages (6 stamps each) so a
    // new "passport page" is turned to instead of the collage stretching.
    const totalPages = Math.max(1, Math.ceil(filtered.length / STAMPS_PER_PAGE));

    // Clamp the active page in case books were removed/filtered down.
    if (state.activeStampPage > totalPages) state.activeStampPage = totalPages;
    if (state.activeStampPage < 1) state.activeStampPage = 1;

    const startIdx = (state.activeStampPage - 1) * STAMPS_PER_PAGE;
    const pageItems = filtered.slice(startIdx, startIdx + STAMPS_PER_PAGE);

    const angles = [-5, 4, -2, 6, -4, 3, -7, 5];

    DOM.passportCollageContainer.innerHTML = pageItems.map((book, idx) => {
      const globalIdx = startIdx + idx;
      const angle = angles[idx % angles.length];

      let moodBadgeClass = 'mood-badge-loved';
      let moodIcon = '❤️';
      if (book.moodTag === 'It was okay') { moodBadgeClass = 'mood-badge-okay'; moodIcon = '📖'; }
      if (book.moodTag === 'Not for me') { moodBadgeClass = 'mood-badge-notfor'; moodIcon = '💔'; }

      return `
        <div class="collage-stamp-card" style="transform: rotate(${angle}deg);" onclick="window.PageStamp.openStampDetail('${book.id}')">
          <div class="stamp-header-row">
            <span class="stamp-country-code">STAMP #${globalIdx + 1}</span>
            <span class="stamp-mood-badge ${moodBadgeClass}">${moodIcon} ${escapeHtml(book.moodTag || 'Finished')}</span>
          </div>

          <div class="stamp-body">
            <img src="${escapeHtml(book.coverUrl)}" alt="Cover" class="stamp-cover-thumb" onerror="this.onerror=null; this.src='https://via.placeholder.com/42x60/2b1a1d/d4af37?text=Book';">
            <div class="stamp-main-meta">
              <h4 class="stamp-book-title">${escapeHtml(book.title)}</h4>
              <p class="stamp-book-author">${escapeHtml(book.author)}</p>
              <p class="stamp-date-tag">VERIFIED: ${escapeHtml(book.dateFinished || '2026-07-24')}</p>
            </div>
          </div>

          <div class="ink-stamp-mark">
            PASSPORT<br>${escapeHtml(book.dateFinished || '2026-07-24')}
          </div>
        </div>
      `;
    }).join('');

    renderStampPageControls(totalPages);
  }

  function renderStampPageControls(totalPages) {
    // Update the footer page number so it reads "PAGE 02", "PAGE 03", etc.
    const pageNum = 1 + state.activeStampPage; // right page starts at "02"
    DOM.stampPageFooterNum.textContent = `PAGE ${String(pageNum).padStart(2, '0')}`;

    if (totalPages <= 1) {
      DOM.stampPageControls.classList.add('hidden');
      return;
    }

    DOM.stampPageControls.classList.remove('hidden');
    DOM.btnStampPagePrev.disabled = state.activeStampPage === 1;
    DOM.btnStampPageNext.disabled = state.activeStampPage === totalPages;

    let dotsHtml = '';
    for (let p = 1; p <= totalPages; p++) {
      dotsHtml += `<button type="button" class="page-dot ${p === state.activeStampPage ? 'active' : ''}" data-page="${p}" title="Page ${p + 1}" onclick="window.PageStamp.goToStampPage(${p})"></button>`;
    }
    DOM.stampPageDots.innerHTML = dotsHtml;
  }

  function goToStampPage(pageNum) {
    state.activeStampPage = pageNum;
    const finishedBooks = state.books.filter(b => b.status === 'finished');
    renderStampCollage(finishedBooks);
  }

  // ==========================================================================
  // OPEN LIBRARY API SEARCH CONTROLLER
  // ==========================================================================
  async function searchBooks(query) {
    if (!query || !query.trim()) return;

    DOM.searchStatus.classList.remove('hidden', 'error');
    DOM.searchStatus.classList.add('info');
    DOM.searchStatus.innerHTML = `<span class="spinner"></span> Checking the departures board for "${escapeHtml(query)}"...`;
    
    DOM.searchResultsGrid.innerHTML = '';
    DOM.btnSubmitSearch.disabled = true;

    try {
      const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=16`);
      if (!response.ok) throw new Error('API server returned error');
      
      const data = await response.json();
      
      DOM.btnSubmitSearch.disabled = false;
      DOM.searchStatus.classList.add('hidden');

      if (!data.docs || data.docs.length === 0) {
        DOM.searchResultsGrid.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-icon">🛬</div>
            <h3>No Flights Found for "${escapeHtml(query)}"</h3>
            <p>Try refining your search terms or search by a famous author.</p>
          </div>
        `;
        return;
      }

      renderSearchResults(data.docs);

    } catch (err) {
      console.error('Search error:', err);
      DOM.btnSubmitSearch.disabled = false;
      DOM.searchStatus.classList.remove('hidden', 'info');
      DOM.searchStatus.classList.add('error');
      DOM.searchStatus.textContent = 'Unable to reach the departures board. Please check your connection and try again.';
    }
  }

  // Deterministically derives a "flight code" and gate number from a book
  // title/author pair, purely cosmetic — just for the boarding-pass flavor.
  function deriveFlightDetails(title, author) {
    let hash = 0;
    const source = (title || '') + (author || '');
    for (let i = 0; i < source.length; i++) {
      hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    const initials = (title || 'PS').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'PS';
    const flightNum = 100 + (hash % 800);
    const gate = String.fromCharCode(65 + (hash % 6)) + (1 + (hash % 24));
    return { code: `${initials}-${flightNum}`, gate };
  }

  function renderSearchResults(docs) {
    DOM.searchResultsGrid.innerHTML = docs.map(doc => {
      const title = doc.title || 'Untitled Book';
      const author = doc.author_name ? doc.author_name[0] : (doc.authors ? doc.authors[0].name : 'Unknown Author');
      const coverId = doc.cover_i;
      const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
      const flight = deriveFlightDetails(title, author);

      const coverHTML = coverUrl 
        ? `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(title)}" class="book-cover-img" onerror="this.outerHTML='<div class=\\'placeholder-cover\\'><span class=\\'placeholder-icon\\'>📖</span><span class=\\'placeholder-title\\'>${escapeHtml(title)}</span></div>'">`
        : `<div class="placeholder-cover"><span class="placeholder-icon">📖</span><span class="placeholder-title">${escapeHtml(title)}</span></div>`;

      return `
        <div class="book-card boarding-pass-card">
          <div class="boarding-pass-strip">
            <span>FLIGHT ${flight.code}</span>
            <span>GATE ${flight.gate}</span>
          </div>
          <div class="book-cover-wrap">
            ${coverHTML}
          </div>
          <div class="book-info">
            <h4 class="book-title">${escapeHtml(title)}</h4>
            <p class="book-author">${escapeHtml(author)}</p>
            <div class="book-actions">
              <button class="btn btn-secondary btn-sm" onclick="window.PageStamp.addBook('${escapeHtml(title)}', '${escapeHtml(author)}', '${coverUrl || ''}', 'want-to-read')">
                🧳 Pack for Trip
              </button>
              <button class="btn btn-primary btn-sm" onclick="window.PageStamp.addBook('${escapeHtml(title)}', '${escapeHtml(author)}', '${coverUrl || ''}', 'currently-reading')">
                ✈️ Board Now
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ==========================================================================
  // BOOK COLLECTION STATE MUTATIONS
  // ==========================================================================
  function addBook(title, author, coverUrl, targetStatus) {
    const finalCoverUrl = coverUrl || `https://via.placeholder.com/150x220/2b1a1d/d4af37?text=${encodeURIComponent(title)}`;
    
    const existingIndex = state.books.findIndex(b => b.title.toLowerCase() === title.toLowerCase());
    
    if (existingIndex !== -1) {
      state.books[existingIndex].status = targetStatus;
      if (targetStatus === 'currently-reading' && state.books[existingIndex].progress === 100) {
        state.books[existingIndex].progress = 0;
      }
    } else {
      const newBook = {
        id: 'bk-' + Date.now() + '-' + Math.floor(Math.random()*1000),
        title: title,
        author: author,
        coverUrl: finalCoverUrl,
        status: targetStatus,
        progress: 0,
        dateFinished: null,
        moodTag: null,
        personalNote: ''
      };
      state.books.unshift(newBook);
    }

    saveState();

    if (targetStatus === 'currently-reading') {
      switchView('reading');
    } else {
      switchView('shelf');
    }
  }

  function updateBookProgress(bookId, newProgress) {
    const book = state.books.find(b => b.id === bookId);
    if (book) {
      book.progress = Math.min(100, Math.max(0, parseInt(newProgress, 10)));
      saveState();
    }
  }

  function deleteBook(bookId) {
    if (confirm('Are you sure you want to remove this book stamp from your passport?')) {
      state.books = state.books.filter(b => b.id !== bookId);
      saveState();
      closeModals();
      renderActiveView();
    }
  }

  // ==========================================================================
  // 3. WANT TO READ SHELF VIEW RENDERER
  // ==========================================================================
  function renderShelf() {
    const wantBooks = state.books.filter(b => b.status === 'want-to-read');

    if (wantBooks.length === 0) {
      DOM.shelfBooksGrid.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">🧳</div>
          <h3>Your Suitcase is Empty</h3>
          <p>Search for exciting titles and pack them in for an upcoming reading journey.</p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="window.PageStamp.navigateTo('search')">Search Books</button>
        </div>
      `;
      return;
    }

    DOM.shelfBooksGrid.innerHTML = wantBooks.map(book => `
      <div class="book-card" draggable="true" data-book-id="${book.id}">
        <div class="luggage-tag-flap">🏷️ DESTINATION</div>
        <div class="book-cover-wrap">
          <img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" class="book-cover-img" onerror="this.outerHTML='<div class=\\'placeholder-cover\\'><span class=\\'placeholder-icon\\'>📖</span><span class=\\'placeholder-title\\'>${escapeHtml(book.title)}</span></div>'">
        </div>
        <div class="book-info">
          <h4 class="book-title">${escapeHtml(book.title)}</h4>
          <p class="book-author">${escapeHtml(book.author)}</p>
          <div class="book-actions">
            <button class="btn btn-primary btn-sm btn-block" onclick="window.PageStamp.startReadingFromShelf('${book.id}')">
              ✈️ Board Flight
            </button>
            <button class="btn btn-outline-dark btn-sm btn-block" onclick="window.PageStamp.deleteBook('${book.id}')">
              Unpack
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  // ==========================================================================
  // 4. CURRENTLY READING VIEW RENDERER
  // ==========================================================================
  function renderCurrentlyReading() {
    const activeBook = state.books.find(b => b.status === 'currently-reading');

    if (!activeBook) {
      DOM.readingActiveContainer.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">🛫</div>
          <h3>No Flight Currently Boarded</h3>
          <p>You're grounded for now. Pick a destination from your suitcase or search for a new title to board.</p>
          <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1.25rem;">
            <button class="btn btn-secondary" onclick="window.PageStamp.navigateTo('shelf')">View Suitcase</button>
            <button class="btn btn-primary" onclick="window.PageStamp.navigateTo('search')">Search New Books</button>
          </div>
        </div>
      `;
      return;
    }

    DOM.readingActiveContainer.innerHTML = `
      <div class="reading-showcase-card" draggable="true" data-book-id="${activeBook.id}">
        <div class="bookmark-ribbon-accent"></div>
        <div class="showcase-cover-wrap">
          <img src="${escapeHtml(activeBook.coverUrl)}" alt="${escapeHtml(activeBook.title)}" class="showcase-cover-img" onerror="this.outerHTML='<div class=\\'placeholder-cover\\'><span class=\\'placeholder-icon\\'>📖</span><span class=\\'placeholder-title\\'>${escapeHtml(activeBook.title)}</span></div>'">
        </div>
        <div class="showcase-details">
          <h3 class="showcase-title">${escapeHtml(activeBook.title)}</h3>
          <p class="showcase-author">by ${escapeHtml(activeBook.author)}</p>

          <div class="progress-control-box">
            <div class="progress-header-row">
              <span class="progress-label">FLIGHT PROGRESS</span>
              <span class="percentage-badge" id="reading-percent-num">${activeBook.progress}%</span>
            </div>

            <div class="flight-path-track">
              <span class="flight-node flight-depart">🧳</span>
              <div class="flight-route-line">
                <div class="flight-route-fill" id="flight-route-fill" style="width:${activeBook.progress}%"></div>
                <span class="flight-plane-icon" id="flight-plane-icon" style="left:${activeBook.progress}%">✈️</span>
              </div>
              <span class="flight-node flight-arrive">🏁</span>
            </div>
            
            <div class="slider-container">
              <button class="btn-step" id="btn-step-minus" title="Decrease 5%">-</button>
              <input type="range" min="0" max="100" value="${activeBook.progress}" class="reading-slider" id="reading-slider-input">
              <button class="btn-step" id="btn-step-plus" title="Increase 5%">+</button>
            </div>
          </div>

          <div style="display: flex; gap: 1rem; align-items: center;">
            <button class="btn btn-stamp-gold btn-block" style="padding: 0.9rem;" onclick="window.PageStamp.openFinishModal('${activeBook.id}')">
              ✦ Land the Flight & Stamp Passport ✦
            </button>
          </div>

          <div class="stamp-pad-dropzone" id="stamp-pad-dropzone">
            <div class="stamp-pad-icon">🛃</div>
            <div class="stamp-pad-text">
              <strong>Passport Stamp Pad</strong>
              <span>Drag the book here to stamp it as finished</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const slider = document.getElementById('reading-slider-input');
    const percentNum = document.getElementById('reading-percent-num');
    const btnMinus = document.getElementById('btn-step-minus');
    const btnPlus = document.getElementById('btn-step-plus');
    const routeFill = document.getElementById('flight-route-fill');
    const planeIcon = document.getElementById('flight-plane-icon');

    function updateFlightPath(val, justLanded) {
      if (routeFill) routeFill.style.width = `${val}%`;
      if (planeIcon) {
        planeIcon.style.left = `${val}%`;
        if (justLanded) {
          planeIcon.classList.remove('landed');
          void planeIcon.offsetWidth;
          planeIcon.classList.add('landed');
        }
      }
    }

    if (slider && percentNum) {
      slider.addEventListener('input', (e) => {
        const val = e.target.value;
        percentNum.textContent = `${val}%`;
        updateFlightPath(val, parseInt(val, 10) === 100);
        updateBookProgress(activeBook.id, val);
      });

      function bumpBadge() {
        percentNum.classList.remove('bump');
        // Force reflow so the animation can restart on rapid clicks.
        void percentNum.offsetWidth;
        percentNum.classList.add('bump');
      }

      btnMinus.addEventListener('click', () => {
        let val = Math.max(0, parseInt(slider.value, 10) - 5);
        slider.value = val;
        percentNum.textContent = `${val}%`;
        bumpBadge();
        updateFlightPath(val, false);
        updateBookProgress(activeBook.id, val);
      });

      btnPlus.addEventListener('click', () => {
        let val = Math.min(100, parseInt(slider.value, 10) + 5);
        slider.value = val;
        percentNum.textContent = `${val}%`;
        bumpBadge();
        updateFlightPath(val, val === 100);
        updateBookProgress(activeBook.id, val);
        if (val === 100) {
          Officer.say('touchdown', { title: activeBook.title }, '🛬');
        }
      });
    }

    // Drag-and-drop: dragging the showcase card onto the stamp pad opens
    // the finish/stamp modal, mirroring the "drag completed books onto the
    // passport page to receive a stamp" interaction.
    const showcaseCard = document.querySelector('.reading-showcase-card[draggable="true"]');
    const stampPad = document.getElementById('stamp-pad-dropzone');

    if (showcaseCard) {
      showcaseCard.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', activeBook.id);
        e.dataTransfer.effectAllowed = 'move';
        showcaseCard.classList.add('dragging');
      });
      showcaseCard.addEventListener('dragend', () => {
        showcaseCard.classList.remove('dragging');
      });
    }

    if (stampPad) {
      stampPad.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        stampPad.classList.add('drag-over');
      });
      stampPad.addEventListener('dragleave', () => {
        stampPad.classList.remove('drag-over');
      });
      stampPad.addEventListener('drop', (e) => {
        e.preventDefault();
        stampPad.classList.remove('drag-over');
        const bookId = e.dataTransfer.getData('text/plain');
        if (bookId) {
          openFinishModal(bookId);
        }
      });
    }
  }

  // ==========================================================================
  // 5. STAMPING FINISH FLOW & ANIMATION MODAL
  // ==========================================================================
  function openFinishModal(bookId) {
    const book = state.books.find(b => b.id === bookId);
    if (!book) return;

    state.pendingFinishBookId = bookId;
    
    DOM.finishModalTitle.textContent = book.title;
    DOM.finishModalAuthor.textContent = `by ${book.author}`;
    DOM.finishModalCover.src = book.coverUrl;
    
    const today = new Date().toISOString().split('T')[0];
    DOM.finishModalDate.textContent = `Date: ${today}`;
    DOM.stampDateText.textContent = today;
    
    DOM.finishPersonalNote.value = '';
    DOM.animatedStampBadge.classList.add('hidden');
    DOM.animatedStampBadge.classList.remove('animate-stamp-down');

    DOM.modalFinish.classList.remove('hidden');

    // Playful touch: a faint ink trail follows the cursor while it's over the stamp paper,
    // as if dipped in the same ink as the stamp. Throttled so it stays subtle, not distracting.
    const paper = document.querySelector('.stamp-canvas-paper');
    if (paper && !paper.dataset.inkTrailBound) {
      paper.dataset.inkTrailBound = 'true';
      let lastTrail = 0;
      paper.addEventListener('mousemove', (ev) => {
        const now = Date.now();
        if (now - lastTrail < 70) return;
        lastTrail = now;
        Joy.inkTrailAt(ev.clientX, ev.clientY);
      });
    }
  }

  function handleFinishFormSubmit(e) {
    e.preventDefault();

    const book = state.books.find(b => b.id === state.pendingFinishBookId);
    if (!book) return;

    const moodRadio = document.querySelector('input[name="mood_tag"]:checked');
    const moodTag = moodRadio ? moodRadio.value : 'Loved it';
    const personalNote = DOM.finishPersonalNote.value.trim();
    const today = new Date().toISOString().split('T')[0];

    DOM.stampMoodText.textContent = moodTag.toUpperCase();
    DOM.animatedStampBadge.classList.remove('hidden');
    DOM.animatedStampBadge.classList.add('animate-stamp-down');

    // A quick scratch of the pen if a personal note was jotted down.
    if (personalNote) Sound.penScratch();

    // The paper shudders on impact, and ink bleeds outward from the stamp — timed to the
    // "thunk" moment in the stampDownKeyframe animation (around 38-50% through its 0.75s run).
    const paper = document.querySelector('.stamp-canvas-paper');
    if (paper) {
      setTimeout(() => {
        paper.classList.add('paper-shudder');
        Sound.stampThud();
        const ring = document.createElement('div');
        ring.className = 'ink-bleed-ring bleed-active';
        paper.appendChild(ring);
        setTimeout(() => ring.remove(), 950);
        setTimeout(() => paper.classList.remove('paper-shudder'), 420);
      }, 280);
    }

    setTimeout(() => {
      book.status = 'finished';
      book.progress = 100;
      book.dateFinished = today;
      book.moodTag = moodTag;
      book.personalNote = personalNote;

      saveState();

      DOM.modalFinish.classList.add('hidden');
      DOM.animatedStampBadge.classList.remove('animate-stamp-down');

      // Jump to whichever page the fresh stamp landed on, so the newest
      // stamp is visible right away instead of staying on an old page.
      state.activeStampFilter = 'all';
      DOM.stampFilterBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === 'all'));
      const finishedCount = state.books.filter(b => b.status === 'finished').length;
      state.activeStampPage = Math.max(1, Math.ceil(finishedCount / STAMPS_PER_PAGE));

      switchView('home');

      // Celebrate: a small gold-and-ink burst from where the finish button lives, plus a toast.
      const burstOrigin = document.querySelector('.passport-open-spread') || document.body;
      Joy.burst(burstOrigin, { count: 26, spread: 260 });
      Officer.say('stamped', { title: book.title }, '📖');

      // Check for any newly-earned souvenirs and reveal them once the
      // stamping celebration has had a moment to breathe.
      const earned = Souvenirs.evaluate(state, state.souvenirs, saveState);
      if (earned.length) {
        setTimeout(() => queueSouvenirReveals(earned), 1300);
      }
    }, 900);
  }

  function openStampDetail(bookId) {
    const book = state.books.find(b => b.id === bookId);
    if (!book) return;

    let moodIcon = '❤️';
    if (book.moodTag === 'It was okay') moodIcon = '📖';
    if (book.moodTag === 'Not for me') moodIcon = '💔';

    DOM.detailModalContent.innerHTML = `
      <div class="detail-modal-body">
        <div class="detail-header">
          <img src="${escapeHtml(book.coverUrl)}" alt="Cover" class="detail-cover" onerror="this.onerror=null; this.src='https://via.placeholder.com/100x150/2b1a1d/d4af37?text=Book';">
          <div>
            <h3 class="detail-title">${escapeHtml(book.title)}</h3>
            <p class="detail-author">by ${escapeHtml(book.author)}</p>

            <div class="detail-meta-pills">
              <span class="pill">🗓️ Stamp Date: ${escapeHtml(book.dateFinished || 'N/A')}</span>
              <span class="pill">${moodIcon} Mood: ${escapeHtml(book.moodTag || 'Finished')}</span>
            </div>
          </div>
        </div>

        ${book.personalNote ? `
          <div class="detail-memory-quote">
            "${escapeHtml(book.personalNote)}"
          </div>
        ` : '<p style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">No personal note recorded for this stamp.</p>'}

        <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem; gap: 0.75rem;">
          <button class="btn btn-outline-dark btn-sm" onclick="window.PageStamp.deleteBook('${book.id}')">Delete Stamp</button>
        </div>
      </div>
    `;

    DOM.modalDetail.classList.remove('hidden');
  }

  // ==========================================================================
  // 6. READING VISA PAGE (CHALLENGE) RENDERER
  // ==========================================================================
  function renderChallengeVisaPage() {
    const finishedBooks = state.books.filter(b => b.status === 'finished');
    const goal = Math.max(1, state.profile.yearlyGoal);
    
    DOM.yearlyGoalInput.value = goal;
    DOM.visaProgressText.textContent = `${finishedBooks.length} / ${goal} Books Stamp Verified`;

    const percent = (finishedBooks.length / goal) * 100;

    toggleMilestone(DOM.milestone25, percent >= 25);
    toggleMilestone(DOM.milestone50, percent >= 50);
    toggleMilestone(DOM.milestone75, percent >= 75);
    toggleMilestone(DOM.milestone100, percent >= 100);

    let slotsHTML = '';
    for (let i = 0; i < goal; i++) {
      const finishedBook = finishedBooks[i];

      if (finishedBook) {
        slotsHTML += `
          <div class="visa-slot filled">
            <div class="mini-visa-stamp">
              <span class="mini-visa-icon">🏵️</span>
              <span class="mini-visa-title">${escapeHtml(finishedBook.title)}</span>
              <span class="slot-number">${finishedBook.dateFinished || 'VERIFIED'}</span>
            </div>
          </div>
        `;
      } else {
        slotsHTML += `
          <div class="visa-slot">
            <span class="slot-number">SLOT #${i + 1}</span>
          </div>
        `;
      }
    }

    DOM.visaSlotsGrid.innerHTML = slotsHTML;

    // The yearly-goal-complete souvenir depends on the percent computed
    // here, so check for it whenever this page renders.
    const earned = Souvenirs.evaluate(state, state.souvenirs, saveState);
    if (earned.length) queueSouvenirReveals(earned);

    renderSouvenirGrid();
  }

  // ==========================================================================
  // SOUVENIR COLLECTION GRID & REVEAL MODAL
  // ==========================================================================
  let souvenirRevealQueue = [];

  function renderSouvenirGrid() {
    if (!DOM.souvenirGrid) return;
    const collected = state.souvenirs || [];

    if (DOM.souvenirCountText) {
      DOM.souvenirCountText.textContent = `${collected.length} / ${Souvenirs.CATALOG.length} Collected`;
    }

    DOM.souvenirGrid.innerHTML = Souvenirs.CATALOG.map(item => {
      const isCollected = collected.indexOf(item.id) !== -1;
      return `
        <div class="souvenir-card ${isCollected ? 'collected' : 'locked'}" title="${isCollected ? escapeHtml(item.blurb) : 'Keep reading to unlock this souvenir'}">
          <span class="souvenir-card-icon">${isCollected ? item.icon : '❔'}</span>
          <span class="souvenir-card-title">${isCollected ? escapeHtml(item.title) : '???'}</span>
        </div>
      `;
    }).join('');
  }

  function queueSouvenirReveals(items) {
    souvenirRevealQueue = souvenirRevealQueue.concat(items);
    if (!souvenirRevealQueue.length) return;
    showNextSouvenirReveal();
  }

  function showNextSouvenirReveal() {
    if (!DOM.modalSouvenir || !souvenirRevealQueue.length) return;
    const item = souvenirRevealQueue.shift();

    DOM.souvenirModalContent.innerHTML = `
      <div class="souvenir-reveal">
        <div class="officer-stamp-line">🛂 THE PASSPORT OFFICER SLIDES SOMETHING ACROSS THE DESK</div>
        <div class="postcard-reveal-card">
          <span class="postcard-icon">${item.icon}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.blurb)}</p>
        </div>
        <button type="button" class="btn btn-stamp-gold" id="btn-souvenir-continue">Add to Collection</button>
      </div>
    `;

    DOM.modalSouvenir.classList.remove('hidden');
    Sound.chime();
    renderSouvenirGrid();

    const continueBtn = document.getElementById('btn-souvenir-continue');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        DOM.modalSouvenir.classList.add('hidden');
        setTimeout(showNextSouvenirReveal, 400);
      });
    }
  }

  function toggleMilestone(element, isUnlocked) {
    const wasUnlocked = element.classList.contains('unlocked');

    if (isUnlocked) {
      element.classList.add('unlocked');
      element.querySelector('.badge-status').textContent = 'UNLOCKED! ✦';

      // Only celebrate the moment it flips from locked to unlocked, not on every render.
      if (!wasUnlocked) {
        element.classList.add('just-unlocked');
        setTimeout(() => element.classList.remove('just-unlocked'), 750);
        Joy.burst(element, { count: 18, spread: 140, duration: 0.9 });
        Sound.chime();
        const label = element.querySelector('.badge-title');
        Officer.say('milestone', { label: label ? label.textContent : 'Reading Visa' }, '🏵️');
      }
    } else {
      element.classList.remove('unlocked');
      element.querySelector('.badge-status').textContent = 'Locked';
    }
  }

  // ==========================================================================
  // 7. WORLD ATLAS — every finished book plants a pin on a literary map.
  // Countries are assigned by the AUTHOR'S nationality/origin — a curated
  // lookup table of well-known authors mapped to the country they're most
  // associated with. This is necessarily a curated list (Open Library's
  // public search API does not expose reliable author nationality data),
  // but it means the pins reflect real author origins rather than a random
  // hash. Authors not in the table are grouped into an "Unmapped" bucket
  // instead of being assigned a fake/incorrect country.
  // ==========================================================================
  const COUNTRY_ATLAS = [
    { code: 'us', name: 'United States', flag: '🇺🇸', x: 150, y: 95 },
    { code: 'ca', name: 'Canada', flag: '🇨🇦', x: 140, y: 55 },
    { code: 'mx', name: 'Mexico', flag: '🇲🇽', x: 128, y: 148 },
    { code: 'co', name: 'Colombia', flag: '🇨🇴', x: 168, y: 245 },
    { code: 'br', name: 'Brazil', flag: '🇧🇷', x: 195, y: 280 },
    { code: 'ar', name: 'Argentina', flag: '🇦🇷', x: 172, y: 355 },
    { code: 'cl', name: 'Chile', flag: '🇨🇱', x: 158, y: 340 },
    { code: 'is', name: 'Iceland', flag: '🇮🇸', x: 300, y: 28 },
    { code: 'ie', name: 'Ireland', flag: '🇮🇪', x: 330, y: 55 },
    { code: 'gb', name: 'United Kingdom', flag: '🇬🇧', x: 345, y: 58 },
    { code: 'fr', name: 'France', flag: '🇫🇷', x: 355, y: 82 },
    { code: 'de', name: 'Germany', flag: '🇩🇪', x: 372, y: 62 },
    { code: 'cz', name: 'Czech Republic', flag: '🇨🇿', x: 388, y: 68 },
    { code: 'es', name: 'Spain', flag: '🇪🇸', x: 333, y: 100 },
    { code: 'pt', name: 'Portugal', flag: '🇵🇹', x: 318, y: 102 },
    { code: 'it', name: 'Italy', flag: '🇮🇹', x: 378, y: 100 },
    { code: 'se', name: 'Sweden', flag: '🇸🇪', x: 390, y: 38 },
    { code: 'no', name: 'Norway', flag: '🇳🇴', x: 378, y: 30 },
    { code: 'dk', name: 'Denmark', flag: '🇩🇰', x: 375, y: 50 },
    { code: 'pl', name: 'Poland', flag: '🇵🇱', x: 400, y: 55 },
    { code: 'ru', name: 'Russia', flag: '🇷🇺', x: 560, y: 42 },
    { code: 'tr', name: 'Turkey', flag: '🇹🇷', x: 432, y: 105 },
    { code: 'eg', name: 'Egypt', flag: '🇪🇬', x: 402, y: 188 },
    { code: 'ng', name: 'Nigeria', flag: '🇳🇬', x: 353, y: 232 },
    { code: 'ke', name: 'Kenya', flag: '🇰🇪', x: 415, y: 252 },
    { code: 'za', name: 'South Africa', flag: '🇿🇦', x: 400, y: 352 },
    { code: 'in', name: 'India', flag: '🇮🇳', x: 545, y: 172 },
    { code: 'cn', name: 'China', flag: '🇨🇳', x: 610, y: 118 },
    { code: 'jp', name: 'Japan', flag: '🇯🇵', x: 692, y: 108 },
    { code: 'kr', name: 'South Korea', flag: '🇰🇷', x: 665, y: 115 },
    { code: 'th', name: 'Thailand', flag: '🇹🇭', x: 585, y: 190 },
    { code: 'au', name: 'Australia', flag: '🇦🇺', x: 682, y: 330 },
    { code: 'nz', name: 'New Zealand', flag: '🇳🇿', x: 758, y: 358 }
  ];

  // Authors not found in AUTHOR_COUNTRY_MAP are grouped into an "Unmapped
  // Authors" legend card (see renderWorldAtlas) rather than guessing a
  // country or plotting a fake pin on the map.

  // Curated author -> country-code lookup. Keys are lowercased, punctuation-
  // stripped author names. Extend this list as more authors show up.
  const AUTHOR_COUNTRY_MAP = {
    'frank herbert': 'us', 'f scott fitzgerald': 'us', 'ernest hemingway': 'us',
    'mark twain': 'us', 'harper lee': 'us', 'toni morrison': 'us', 'john steinbeck': 'us',
    'kurt vonnegut': 'us', 'stephen king': 'us', 'j d salinger': 'us', 'herman melville': 'us',
    'edgar allan poe': 'us', 'ray bradbury': 'us', 'isaac asimov': 'us', 'ursula k le guin': 'us',
    'andy weir': 'us', 'colson whitehead': 'us', 'louisa may alcott': 'us', 'jack kerouac': 'us',
    'walt whitman': 'us', 'philip k dick': 'us', 'suzanne collins': 'us', 'donna tartt': 'us',
    'cormac mccarthy': 'us', 'james baldwin': 'us', 'joseph heller': 'us', 'william faulkner': 'us',
    'margaret atwood': 'ca', 'alice munro': 'ca', 'yann martel': 'ca', 'lucy maud montgomery': 'ca',
    'george orwell': 'gb', 'j r r tolkien': 'gb', 'jane austen': 'gb', 'charles dickens': 'gb',
    'virginia woolf': 'gb', 'agatha christie': 'gb', 'j k rowling': 'gb', 'aldous huxley': 'gb',
    'william shakespeare': 'gb', 'the bronte sisters': 'gb', 'charlotte bronte': 'gb',
    'emily bronte': 'gb', 'mary shelley': 'gb', 'oscar wilde': 'gb', 'c s lewis': 'gb',
    'kazuo ishiguro': 'gb', 'ian mcewan': 'gb', 'neil gaiman': 'gb', 'terry pratchett': 'gb',
    'philip pullman': 'gb', 'douglas adams': 'gb', 'h g wells': 'gb', 'arthur conan doyle': 'gb',
    'daphne du maurier': 'gb', 'zadie smith': 'gb', 'kate morton': 'au', 'liane moriarty': 'au',
    'james joyce': 'ie', 'samuel beckett': 'ie', 'bram stoker': 'ie',
    'jonathan swift': 'ie', 'sally rooney': 'ie', 'cecelia ahern': 'ie',
    'victor hugo': 'fr', 'albert camus': 'fr', 'antoine de saint exupery': 'fr',
    'jules verne': 'fr', 'gustave flaubert': 'fr', 'marcel proust': 'fr', 'alexandre dumas': 'fr',
    'moliere': 'fr', 'voltaire': 'fr', 'simone de beauvoir': 'fr', 'jean paul sartre': 'fr',
    'johann wolfgang von goethe': 'de', 'franz kafka': 'cz', 'milan kundera': 'cz',
    'thomas mann': 'de', 'hermann hesse': 'de', 'gunter grass': 'de', 'erich maria remarque': 'de',
    'friedrich nietzsche': 'de', 'patrick suskind': 'de',
    'gabriel garcia marquez': 'co', 'isabel allende': 'cl', 'pablo neruda': 'cl',
    'jorge luis borges': 'ar', 'julio cortazar': 'ar', 'mario vargas llosa': 'ar',
    'paulo coelho': 'br', 'jorge amado': 'br', 'clarice lispector': 'br',
    'miguel de cervantes': 'es', 'carlos ruiz zafon': 'es', 'jose saramago': 'pt',
    'fernando pessoa': 'pt', 'italo calvino': 'it', 'umberto eco': 'it', 'elena ferrante': 'it',
    'dante alighieri': 'it', 'leo tolstoy': 'ru', 'fyodor dostoevsky': 'ru', 'anton chekhov': 'ru',
    'alexander pushkin': 'ru', 'nikolai gogol': 'ru', 'ivan turgenev': 'ru', 'boris pasternak': 'ru',
    'mikhail bulgakov': 'ru', 'vladimir nabokov': 'ru',
    'orhan pamuk': 'tr', 'elif shafak': 'tr', 'naguib mahfouz': 'eg', 'chinua achebe': 'ng',
    'chimamanda ngozi adichie': 'ng', 'wole soyinka': 'ng', 'ngugi wa thiongo': 'ke',
    'nadine gordimer': 'za', 'j m coetzee': 'za', 'trevor noah': 'za',
    'rabindranath tagore': 'in', 'arundhati roy': 'in', 'salman rushdie': 'in',
    'jhumpa lahiri': 'in', 'r k narayan': 'in', 'vikram seth': 'in', 'amish tripathi': 'in',
    'lu xun': 'cn', 'liu cixin': 'cn', 'amy tan': 'cn', 'mo yan': 'cn',
    'haruki murakami': 'jp', 'natsume soseki': 'jp', 'yukio mishima': 'jp', 'banana yoshimoto': 'jp',
    'han kang': 'kr', 'kyung sook shin': 'kr',
    'khaled hosseini': 'us',
    'astrid lindgren': 'se', 'stieg larsson': 'se', 'fredrik backman': 'se',
    'henrik ibsen': 'no', 'jo nesbo': 'no', 'karl ove knausgaard': 'no',
    'hans christian andersen': 'dk',
    'markus zusak': 'au', 'tim winton': 'au',
    'janet frame': 'nz', 'eleanor catton': 'nz'
  };

  // Deterministic string hash retained for cosmetic, non-geographic features
  // (like flight codes) that just need a stable pseudo-random value.
  function hashString(str) {
    let hash = 0;
    const source = str || '';
    for (let i = 0; i < source.length; i++) {
      hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  // Normalizes an author name for lookup: lowercase, turn periods/commas
  // into spaces (so "J.R.R. Tolkien" and "J. R. R. Tolkien" match the same
  // key), collapse whitespace. "F. Scott Fitzgerald" -> "f scott fitzgerald".
  function normalizeAuthorName(author) {
    return (author || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents: é -> e, etc.
      .toLowerCase()
      .replace(/[.,\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Looks up the real country tied to a book's author. Returns null if the
  // author isn't in the curated map — callers should treat that as
  // "unmapped" rather than guessing a country.
  function countryForBook(book) {
    const key = normalizeAuthorName(book.author);
    const code = AUTHOR_COUNTRY_MAP[key];
    if (!code) return null;
    return COUNTRY_ATLAS.find(c => c.code === code) || null;
  }

  function renderWorldAtlas() {
    const finishedBooks = state.books.filter(b => b.status === 'finished');

    // Group finished books by the real country their author is from.
    // Books whose author isn't in the curated map land in an "unmapped"
    // bucket instead of being assigned a fake/incorrect country.
    const byCountry = {};
    let unmappedBooks = [];
    finishedBooks.forEach(book => {
      const country = countryForBook(book);
      if (!country) {
        unmappedBooks.push(book);
        return;
      }
      if (!byCountry[country.code]) byCountry[country.code] = { country, books: [] };
      byCountry[country.code].books.push(book);
    });

    const unlockedCodes = Object.keys(byCountry);

    if (DOM.atlasCountriesTotal) DOM.atlasCountriesTotal.textContent = COUNTRY_ATLAS.length;
    Joy.countTo(DOM.atlasCountriesCount, unlockedCodes.length);

    const earnedSouvenirs = Souvenirs.evaluate(state, state.souvenirs, saveState);
    if (earnedSouvenirs.length) queueSouvenirReveals(earnedSouvenirs);

    // Render pins — every real country on the atlas gets a pin, dimmed if
    // locked. Unmapped books never get a map pin since we don't know where
    // to place them; they only show up in the legend below.
    if (DOM.atlasPinsLayer) {
      DOM.atlasPinsLayer.innerHTML = COUNTRY_ATLAS.map(country => {
        const isUnlocked = !!byCountry[country.code];
        const bookCount = isUnlocked ? byCountry[country.code].books.length : 0;
        const titleText = isUnlocked
          ? `${country.name} — ${byCountry[country.code].books.map(b => b.title).join(', ')}`
          : `${country.name} — not yet visited`;

        return `
          <g class="atlas-pin ${isUnlocked ? 'unlocked' : ''}" data-country="${country.code}" transform="translate(${country.x}, ${country.y})">
            <title>${escapeHtml(titleText)}</title>
            <g class="atlas-pin-hover-group">
              <path class="atlas-pin-drop" d="M0,-16 C7,-16 12,-11 12,-4 C12,4 0,16 0,16 C0,16 -12,4 -12,-4 C-12,-11 -7,-16 0,-16 Z"></path>
              <text class="atlas-pin-emoji" y="-2">${isUnlocked ? country.flag : '❔'}</text>
              ${isUnlocked && bookCount > 1 ? `<circle cx="9" cy="-14" r="7" fill="var(--gold-bright)"></circle><text x="9" y="-11" text-anchor="middle" font-size="8" font-weight="700" fill="#2b1a1d">${bookCount}</text>` : ''}
            </g>
          </g>
        `;
      }).join('');
    }

    // Render legend of discovered destinations below the map, plus a
    // separate "unmapped" card for authors we don't have origin data for.
    if (DOM.atlasLegend) {
      if (unlockedCodes.length === 0 && unmappedBooks.length === 0) {
        DOM.atlasLegend.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-icon">🗺️</div>
            <h3>Your Atlas is Still Blank</h3>
            <p>Finish your first book to plant your first pin on the map.</p>
          </div>
        `;
        return;
      }

      let legendHtml = unlockedCodes.map(code => {
        const entry = byCountry[code];
        const bookList = entry.books.map(b => escapeHtml(b.title)).join(' • ');
        return `
          <div class="atlas-legend-card" data-country="${code}">
            <span class="atlas-legend-flag">${entry.country.flag}</span>
            <div>
              <div class="atlas-legend-country">${escapeHtml(entry.country.name)}</div>
              <div class="atlas-legend-books">${bookList}</div>
            </div>
          </div>
        `;
      }).join('');

      if (unmappedBooks.length > 0) {
        const unmappedList = unmappedBooks.map(b => escapeHtml(b.title)).join(' • ');
        legendHtml += `
          <div class="atlas-legend-card atlas-legend-unmapped" data-country="unmapped" title="We don't have origin data for this author yet">
            <span class="atlas-legend-flag">❔</span>
            <div>
              <div class="atlas-legend-country">Unmapped Authors</div>
              <div class="atlas-legend-books">${unmappedList}</div>
            </div>
          </div>
        `;
      }

      DOM.atlasLegend.innerHTML = legendHtml;
    }
  }

  // ==========================================================================
  // MODAL CONTROLLERS & EVENT LISTENERS
  // ==========================================================================
  function closeModals() {
    DOM.modalFinish.classList.add('hidden');
    DOM.modalDetail.classList.add('hidden');
    DOM.modalProfile.classList.add('hidden');
    if (DOM.modalSouvenir) DOM.modalSouvenir.classList.add('hidden');
  }

  function initEventListeners() {
    initSidebarHover();

    if (DOM.btnReplayBoot) DOM.btnReplayBoot.addEventListener('click', playBootAnimation);
    if (DOM.btnReopenPassport) DOM.btnReopenPassport.addEventListener('click', playBootAnimation);

    DOM.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        switchView(view);
      });
    });

    DOM.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = DOM.searchInput.value.trim();
      searchBooks(q);
    });

    DOM.searchInput.addEventListener('input', (e) => {
      if (e.target.value.trim().length > 0) {
        DOM.searchClearBtn.classList.remove('hidden');
      } else {
        DOM.searchClearBtn.classList.add('hidden');
      }
    });

    DOM.searchClearBtn.addEventListener('click', () => {
      DOM.searchInput.value = '';
      DOM.searchClearBtn.classList.add('hidden');
      DOM.searchInput.focus();
    });

    DOM.genreChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const q = chip.getAttribute('data-query');
        DOM.searchInput.value = q;
        DOM.searchClearBtn.classList.remove('hidden');
        searchBooks(q);
      });
    });

    DOM.stampFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        DOM.stampFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeStampFilter = btn.getAttribute('data-filter');
        state.activeStampPage = 1; // reset to first page whenever the filter changes
        const finishedBooks = state.books.filter(b => b.status === 'finished');
        renderStampCollage(finishedBooks);
      });
    });

    DOM.btnStampPagePrev.addEventListener('click', () => {
      if (state.activeStampPage > 1) {
        goToStampPage(state.activeStampPage - 1);
      }
    });

    DOM.btnStampPageNext.addEventListener('click', () => {
      const finishedBooks = state.books.filter(b => b.status === 'finished');
      const filtered = state.activeStampFilter === 'all'
        ? finishedBooks
        : finishedBooks.filter(b => b.moodTag === state.activeStampFilter);
      const totalPages = Math.max(1, Math.ceil(filtered.length / STAMPS_PER_PAGE));
      if (state.activeStampPage < totalPages) {
        goToStampPage(state.activeStampPage + 1);
      }
    });

    DOM.finishBookForm.addEventListener('submit', handleFinishFormSubmit);
    DOM.btnCloseFinishModal.addEventListener('click', closeModals);
    DOM.btnCancelFinish.addEventListener('click', closeModals);
    
    DOM.btnCloseDetailModal.addEventListener('click', closeModals);

    DOM.btnSaveGoal.addEventListener('click', () => {
      const newGoal = parseInt(DOM.yearlyGoalInput.value, 10);
      if (newGoal && newGoal > 0) {
        state.profile.yearlyGoal = newGoal;
        saveState();
        renderChallengeVisaPage();
        renderPassportFirstPage();
      }
    });

    if (DOM.atlasPinsLayer) {
      DOM.atlasPinsLayer.addEventListener('click', (e) => {
        const pin = e.target.closest('.atlas-pin');
        if (!pin) return;
        const code = pin.getAttribute('data-country');
        const card = DOM.atlasLegend ? DOM.atlasLegend.querySelector(`.atlas-legend-card[data-country="${code}"]`) : null;
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('just-unlocked');
          setTimeout(() => card.classList.remove('just-unlocked'), 750);
        } else {
          Officer.say('atlasLocked', {}, '📍');
        }
      });
    }

    // Drag-and-drop: dragging a suitcase book onto the Boarding Gate starts
    // reading it, mirroring the "drag books from the suitcase into the
    // passport to begin reading" interaction. Cards are re-rendered on every
    // renderShelf() call, so listeners are attached via delegation on the
    // grid container rather than on individual cards.
    if (DOM.shelfBooksGrid) {
      DOM.shelfBooksGrid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.book-card[draggable="true"]');
        if (!card) return;
        e.dataTransfer.setData('text/plain', card.getAttribute('data-book-id'));
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      DOM.shelfBooksGrid.addEventListener('dragend', (e) => {
        const card = e.target.closest('.book-card[draggable="true"]');
        if (card) card.classList.remove('dragging');
      });
    }

    if (DOM.boardingGateDropzone) {
      DOM.boardingGateDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        DOM.boardingGateDropzone.classList.add('drag-over');
      });
      DOM.boardingGateDropzone.addEventListener('dragleave', () => {
        DOM.boardingGateDropzone.classList.remove('drag-over');
      });
      DOM.boardingGateDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.boardingGateDropzone.classList.remove('drag-over');
        const bookId = e.dataTransfer.getData('text/plain');
        if (bookId) {
          const book = state.books.find(b => b.id === bookId);
          window.PageStamp.startReadingFromShelf(bookId);
          Officer.say('boarding', { title: book ? book.title : 'your book' }, '🛂');
        }
      });
    }

    if (DOM.btnToggleSound) {
      updateSoundToggleUI();
      DOM.btnToggleSound.addEventListener('click', () => {
        Sound.toggleMuted();
        updateSoundToggleUI();
      });
    }

    if (DOM.btnCloseSouvenirModal) {
      DOM.btnCloseSouvenirModal.addEventListener('click', () => {
        souvenirRevealQueue = [];
        closeModals();
      });
    }

    DOM.btnEditName.addEventListener('click', openProfileModal);
    DOM.btnChangeAvatar.addEventListener('click', openProfileModal);
    DOM.btnCloseProfileModal.addEventListener('click', closeModals);

    DOM.emojiBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.getAttribute('data-emoji');
        state.profile.avatar = emoji;
        updateProfileUI();
      });
    });

    DOM.profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newName = DOM.inputProfileName.value.trim();
      if (newName) {
        state.profile.name = newName;
        saveState();
        updateProfileUI();
        closeModals();
      }
    });

    [DOM.modalFinish, DOM.modalDetail, DOM.modalProfile, DOM.modalSouvenir].forEach(modal => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          souvenirRevealQueue = [];
          closeModals();
        }
      });
    });
  }

  function updateSoundToggleUI() {
    if (!DOM.soundToggleIcon || !DOM.btnToggleSound) return;
    const muted = Sound.isMuted();
    DOM.soundToggleIcon.textContent = muted ? '🔇' : '🔊';
    DOM.btnToggleSound.classList.toggle('muted', muted);
  }

  function openProfileModal() {
    DOM.inputProfileName.value = state.profile.name;
    DOM.modalProfile.classList.remove('hidden');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.PageStamp = {
    navigateTo: (view) => switchView(view),
    addBook: (title, author, coverUrl, targetStatus) => addBook(title, author, coverUrl, targetStatus),
    startReadingFromShelf: (bookId) => {
      const book = state.books.find(b => b.id === bookId);
      if (book) {
        book.status = 'currently-reading';
        saveState();
        switchView('reading');
      }
    },
    deleteBook: (bookId) => deleteBook(bookId),
    openFinishModal: (bookId) => openFinishModal(bookId),
    openStampDetail: (bookId) => openStampDetail(bookId),
    goToStampPage: (pageNum) => goToStampPage(pageNum)
  };

  document.addEventListener('DOMContentLoaded', () => {
    // First-ever load: silently credit any souvenirs the demo data already
    // qualifies for, so unlocking one doesn't feel like a random surprise
    // the very first time the app opens.
    if (state.souvenirs === null) {
      state.souvenirs = Souvenirs.computeBaseline(state);
      saveState();
    }

    initEventListeners();
    playBootAnimation();
    switchView('home', { silent: true });
  });

})();
