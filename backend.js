
(function () {
  'use strict';

  const SUPABASE_URL = 'https://vqnfuvtvuttrghdodlgo.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_WPIIGbNduk1leQGXeG_1bw_l6oDVsS7';

  const STORAGE_KEY_PROFILE = 'pagestamp_user_profile_v1';
  const STORAGE_KEY_BOOKS = 'pagestamp_user_books_v1';
  const STORAGE_KEY_SOUVENIRS = 'pagestamp_souvenirs_v1';
  const SYNCED_KEYS = [STORAGE_KEY_PROFILE, STORAGE_KEY_BOOKS, STORAGE_KEY_SOUVENIRS];

  const TABLE_NAME = 'passports';
  const COMMUNITY_RPC = 'get_community_reviews';

  if (!window.supabase) {
    console.error('Supabase library did not load. Check your internet connection / the <script> tag in index.html.');
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let els = {};
  let appStarted = false;
  let syncTimer = null;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  const MOOD_ICON = { 'Loved it': '❤️', 'It was okay': '📖', 'Not for me': '💔' };

  function cacheEls() {
    els = {
      gate: document.getElementById('auth-gate'),
      error: document.getElementById('auth-error'),
      info: document.getElementById('auth-info'),
      nameForm: document.getElementById('auth-name-form'),
      nameInput: document.getElementById('auth-name-input'),
      nameError: document.getElementById('auth-name-error'),
      enterBtn: document.getElementById('auth-enter-btn'),
      logoutBtn: document.getElementById('btn-logout'),
      navCommunity: document.getElementById('nav-community'),
      communityFeed: document.getElementById('community-feed'),
      communityStatus: document.getElementById('community-feed-status')
    };
  }

  function scheduleCloudSync(userId) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushToCloud(userId), 800);
  }
  function showError(msg) {
    els.info.classList.add('hidden');
    els.error.textContent = msg;
    els.error.classList.remove('hidden');
  }
  function showInfo(msg) {
    els.error.classList.add('hidden');
    els.info.textContent = msg;
    els.info.classList.remove('hidden');
  }
  function clearMessages() {
    els.error.classList.add('hidden');
    els.info.classList.add('hidden');
  }

  function validateNameInput() {
    const name = els.nameInput.value.trim();
    els.enterBtn.disabled = name.length === 0;
    return name;
  }

  function rejectEmptyName() {
    els.nameError.classList.remove('hidden');
    els.nameInput.classList.add('shake');
    els.nameInput.focus();
    setTimeout(() => els.nameInput.classList.remove('shake'), 400);
  }

  function loadScript(src) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
    };
    s.onerror = () => {
      showError('Could not load the app (script.js). Check your file paths.');
    };
    document.body.appendChild(s);
  }
  function initGateUI() {
    validateNameInput();

    els.nameInput.addEventListener('input', () => {
      els.nameError.classList.add('hidden');
      validateNameInput();
    });

    els.nameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearMessages();
      const name = els.nameInput.value.trim();
      if (!name) {
        rejectEmptyName();
        return;
      }

      els.enterBtn.disabled = true;
      els.enterBtn.textContent = 'Opening…';
      try {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        await enterApp(data.session, name);
      } catch (err) {
        showError(err.message || 'Could not open a passport right now. Please try again.');
        els.enterBtn.disabled = false;
        els.enterBtn.textContent = 'Open Your Passport';
      }
    });

    if (els.logoutBtn) {
      els.logoutBtn.textContent = '';
      els.logoutBtn.innerHTML = '<span>🗑️</span><span class="soundLabel">Start New Passport</span>';
      els.logoutBtn.addEventListener('click', async () => {
        const sure = window.confirm(
          'This resets everything and starts a brand new empty passport on this device. ' +
          'Your current passport stays saved in the cloud but you will not see it again ' +
          'unless you have another way to sign back into it. Continue?'
        );
        if (!sure) return;
        await sb.auth.signOut();
        window.location.reload();
      });
    }
  }

  async function enterApp(session, displayName) {
    if (!session || appStarted) return;
    appStarted = true;

    const userId = session.user.id;

    let cloudRow = null;
    try {
      const { data, error } = await sb
        .from(TABLE_NAME)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      cloudRow = data;
    } catch (err) {
      console.warn('Could not reach cloud database, starting with local data:', err.message);
    }

    if (cloudRow) {
      if (cloudRow.profile) localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(cloudRow.profile));
      if (cloudRow.books) localStorage.setItem(STORAGE_KEY_BOOKS, JSON.stringify(cloudRow.books));
      localStorage.setItem(STORAGE_KEY_SOUVENIRS, JSON.stringify(cloudRow.souvenirs || []));
    } else {
      SYNCED_KEYS.forEach((k) => localStorage.removeItem(k));
      const freshProfile = {
        name: displayName || 'A Fellow Reader',
        yearlyGoal: 12,
        avatar: '📖',
        passportNo: 'BK-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
        issueDate: new Date().toISOString().split('T')[0]
      };
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(freshProfile));
    }

    patchLocalStorageForSync(userId);

    els.gate.classList.add('hidden');
    initCommunityTab();
    loadScript('script.js');
  }

  function initCommunityTab() {
    if (!els.navCommunity) return;
    els.navCommunity.addEventListener('click', renderCommunityFeed);
  }

  async function renderCommunityFeed() {
    if (!els.communityFeed) return;
    els.communityStatus.textContent = 'Loading everyone\'s reviews…';
    els.communityFeed.innerHTML = '';

    try {
      const { data, error } = await sb.rpc(COMMUNITY_RPC);
      if (error) throw error;

      if (!data || data.length === 0) {
        els.communityStatus.textContent = 'No finished books yet — be the first to stamp one!';
        return;
      }

      data.sort((a, b) => (b.date_finished || '').localeCompare(a.date_finished || ''));

      els.communityStatus.textContent = `${data.length} review${data.length === 1 ? '' : 's'} from the community`;

      els.communityFeed.innerHTML = data.map((r) => `
        <div class="feedCard">
          <img src="${escapeHtml(r.cover_url) || 'https://via.placeholder.com/60x88/2b1a1d/d4af37?text=Book'}"
               alt="Cover" class="feedCover"
               onerror="this.onerror=null; this.src='https://via.placeholder.com/60x88/2b1a1d/d4af37?text=Book';">
          <div class="feedBody">
            <div class="feedTop">
              <h4>${escapeHtml(r.title)}</h4>
              <span class="feedMood">${MOOD_ICON[r.mood_tag] || '📖'} ${escapeHtml(r.mood_tag || '')}</span>
            </div>
            <p class="feedAuthor">by ${escapeHtml(r.author)}</p>
            ${r.personal_note ? `<p class="feedNote">"${escapeHtml(r.personal_note)}"</p>` : ''}
            <p class="feedBy">${escapeHtml(r.reviewer_avatar) || '📖'} ${escapeHtml(r.reviewer_name) || 'A fellow reader'} · ${escapeHtml(r.date_finished) || ''}</p>
          </div>
        </div>
      `).join('');
    } catch (err) {
      els.communityStatus.textContent = 'Could not load community reviews right now.';
      console.warn('Community feed error:', err.message);
    }
  }

  function patchLocalStorageForSync(userId) {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);
      if (SYNCED_KEYS.indexOf(key) !== -1) {
        scheduleCloudSync(userId);
      }
    };
  }

  async function pushToCloud(userId) {
    let profile = null, books = null, souvenirs = null;
    try { profile = JSON.parse(localStorage.getItem(STORAGE_KEY_PROFILE) || 'null'); } catch (e) { }
    try { books = JSON.parse(localStorage.getItem(STORAGE_KEY_BOOKS) || 'null'); } catch (e) { }
    try { souvenirs = JSON.parse(localStorage.getItem(STORAGE_KEY_SOUVENIRS) || 'null'); } catch (e) { }

    try {
      const { error } = await sb.from(TABLE_NAME).upsert({
        user_id: userId,
        profile,
        books,
        souvenirs,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
    } catch (err) {
      console.warn('Cloud sync failed (changes are still saved locally):', err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    cacheEls();
    initGateUI();

    const { data } = await sb.auth.getSession();
    if (data.session) {
      await enterApp(data.session);
    }
  });
})();