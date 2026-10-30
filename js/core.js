// Shared namespace, themes and text utilities.
window.PT = window.PT || {};
PT.dialects = PT.dialects || {};

// Order matters: new cards are introduced theme by theme, starting with the
// highest-utility social language (greetings, people) before the wider world.
PT.themes = [
  { id: 'saludos', label: 'Greetings & small talk' },
  { id: 'gente', label: 'People & relationships' },
  { id: 'muletillas', label: 'Fillers & reactions' },
  { id: 'planes', label: 'Plans & hanging out' },
  { id: 'escuela', label: 'School & studies' },
  { id: 'militar', label: 'Military & service' },
  { id: 'calle', label: 'Getting around' },
  { id: 'comida', label: 'Food & drink' },
  { id: 'trabajo', label: 'Work & money' },
  { id: 'sentimientos', label: 'Feelings & opinions' },
];

PT.dialectOrder = ['paisa', 'rioplatense', 'catracho', 'boricua'];

PT.util = {
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  },

  // Lowercase, strip accents and punctuation, unify common spoken reductions.
  normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[¿?¡!.,;:"“”()…\-–—]/g, ' ')
      .replace(/['’]/g, '')
      .split(/\s+/).filter(Boolean)
      .map((w) => (w === 'para' ? 'pa' : w))
      .join(' ');
  },

  levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
      prev = cur;
    }
    return prev[b.length];
  },

  // 0..1 similarity between an attempt and one target string.
  similarity(attempt, target) {
    const a = PT.util.normalize(attempt);
    const b = PT.util.normalize(target);
    if (!a || !b) return 0;
    const max = Math.max(a.length, b.length);
    return 1 - PT.util.levenshtein(a, b) / max;
  },

  // Best similarity against a list of acceptable answers.
  bestMatch(attempt, targets) {
    let best = { score: 0, target: targets[0] };
    for (const t of targets) {
      const score = PT.util.similarity(attempt, t);
      if (score > best.score) best = { score, target: t };
    }
    return best;
  },

  // Word-level feedback: which target words appear in the attempt.
  wordDiff(attempt, target) {
    const have = new Set(PT.util.normalize(attempt).split(' '));
    return target.split(/\s+/).map((w) => {
      const n = PT.util.normalize(w);
      const ok = !n || have.has(n);
      return `<span class="${ok ? 'w-ok' : 'w-miss'}">${PT.util.esc(w)}</span>`;
    }).join(' ');
  },

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  sample(arr, n) {
    return PT.util.shuffle(arr).slice(0, n);
  },

  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  answersFor(card) {
    return [card.es, ...(card.alt || [])];
  },
};
