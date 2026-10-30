// Persistence. Each dialect's progress lives under its own key, so studying
// one dialect never touches another's record.
PT.store = (() => {
  const PREFIX = 'paisatenso:v1:';
  const SETTINGS_KEY = PREFIX + 'settings';

  const defaultSettings = () => ({
    dialect: 'paisa',
    rate: 0.9,
    newPerDay: 10,
    direction: 'mixed', // 'production' | 'recognition' | 'mixed'
  });

  const emptyProgress = () => ({
    cards: {},       // cardId -> SRS state
    newLog: {},      // date -> count of new cards introduced
    activity: {},    // date -> count of completed items
    readings: {},    // readingId -> best score 0..1
    dialogues: {},   // dialogueId -> best score 0..1
    tasks: {},       // taskId -> best score 0..1
    dictation: [],   // recent dictation scores
    tests: [],       // { date, production, reception, items }
  });

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Could not save progress', e);
    }
  }

  const cache = {};

  return {
    settings() {
      if (!cache.settings) cache.settings = read(SETTINGS_KEY, defaultSettings());
      return cache.settings;
    },
    saveSettings(patch) {
      cache.settings = { ...this.settings(), ...patch };
      write(SETTINGS_KEY, cache.settings);
    },
    progress(dialectId) {
      if (!cache[dialectId]) cache[dialectId] = read(PREFIX + 'progress:' + dialectId, emptyProgress());
      return cache[dialectId];
    },
    save(dialectId) {
      write(PREFIX + 'progress:' + dialectId, this.progress(dialectId));
    },
    logActivity(dialectId, n = 1) {
      const p = this.progress(dialectId);
      const d = PT.util.today();
      p.activity[d] = (p.activity[d] || 0) + n;
      this.save(dialectId);
    },
    streak(dialectId) {
      const act = this.progress(dialectId).activity;
      let n = 0;
      const d = new Date();
      // Today not done yet doesn't break the streak.
      const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      if (!act[key(d)]) d.setDate(d.getDate() - 1);
      while (act[key(d)]) {
        n++;
        d.setDate(d.getDate() - 1);
      }
      return n;
    },
    reset(dialectId) {
      cache[dialectId] = emptyProgress();
      this.save(dialectId);
    },
    exportAll() {
      const out = { version: 1, exported: new Date().toISOString(), settings: this.settings(), progress: {} };
      for (const id of PT.dialectOrder) out.progress[id] = this.progress(id);
      return out;
    },
    importAll(data) {
      if (!data || data.version !== 1 || !data.progress) throw new Error('Not a Paisatenso backup file.');
      for (const id of PT.dialectOrder) {
        if (data.progress[id]) {
          cache[id] = { ...emptyProgress(), ...data.progress[id] };
          this.save(id);
        }
      }
    },
  };
})();
