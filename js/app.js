// Views and routing.
(() => {
  const { esc, bestMatch, wordDiff, shuffle, sample, today, answersFor } = PT.util;
  const S = PT.store;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const main = $('#main');

  const D = () => PT.dialects[S.settings().dialect] || PT.dialects.paisa;
  const P = () => S.progress(D().id);
  const save = () => S.save(D().id);

  // Thresholds for typed/spoken production. Spelling slips and missing
  // accents still count; a different phrase does not.
  const CORRECT = 0.85;
  const CLOSE = 0.6;

  let playToken = 0; // cancels sequential dialogue playback on navigation

  // ---------- shared bits ----------

  const sayBtn = (text, label = '▶', extra = '') =>
    `<button class="btn icon say" data-say="${esc(text)}" ${extra} title="Listen">${label}</button>`;

  const produceBox = (id, placeholder = 'Type or speak your answer…') => `
    <div class="produce">
      <input id="${id}" class="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${placeholder}">
      ${PT.speech.canRecognize ? `<button class="btn icon mic" data-mic="${id}" title="Speak">🎤</button>` : ''}
    </div>`;

  function attemptsOf(input) {
    return [input.value, ...(input._alts || [])].filter((x) => x && x.trim());
  }

  function scoreAttempt(input, targets) {
    let best = { score: 0, target: targets[0], attempt: '' };
    for (const a of attemptsOf(input)) {
      const m = bestMatch(a, targets);
      if (m.score > best.score) best = { ...m, attempt: a };
    }
    return best;
  }

  function verdict(score) {
    if (score >= CORRECT) return { cls: 'good', text: 'Correct' };
    if (score >= CLOSE) return { cls: 'close', text: 'Close' };
    return { cls: 'bad', text: 'Not yet' };
  }

  function pct(x) {
    return `${Math.round(x * 100)}%`;
  }

  function optionsList(name, options) {
    return options.map((o, i) => `
      <label class="opt"><input type="radio" name="${name}" value="${i}"> <span>${esc(o)}</span></label>`).join('');
  }

  // Global click handling for audio and microphones.
  document.addEventListener('click', async (e) => {
    const say = e.target.closest('[data-say]');
    if (say) {
      e.preventDefault();
      const rate = say.dataset.rate ? Number(say.dataset.rate) : undefined;
      PT.speech.speak(say.dataset.say, D(), { rate });
      return;
    }
    const mic = e.target.closest('[data-mic]');
    if (mic) {
      e.preventDefault();
      const input = document.getElementById(mic.dataset.mic);
      mic.classList.add('listening');
      mic.disabled = true;
      try {
        const alts = await PT.speech.listen(D());
        if (alts.length) {
          input.value = alts[0];
          input._alts = alts.slice(1);
        } else {
          toast('Didn\'t catch that — try again.');
        }
      } catch (err) {
        toast(err.message);
      } finally {
        mic.classList.remove('listening');
        mic.disabled = false;
      }
    }
  });

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ---------- chrome ----------

  function renderChrome(view) {
    const d = D();
    document.documentElement.style.setProperty('--accent', d.color);
    $('#dialects').innerHTML = PT.dialectOrder.map((id) => {
      const x = PT.dialects[id];
      return `<button class="dialect ${id === d.id ? 'active' : ''}" data-dialect="${id}" style="--c:${x.color}">
        <span class="flag">${x.flag}</span><span class="dname">${esc(x.name)}</span></button>`;
    }).join('');
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  }

  $('#dialects').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dialect]');
    if (!b) return;
    S.saveSettings({ dialect: b.dataset.dialect });
    PT.speech.stop();
    route();
  });

  // ---------- home ----------

  function viewHome() {
    const d = D();
    const p = P();
    const st = PT.srs.stats(d, p);
    const streak = S.streak(d.id);
    const lastTest = p.tests[p.tests.length - 1];
    const set = S.settings();
    const newToday = p.newLog[today()] || 0;
    const newLeft = Math.max(0, set.newPerDay - newToday);
    const nextReading = d.readings.find((r) => !(r.id in p.readings));
    const nextDialogue = d.dialogues.find((x) => !(x.id in p.dialogues));
    const tasksDone = Object.keys(p.tasks).length;
    const voice = PT.speech.voiceInfo(d);
    const unseen = st.total - st.seen;

    main.innerHTML = `
      <section class="hero card">
        <div class="hero-flag">${d.flag}</div>
        <div>
          <h1>${esc(d.name)} <small>${esc(d.place)}</small></h1>
          <p>${esc(d.intro)}</p>
          <p class="muted"><b>Pronouns:</b> ${esc(d.pronouns)}</p>
        </div>
      </section>

      <section class="tiles">
        <div class="tile"><b>${st.seen}<small>/${st.total}</small></b><span>phrases started</span></div>
        <div class="tile"><b>${st.due}</b><span>due for review</span></div>
        <div class="tile"><b>${st.mature}</b><span>long-term (21+ days)</span></div>
        <div class="tile"><b>${streak}</b><span>day streak</span></div>
        <div class="tile"><b>${lastTest ? pct((lastTest.production + lastTest.reception) / 2) : '—'}</b><span>last test</span></div>
      </section>

      <section class="card">
        <h2>Today's session</h2>
        <ol class="plan">
          <li><a href="#/learn">Review ${st.due} due ${st.due === 1 ? 'phrase' : 'phrases'}${unseen ? ` + up to ${Math.min(newLeft, unseen)} new` : ''}</a>
            <span class="muted">— spaced retrieval, ~10 min</span></li>
          <li><a href="#/speak">Role-play ${Math.min(3, d.tasks.length)} speaking tasks</a>
            <span class="muted">— ${tasksDone}/${d.tasks.length} attempted</span></li>
          <li>${nextDialogue
            ? `<a href="#/listen/${nextDialogue.id}">Listen: ${esc(nextDialogue.title)}</a>`
            : '<a href="#/listen">Listen: replay a dialogue or do dictation</a>'}
            <span class="muted">— audio first, transcript after</span></li>
          <li>${nextReading
            ? `<a href="#/read/${nextReading.id}">Read: ${esc(nextReading.title)}</a>`
            : '<a href="#/read">Read: re-read a text aloud</a>'}</li>
          <li><a href="#/test">Weekly: take a mixed test</a> <span class="muted">— measures production and reception separately</span></li>
        </ol>
        <p class="muted small">Above all: use what you learn with a real ${esc(d.name)} speaker this week. The app can't replace live interaction — see <a href="#/method">Method</a>.</p>
      </section>

      <section class="card">
        <h2>Settings</h2>
        <div class="grid2">
          <label>Speech speed
            <select id="set-rate">
              ${[0.6, 0.75, 0.9, 1].map((r) => `<option value="${r}" ${set.rate === r ? 'selected' : ''}>${r === 1 ? 'Natural' : r === 0.9 ? 'Slightly slow' : r === 0.75 ? 'Slow' : 'Very slow'}</option>`).join('')}
            </select></label>
          <label>New phrases per day
            <select id="set-new">
              ${[5, 10, 15, 20].map((n) => `<option ${set.newPerDay === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select></label>
          <label>Review direction
            <select id="set-dir">
              <option value="mixed" ${set.direction === 'mixed' ? 'selected' : ''}>Mixed (mostly English → Spanish)</option>
              <option value="production" ${set.direction === 'production' ? 'selected' : ''}>English → Spanish (produce)</option>
              <option value="recognition" ${set.direction === 'recognition' ? 'selected' : ''}>Spanish → English (recognize)</option>
            </select></label>
        </div>
        <p class="small ${voice.ok && voice.native ? '' : 'warn'}"><b>Voice:</b> ${esc(voice.text)} ${sayBtn(d.cards[0].es, '▶ test')}</p>
        <p class="small muted">Speech recognition: ${PT.speech.canRecognize ? 'available' : 'not available in this browser — you can still type answers'}.</p>
        <div class="row">
          <button class="btn" id="export">Export backup</button>
          <label class="btn">Import backup<input type="file" id="import" accept="application/json" hidden></label>
          <button class="btn danger" id="reset">Reset ${esc(d.name)} progress</button>
        </div>
        <p class="small muted">Progress is stored in this browser, separately for each dialect. Export a backup before clearing browser data or switching devices.</p>
      </section>`;

    $('#set-rate').onchange = (e) => S.saveSettings({ rate: Number(e.target.value) });
    $('#set-new').onchange = (e) => { S.saveSettings({ newPerDay: Number(e.target.value) }); viewHome(); };
    $('#set-dir').onchange = (e) => S.saveSettings({ direction: e.target.value });
    $('#export').onclick = async () => {
      const json = JSON.stringify(S.exportAll(), null, 2);
      const name = `paisatenso-backup-${today()}.json`;
      if (PT.speech.native) {
        // WebView can't download blobs: write a file and open the share sheet.
        try {
          const { Filesystem, Share } = window.Capacitor.Plugins;
          const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
          await Share.share({ title: 'Paisatenso backup', files: [uri] });
        } catch (err) {
          toast('Export failed: ' + err.message);
        }
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    $('#import').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        S.importAll(JSON.parse(await f.text()));
        toast('Backup imported.');
        viewHome();
      } catch (err) {
        toast(err.message);
      }
    };
    $('#reset').onclick = () => {
      if (confirm(`Erase all ${d.name} progress? Other dialects are not affected.`)) {
        S.reset(d.id);
        viewHome();
      }
    };
  }

  // ---------- learn (spaced retrieval) ----------

  function viewLearn() {
    const d = D();
    const p = P();
    const set = S.settings();
    const newLeft = Math.max(0, set.newPerDay - (p.newLog[today()] || 0));
    const st = PT.srs.stats(d, p);

    const themeRows = PT.themes.map((t) => {
      const cards = d.cards.filter((c) => c.t === t.id);
      if (!cards.length) return '';
      const seen = cards.filter((c) => p.cards[c.id]).length;
      return `<button class="theme-row" data-theme="${t.id}">
        <span>${esc(t.label)}</span>
        <span class="bar"><i style="width:${(seen / cards.length) * 100}%"></i></span>
        <span class="muted small">${seen}/${cards.length}</span></button>`;
    }).join('');

    main.innerHTML = `
      <section class="card">
        <h2>Learn phrases</h2>
        <p>${st.due} due · ${newLeft} new allowed today · ${st.seen}/${st.total} started</p>
        <button class="btn primary big" id="start-all">Start session</button>
        <p class="muted small">You'll see each new phrase with audio, say it aloud, then be asked to recall it from memory — first within this session, then at expanding intervals.</p>
      </section>
      <section class="card">
        <h3>Or focus on a theme</h3>
        <div class="themes">${themeRows}</div>
      </section>`;

    $('#start-all').onclick = () => startLearn();
    $$('[data-theme]').forEach((b) => (b.onclick = () => startLearn(b.dataset.theme)));
  }

  function startLearn(theme) {
    const d = D();
    const p = P();
    const set = S.settings();
    const newLeft = Math.max(0, set.newPerDay - (p.newLog[today()] || 0));
    const { due, unseen } = PT.srs.buildQueue(d, p, { newLimit: newLeft, theme });
    // Interleave new cards between reviews so sessions don't front-load novelty.
    const queue = [];
    const reviews = due.map((c) => ({ card: c, kind: 'review' }));
    const news = unseen.map((c) => ({ card: c, kind: 'new' }));
    while (reviews.length || news.length) {
      if (reviews.length) queue.push(reviews.shift());
      if (reviews.length) queue.push(reviews.shift());
      if (news.length) queue.push(news.shift());
    }
    if (!queue.length) {
      main.innerHTML = `<section class="card"><h2>All caught up</h2>
        <p>Nothing due${theme ? ' in this theme' : ''} and no new phrases left for today. Spacing works because of the gap — come back tomorrow, or practice in Speak, Listen or Read.</p>
        <a class="btn" href="#/speak">Go to Speak</a> <a class="btn" href="#/listen">Go to Listen</a></section>`;
      return;
    }
    const session = { queue, done: 0, correct: 0, total: queue.length };
    nextLearn(session);
  }

  function nextLearn(session) {
    const item = session.queue.shift();
    if (!item) {
      main.innerHTML = `<section class="card"><h2>Session done ✔</h2>
        <p>${session.done} retrievals, ${session.correct} recalled without "Again".</p>
        <a class="btn primary" href="#/">Home</a> <a class="btn" href="#/speak">Practice speaking</a></section>`;
      return;
    }
    if (item.kind === 'new') return showNew(session, item.card);
    return showReview(session, item.card);
  }

  function progressBar(session) {
    const left = session.queue.length + 1;
    return `<div class="sessionbar"><span>${left} left</span><span class="bar"><i style="width:${(session.done / (session.done + left)) * 100}%"></i></span></div>`;
  }

  function cardBack(card) {
    return `
      <div class="es big">${esc(card.es)} ${sayBtn(card.es)} ${sayBtn(card.es, '🐢', 'data-rate="0.6"')}</div>
      <div class="en">${esc(card.en)}</div>
      ${card.note ? `<p class="note">${esc(card.note)}</p>` : ''}
      ${card.ex ? `<p class="ex">${sayBtn(card.ex)} <span>${esc(card.ex)}</span><br><span class="muted">${esc(card.exEn)}</span></p>` : ''}`;
  }

  function showNew(session, card) {
    const d = D();
    const p = P();
    main.innerHTML = `
      ${progressBar(session)}
      <section class="card flash">
        <div class="tag">New · ${esc(PT.themes.find((t) => t.id === card.t).label)}</div>
        ${cardBack(card)}
        <p class="muted small">Listen, then say it aloud twice — copy the rhythm, not just the words.</p>
        <button class="btn primary big" id="got">Got it — test me later</button>
      </section>`;
    PT.speech.speak(card.es, d);
    $('#got').onclick = () => {
      p.cards[card.id] = { ...PT.srs.fresh(), due: Date.now() };
      p.newLog[today()] = (p.newLog[today()] || 0) + 1;
      save();
      // First retrieval attempt comes later in the same session.
      const pos = Math.min(session.queue.length, 3);
      session.queue.splice(pos, 0, { card, kind: 'review' });
      nextLearn(session);
    };
  }

  function showReview(session, card) {
    const d = D();
    const p = P();
    const dir = S.settings().direction;
    const production = dir === 'production' || (dir === 'mixed' && Math.random() < 0.7);
    const state = p.cards[card.id] || PT.srs.fresh();

    main.innerHTML = `
      ${progressBar(session)}
      <section class="card flash">
        <div class="tag">${production ? 'Say it in ' + esc(d.name) : 'What does this mean?'}</div>
        ${production
          ? `<div class="prompt">${esc(card.en)}</div>${produceBox('ans')}`
          : `<div class="prompt es">${esc(card.es)} ${sayBtn(card.es)}</div>
             <input id="ans" class="answer" placeholder="Meaning in English (optional)…" autocomplete="off">`}
        <button class="btn primary big" id="reveal">Show answer</button>
        <div id="back" hidden></div>
      </section>`;
    if (!production) PT.speech.speak(card.es, d);
    const input = $('#ans');
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#reveal').click(); });

    $('#reveal').onclick = () => {
      $('#reveal').hidden = true;
      let feedback = '';
      if (production && attemptsOf(input).length) {
        const m = scoreAttempt(input, answersFor(card));
        const v = verdict(m.score);
        feedback = `<p class="verdict ${v.cls}">${v.text} · ${pct(m.score)} match</p>
          <p class="diff">${wordDiff(m.attempt, m.target)}</p>`;
      }
      const back = $('#back');
      back.hidden = false;
      back.innerHTML = `${feedback}${cardBack(card)}
        <p class="muted small">How well did you recall it?</p>
        <div class="grades">
          ${PT.srs.GRADES.map((g) => `<button class="btn grade ${g}" data-grade="${g}">${g[0].toUpperCase() + g.slice(1)}<small>${PT.srs.label(state, g)}</small></button>`).join('')}
        </div>`;
      PT.speech.speak(card.es, d);
      $$('[data-grade]', back).forEach((b) => (b.onclick = () => {
        const g = b.dataset.grade;
        p.cards[card.id] = PT.srs.schedule(state, g);
        save();
        S.logActivity(d.id);
        session.done++;
        if (g === 'again') session.queue.push({ card, kind: 'review' });
        else session.correct++;
        nextLearn(session);
      }));
    };
  }

  // ---------- speak ----------

  function viewSpeak(sub) {
    const d = D();
    const p = P();
    if (sub === 'shadow') return viewShadowList();
    if (sub && sub.startsWith('shadow-')) return viewShadow(sub.slice(7), 0);
    if (sub) {
      const task = d.tasks.find((t) => t.id === sub);
      if (task) return viewTask(task);
    }
    main.innerHTML = `
      <section class="card">
        <h2>Speak</h2>
        <div class="tabs"><a class="active" href="#/speak">Role-play</a><a href="#/speak/shadow">Shadowing</a></div>
        <p class="muted small">Real situations you'll face with ${esc(d.name)} speakers. Answer out loud${PT.speech.canRecognize ? ' with the mic' : ''} or type, then compare with native models. There's more than one right answer — the score measures closeness to the models, not correctness in an absolute sense.</p>
        <div class="list">
          ${d.tasks.map((t) => `<a class="list-item" href="#/speak/${t.id}">
            <span>${esc(t.prompt)}</span>
            <span class="score">${t.id in p.tasks ? pct(p.tasks[t.id]) : ''}</span></a>`).join('')}
        </div>
      </section>`;
  }

  function viewTask(task) {
    const d = D();
    const p = P();
    const idx = d.tasks.indexOf(task);
    const next = d.tasks[(idx + 1) % d.tasks.length];
    main.innerHTML = `
      <section class="card">
        <a href="#/speak" class="back">← All tasks</a>
        <div class="tag">Role-play · ${esc(d.name)}</div>
        <div class="prompt">${esc(task.prompt)}</div>
        ${produceBox('ans', 'Say it (🎤) or type it…')}
        <div class="row">
          <button class="btn primary" id="check">Check</button>
          ${PT.speech.canRecord ? '<button class="btn" id="rec">● Record myself</button><span id="mine"></span>' : ''}
        </div>
        <div id="result"></div>
        <a class="btn" href="#/speak/${next.id}">Next task →</a>
      </section>`;
    const input = $('#ans');
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#check').click(); });
    wireRecorder();

    $('#check').onclick = () => {
      if (!attemptsOf(input).length) return toast('Say or type something first.');
      const m = scoreAttempt(input, task.models);
      const v = verdict(m.score);
      p.tasks[task.id] = Math.max(p.tasks[task.id] || 0, m.score);
      save();
      S.logActivity(d.id);
      $('#result').innerHTML = `
        <p class="verdict ${v.cls}">${v.text} · ${pct(m.score)} match</p>
        <p class="diff">${wordDiff(m.attempt, m.target)}</p>
        <h4>Native-style models</h4>
        <ul class="models">${task.models.map((x) => `<li>${sayBtn(x)} ${esc(x)}</li>`).join('')}</ul>
        <p class="muted small">Now say the closest model aloud 2–3 times, matching its rhythm.</p>`;
    };
  }

  function wireRecorder() {
    const rec = $('#rec');
    if (!rec) return;
    let recording = false;
    rec.onclick = async () => {
      try {
        if (!recording) {
          await PT.speech.startRecording();
          recording = true;
          rec.textContent = '■ Stop';
          rec.classList.add('listening');
        } else {
          const url = await PT.speech.stopRecording();
          recording = false;
          rec.textContent = '● Record myself';
          rec.classList.remove('listening');
          if (url) $('#mine').innerHTML = `<audio controls src="${url}"></audio>`;
        }
      } catch (err) {
        toast('Microphone unavailable: ' + err.message);
      }
    };
  }

  function viewShadowList() {
    const d = D();
    main.innerHTML = `
      <section class="card">
        <h2>Speak</h2>
        <div class="tabs"><a href="#/speak">Role-play</a><a class="active" href="#/speak/shadow">Shadowing</a></div>
        <p class="muted small">Line by line: listen, repeat immediately copying the melody, record yourself, compare. Targets rhythm and intonation — the features that most affect how easily you're understood.</p>
        <div class="list">
          ${d.dialogues.map((x) => `<a class="list-item" href="#/speak/shadow-${x.id}"><span>${esc(x.title)}</span><span class="muted small">${x.lines.length} lines</span></a>`).join('')}
        </div>
      </section>`;
  }

  function viewShadow(dialogueId, i) {
    const d = D();
    const dlg = d.dialogues.find((x) => x.id === dialogueId);
    if (!dlg) return viewShadowList();
    const line = dlg.lines[i];
    main.innerHTML = `
      <section class="card">
        <a href="#/speak/shadow" class="back">← Shadowing</a>
        <div class="tag">${esc(dlg.title)} · line ${i + 1}/${dlg.lines.length}</div>
        <div class="es big">${esc(line.es)}</div>
        <details><summary>English</summary>${esc(line.en)}</details>
        <div class="row">
          ${sayBtn(line.es, '▶ Model')} ${sayBtn(line.es, '🐢 Slow', 'data-rate="0.6"')}
          ${PT.speech.canRecord ? '<button class="btn" id="rec">● Record myself</button>' : ''}
        </div>
        <div id="mine"></div>
        ${PT.speech.canRecognize ? `${produceBox('ans', 'Optional: say it with 🎤 for a transcript check')}<button class="btn" id="check">Check</button><div id="result"></div>` : ''}
        <div class="row nav">
          <button class="btn" id="prev" ${i === 0 ? 'disabled' : ''}>← Prev</button>
          <button class="btn primary" id="next">${i === dlg.lines.length - 1 ? 'Finish' : 'Next →'}</button>
        </div>
      </section>`;
    PT.speech.speak(line.es, d);
    wireRecorder();
    const check = $('#check');
    if (check) check.onclick = () => {
      const input = $('#ans');
      if (!attemptsOf(input).length) return toast('Use the mic first.');
      const m = scoreAttempt(input, [line.es]);
      const v = verdict(m.score);
      $('#result').innerHTML = `<p class="verdict ${v.cls}">${v.text} · ${pct(m.score)}</p><p class="diff">${wordDiff(m.attempt, line.es)}</p>
        <p class="muted small">Recognition engines are tuned to standard accents and can mishear dialect speech — treat this as a rough check.</p>`;
    };
    $('#prev').onclick = () => viewShadow(dialogueId, i - 1);
    $('#next').onclick = () => {
      if (i === dlg.lines.length - 1) {
        S.logActivity(d.id);
        location.hash = '#/speak/shadow';
      } else viewShadow(dialogueId, i + 1);
    };
  }

  // ---------- read ----------

  function glossify(text, gloss) {
    const keys = Object.keys(gloss).sort((a, b) => b.length - a.length);
    if (!keys.length) return esc(text);
    const pattern = new RegExp(`(?<![\\p{L}])(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}])`, 'giu');
    let out = '';
    let last = 0;
    for (const m of text.matchAll(pattern)) {
      out += esc(text.slice(last, m.index));
      const key = keys.find((k) => k.toLowerCase() === m[0].toLowerCase());
      out += `<button class="gl" data-gloss="${esc(gloss[key])}">${esc(m[0])}</button>`;
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  function quiz(questions, onScore, prefix = 'q') {
    const html = `
      <ol class="quiz">${questions.map((q, i) => `
        <li id="${prefix}${i}"><p>${esc(q.q)}</p>${optionsList(prefix + i, q.options)}</li>`).join('')}
      </ol>
      <button class="btn primary" id="${prefix}-check">Check answers</button>
      <div id="${prefix}-result"></div>`;
    const wire = () => {
      $(`#${prefix}-check`).onclick = () => {
        let right = 0;
        questions.forEach((q, i) => {
          const li = $(`#${prefix}${i}`);
          const chosen = li.querySelector('input:checked');
          $$('label', li).forEach((l, j) => {
            l.classList.toggle('right', j === q.answer);
            l.classList.toggle('wrong', !!chosen && Number(chosen.value) === j && j !== q.answer);
          });
          if (chosen && Number(chosen.value) === q.answer) right++;
        });
        const score = right / questions.length;
        $(`#${prefix}-result`).innerHTML = `<p class="verdict ${score >= 0.8 ? 'good' : score >= 0.5 ? 'close' : 'bad'}">${right}/${questions.length} correct</p>`;
        onScore(score);
      };
    };
    return { html, wire };
  }

  function viewRead(sub) {
    const d = D();
    const p = P();
    const r = d.readings.find((x) => x.id === sub);
    if (!r) {
      main.innerHTML = `
        <section class="card">
          <h2>Read</h2>
          <p class="muted small">Short authentic-style texts in ${esc(d.name)}. Read for meaning first; tap underlined words only when you're stuck. Then read it aloud.</p>
          <div class="list">
            ${d.readings.map((x) => `<a class="list-item" href="#/read/${x.id}"><span>${esc(x.title)} <small class="muted">${x.level}</small></span>
              <span class="score">${x.id in p.readings ? pct(p.readings[x.id]) : ''}</span></a>`).join('')}
          </div>
        </section>`;
      return;
    }
    const q = quiz(r.questions, (score) => {
      p.readings[r.id] = Math.max(p.readings[r.id] || 0, score);
      save();
      S.logActivity(d.id);
    });
    main.innerHTML = `
      <section class="card">
        <a href="#/read" class="back">← All texts</a>
        <h2>${esc(r.title)} <small class="muted">${r.level}</small></h2>
        <div class="row">${sayBtn(r.text.join(' '), '▶ Read aloud')} <button class="btn" id="stop">■</button></div>
        <div class="reading">${r.text.map((t) => `<p>${glossify(t, r.gloss)}</p>`).join('')}</div>
        <div id="glossbar" class="glossbar" hidden></div>
      </section>
      <section class="card"><h3>Comprehension</h3>${q.html}</section>`;
    q.wire();
    $('#stop').onclick = () => PT.speech.stop();
    $$('.gl').forEach((b) => (b.onclick = () => {
      const bar = $('#glossbar');
      bar.hidden = false;
      bar.innerHTML = `<b>${esc(b.textContent)}</b> — ${esc(b.dataset.gloss)} ${sayBtn(b.textContent)}`;
      b.classList.add('looked');
    }));
  }

  // ---------- listen ----------

  function viewListen(sub) {
    const d = D();
    const p = P();
    if (sub === 'dictation') return viewDictation();
    const dlg = d.dialogues.find((x) => x.id === sub);
    if (!dlg) {
      main.innerHTML = `
        <section class="card">
          <h2>Listen</h2>
          <div class="tabs"><a class="active" href="#/listen">Dialogues</a><a href="#/listen/dictation">Dictation</a></div>
          <p class="muted small">Listen at least twice before opening the transcript. Answer the questions from what you heard, then read along to notice what you missed.</p>
          <div class="list">
            ${d.dialogues.map((x) => `<a class="list-item" href="#/listen/${x.id}"><span>${esc(x.title)}</span>
              <span class="score">${x.id in p.dialogues ? pct(p.dialogues[x.id]) : ''}</span></a>`).join('')}
          </div>
        </section>`;
      return;
    }
    const q = quiz(dlg.questions, (score) => {
      p.dialogues[dlg.id] = Math.max(p.dialogues[dlg.id] || 0, score);
      save();
      S.logActivity(d.id);
    });
    main.innerHTML = `
      <section class="card">
        <a href="#/listen" class="back">← All dialogues</a>
        <h2>${esc(dlg.title)}</h2>
        <p class="muted">${esc(dlg.situation)}</p>
        <div class="row">
          <button class="btn primary" id="play">▶ Play dialogue</button>
          <button class="btn" id="stop">■ Stop</button>
          <label class="small"><input type="checkbox" id="show-t"> Show transcript</label>
          <label class="small"><input type="checkbox" id="show-en"> Show English</label>
        </div>
        <ol class="lines" id="lines">
          ${dlg.lines.map((l, i) => `<li data-i="${i}" class="who-${l.who}">
            ${sayBtn(l.es)} <b>${l.who}:</b> <span class="t-es">${esc(l.es)}</span>
            <div class="t-en muted small">${esc(l.en)}</div></li>`).join('')}
        </ol>
      </section>
      <section class="card"><h3>What did you hear?</h3>${q.html}</section>`;
    q.wire();
    const lines = $('#lines');
    lines.classList.add('hide-es', 'hide-en');
    $('#show-t').onchange = (e) => lines.classList.toggle('hide-es', !e.target.checked);
    $('#show-en').onchange = (e) => lines.classList.toggle('hide-en', !e.target.checked);
    $('#stop').onclick = () => { playToken++; PT.speech.stop(); };
    $('#play').onclick = async () => {
      const token = ++playToken;
      for (let i = 0; i < dlg.lines.length; i++) {
        if (token !== playToken) return;
        $$('li', lines).forEach((li) => li.classList.toggle('playing', Number(li.dataset.i) === i));
        const l = dlg.lines[i];
        await PT.speech.speak(l.es, d, { pitch: l.who === 'A' ? 1.15 : 0.85 });
        await new Promise((r) => setTimeout(r, 350));
      }
      $$('li', lines).forEach((li) => li.classList.remove('playing'));
    };
  }

  function dictationPool(d) {
    const fromCards = d.cards.filter((c) => c.ex).map((c) => ({ es: c.ex, en: c.exEn }));
    const fromDialogues = d.dialogues.flatMap((x) => x.lines.map((l) => ({ es: l.es, en: l.en })));
    return [...fromCards, ...fromDialogues];
  }

  function viewDictation() {
    const d = D();
    const p = P();
    const item = sample(dictationPool(d), 1)[0];
    const recent = p.dictation.slice(-10);
    const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
    main.innerHTML = `
      <section class="card">
        <h2>Listen</h2>
        <div class="tabs"><a href="#/listen">Dialogues</a><a class="active" href="#/listen/dictation">Dictation</a></div>
        <p class="muted small">Hear a sentence and write exactly what you hear. Dictation forces you to segment fast speech into words — the core listening skill. Recent average: ${avg === null ? '—' : pct(avg)}</p>
        <div class="row">${sayBtn(item.es, '▶ Play')} ${sayBtn(item.es, '🐢 Slow', 'data-rate="0.6"')}</div>
        <input id="ans" class="answer" placeholder="Write what you hear…" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="btn primary" id="check">Check</button>
        <div id="result"></div>
      </section>`;
    PT.speech.speak(item.es, d);
    const input = $('#ans');
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#check').click(); });
    $('#check').onclick = () => {
      if (!input.value.trim()) return toast('Type what you heard first.');
      const score = PT.util.similarity(input.value, item.es);
      const v = verdict(score);
      p.dictation.push(score);
      if (p.dictation.length > 50) p.dictation.shift();
      save();
      S.logActivity(d.id);
      $('#check').hidden = true;
      $('#result').innerHTML = `
        <p class="verdict ${v.cls}">${v.text} · ${pct(score)}</p>
        <p class="diff">${wordDiff(input.value, item.es)}</p>
        <p>${sayBtn(item.es)} ${esc(item.es)}<br><span class="muted">${esc(item.en)}</span></p>
        <button class="btn primary" id="again">Next sentence</button>`;
      $('#again').onclick = viewDictation;
    };
  }

  // ---------- test ----------

  function viewTest() {
    const d = D();
    const p = P();
    const history = p.tests.slice(-8).reverse();
    main.innerHTML = `
      <section class="card">
        <h2>${esc(d.name)} test</h2>
        <p>10 items: <b>5 production</b> (you generate ${esc(d.name)} Spanish — spoken or typed) and <b>5 reception</b> (you understand ${esc(d.name)} Spanish — heard or read). Scored separately, because they develop at different rates.</p>
        <p class="muted small">Drawn mainly from phrases you've started, so it measures retention. No hints, no retries.</p>
        <button class="btn primary big" id="start">Start test</button>
      </section>
      ${history.length ? `<section class="card"><h3>History</h3>
        <table class="hist"><tr><th>Date</th><th>Production</th><th>Reception</th></tr>
        ${history.map((t) => `<tr><td>${t.date}</td><td>${pct(t.production)}</td><td>${pct(t.reception)}</td></tr>`).join('')}
        </table></section>` : ''}`;
    $('#start').onclick = () => runTest(buildTest(d, p), 0, []);
  }

  function buildTest(d, p) {
    const seen = d.cards.filter((c) => p.cards[c.id]);
    const pool = seen.length >= 8 ? seen : d.cards;
    const picks = sample(pool, 8);
    const distractorsFor = (c) => sample(d.cards.filter((x) => x.id !== c.id && x.en !== c.en), 3).map((x) => x.en);
    const items = [];
    picks.slice(0, 3).forEach((c) => items.push({ type: 'produce-card', card: c }));
    sample(d.tasks, 2).forEach((t) => items.push({ type: 'produce-task', task: t }));
    picks.slice(3, 6).forEach((c) => items.push({ type: 'listen', card: c, options: shuffle([c.en, ...distractorsFor(c)]) }));
    picks.slice(6, 8).forEach((c) => items.push({ type: 'read', card: c, options: shuffle([c.en, ...distractorsFor(c)]) }));
    // Alternate production and reception rather than blocking them.
    const prod = items.filter((x) => x.type.startsWith('produce'));
    const rec = items.filter((x) => !x.type.startsWith('produce'));
    const out = [];
    while (prod.length || rec.length) {
      if (prod.length) out.push(prod.shift());
      if (rec.length) out.push(rec.shift());
    }
    return out;
  }

  function runTest(items, i, results) {
    const d = D();
    if (i >= items.length) return finishTest(items, results);
    const it = items[i];
    const head = `<div class="sessionbar"><span>${i + 1}/${items.length}</span><span class="bar"><i style="width:${(i / items.length) * 100}%"></i></span></div>`;
    const advance = (score, detail) => {
      results.push({ score, kind: it.type.startsWith('produce') ? 'production' : 'reception', detail });
      runTest(items, i + 1, results);
    };

    if (it.type === 'produce-card' || it.type === 'produce-task') {
      const prompt = it.type === 'produce-card' ? it.card.en : it.task.prompt;
      const targets = it.type === 'produce-card' ? answersFor(it.card) : it.task.models;
      main.innerHTML = `${head}
        <section class="card flash">
          <div class="tag">Production · say or write it in ${esc(d.name)}</div>
          <div class="prompt">${esc(prompt)}</div>
          ${produceBox('ans')}
          <button class="btn primary big" id="submit">Submit</button>
        </section>`;
      const input = $('#ans');
      input.focus();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#submit').click(); });
      $('#submit').onclick = () => {
        const m = scoreAttempt(input, targets);
        const score = m.score >= CORRECT ? 1 : m.score >= CLOSE ? 0.5 : 0;
        advance(score, { prompt, answer: m.attempt, target: m.target });
      };
      return;
    }

    const isListen = it.type === 'listen';
    const text = it.card.es;
    main.innerHTML = `${head}
      <section class="card flash">
        <div class="tag">Reception · ${isListen ? 'listen' : 'read'}</div>
        ${isListen
          ? `<div class="row">${sayBtn(text, '▶ Play')} ${sayBtn(text, '🐢 Slow', 'data-rate="0.6"')}</div>`
          : `<div class="prompt es">${esc(text)}</div>`}
        <p>What does it mean?</p>
        <div class="opts">${optionsList('mc', it.options)}</div>
        <button class="btn primary big" id="submit">Submit</button>
      </section>`;
    if (isListen) PT.speech.speak(text, d);
    $('#submit').onclick = () => {
      const chosen = $('input[name="mc"]:checked');
      if (!chosen) return toast('Pick an answer.');
      const ans = it.options[Number(chosen.value)];
      advance(ans === it.card.en ? 1 : 0, { prompt: text, answer: ans, target: it.card.en });
    };
  }

  function finishTest(items, results) {
    const d = D();
    const p = P();
    const avg = (kind) => {
      const r = results.filter((x) => x.kind === kind);
      return r.length ? r.reduce((a, b) => a + b.score, 0) / r.length : 0;
    };
    const production = avg('production');
    const reception = avg('reception');
    p.tests.push({ date: today(), production, reception, items: items.length });
    save();
    S.logActivity(d.id, 2);
    main.innerHTML = `
      <section class="card">
        <h2>Results</h2>
        <section class="tiles">
          <div class="tile"><b>${pct(production)}</b><span>production</span></div>
          <div class="tile"><b>${pct(reception)}</b><span>reception</span></div>
        </section>
        <ol class="review">${results.map((r) => `
          <li class="${r.score === 1 ? 'good' : r.score > 0 ? 'close' : 'bad'}">
            <span class="muted small">${r.kind}</span><br>
            ${esc(r.detail.prompt)}<br>
            <b>You:</b> ${esc(r.detail.answer || '—')}<br>
            <b>Target:</b> ${esc(r.detail.target)} ${r.kind === 'production' ? sayBtn(r.detail.target) : ''}
          </li>`).join('')}</ol>
        <p class="muted small">${production < reception
          ? 'Production trails reception — normal. Shift time toward Speak role-plays and production-direction reviews.'
          : 'Reception is the weaker side — add more Listen dialogues and dictation.'}</p>
        <a class="btn primary" href="#/test">Done</a>
      </section>`;
  }

  // ---------- guide ----------

  function viewGuide() {
    const d = D();
    const pr = d.profile;
    const rows = (arr) => arr.map((x) => `
      <div class="feature"><h4>${esc(x.feature)}</h4>
      <p class="ex">${sayBtn(x.example.split('→')[0].split(',')[0].trim())} ${esc(x.example)}</p>
      <p class="muted">${esc(x.note)}</p></div>`).join('');
    main.innerHTML = `
      <section class="card"><h2>${d.flag} ${esc(d.name)} field guide</h2><p>${esc(d.intro)}</p>
        <p class="muted small">Know these features before you listen — expecting a sound change makes it far easier to hear through it.</p></section>
      <section class="card"><h3>Sounds</h3>${rows(pr.sounds)}
        <p class="muted small">Note: device voices usually can't reproduce these features faithfully. Use this list to train your ear on real speakers.</p></section>
      <section class="card"><h3>Grammar</h3>${rows(pr.grammar)}</section>
      <section class="card"><h3>How people talk</h3>${rows(pr.pragmatics)}</section>
      <section class="card"><h3>Watch out</h3>
        ${pr.watchOut.map((w) => `<div class="feature"><h4>${esc(w.term)}</h4><p class="muted">${esc(w.note)}</p></div>`).join('')}</section>`;
  }

  // ---------- method ----------

  function viewMethod() {
    main.innerHTML = $('#method-template').innerHTML;
  }

  // ---------- router ----------

  function route() {
    playToken++;
    PT.speech.stop();
    const [, view = '', sub] = (location.hash || '#/').split('/');
    const v = view || 'home';
    renderChrome(v);
    window.scrollTo(0, 0);
    switch (v) {
      case 'learn': return viewLearn();
      case 'speak': return viewSpeak(sub);
      case 'read': return viewRead(sub);
      case 'listen': return viewListen(sub);
      case 'test': return viewTest();
      case 'guide': return viewGuide();
      case 'method': return viewMethod();
      default: return viewHome();
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
