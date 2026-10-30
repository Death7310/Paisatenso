// Spaced retrieval scheduler — an SM-2 variant with four grades.
// Intervals expand after each successful recall; a failed recall resets the
// card into a short relearning step so it is retrieved again the same session.
PT.srs = (() => {
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const GRADES = ['again', 'hard', 'good', 'easy'];

  const fresh = () => ({ reps: 0, interval: 0, ease: 2.5, due: 0, lapses: 0, seen: 0 });

  // Returns the next state without mutating the input.
  function schedule(state, grade, now = Date.now()) {
    const s = { ...fresh(), ...state };
    s.seen += 1;
    if (grade === 'again') {
      s.lapses += s.reps > 0 ? 1 : 0;
      s.reps = 0;
      s.interval = 0;
      s.ease = Math.max(1.3, s.ease - 0.2);
      s.due = now + 10 * MIN;
      return s;
    }
    if (grade === 'hard') {
      s.interval = s.reps === 0 ? 1 : Math.max(1, Math.round(s.interval * 1.2));
      s.ease = Math.max(1.3, s.ease - 0.15);
    } else if (grade === 'good') {
      s.interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.interval * s.ease);
    } else {
      s.interval = s.reps === 0 ? 4 : Math.round(Math.max(s.interval, 1) * s.ease * 1.3);
      s.ease += 0.15;
    }
    s.reps += 1;
    s.due = now + s.interval * DAY;
    return s;
  }

  function label(state, grade) {
    const next = schedule(state, grade);
    if (grade === 'again') return '10 min';
    return next.interval === 1 ? '1 day' : `${next.interval} days`;
  }

  // Due reviews first (most overdue first), then up to `newLimit` unseen cards
  // in curriculum order.
  function buildQueue(dialect, progress, { newLimit, theme } = {}) {
    const now = Date.now();
    const pool = dialect.cards.filter((c) => !theme || c.t === theme);
    const due = pool
      .filter((c) => progress.cards[c.id] && progress.cards[c.id].due <= now)
      .sort((a, b) => progress.cards[a.id].due - progress.cards[b.id].due);
    const themeRank = Object.fromEntries(PT.themes.map((t, i) => [t.id, i]));
    const unseen = pool
      .filter((c) => !progress.cards[c.id])
      .sort((a, b) => themeRank[a.t] - themeRank[b.t])
      .slice(0, Math.max(0, newLimit ?? 10));
    return { due, unseen };
  }

  function stats(dialect, progress) {
    const now = Date.now();
    let seen = 0, due = 0, mature = 0;
    for (const c of dialect.cards) {
      const s = progress.cards[c.id];
      if (!s) continue;
      seen++;
      if (s.due <= now) due++;
      if (s.interval >= 21) mature++;
    }
    return { total: dialect.cards.length, seen, due, mature };
  }

  return { GRADES, fresh, schedule, label, buildQueue, stats };
})();
