// Speech: text-to-speech, speech recognition and self-recording.
// In the browser this uses the Web Speech API. Inside the Android app the
// WebView lacks those APIs, so it uses native Capacitor plugins instead.
PT.speech = (() => {
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const NativeTTS = native ? cap.Plugins.TextToSpeech : null;
  const NativeSR = native ? cap.Plugins.SpeechRecognition : null;

  const synth = native ? null : window.speechSynthesis;
  const Recognition = native ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
  let voices = [];

  // Native voice indexes must match getSupportedVoices() order, so keep the
  // list as returned.
  function loadVoices() {
    if (NativeTTS) {
      NativeTTS.getSupportedVoices()
        .then((r) => { voices = (r.voices || []).map((v, index) => ({ ...v, index })); })
        .catch(() => {});
    } else if (synth) {
      voices = synth.getVoices();
    }
  }
  loadVoices();
  if (synth) synth.addEventListener?.('voiceschanged', loadVoices);

  const norm = (lang) => String(lang || '').replace('_', '-').toLowerCase();

  // Pick the closest regional voice available on this device.
  function voiceFor(dialect) {
    if (!voices.length && synth) loadVoices();
    for (const lang of dialect.ttsLangs) {
      const want = lang.toLowerCase();
      const v = voices.find((x) => norm(x.lang) === want)
        || (want === 'es' && voices.find((x) => norm(x.lang).startsWith('es')));
      if (v) return v;
    }
    return null;
  }

  function speak(text, dialect, { rate, pitch = 1 } = {}) {
    const clean = text.replace(/—/g, ', ');
    const r = rate ?? PT.store.settings().rate;
    if (NativeTTS) {
      const v = voiceFor(dialect);
      return NativeTTS.stop().catch(() => {})
        .then(() => NativeTTS.speak({
          text: clean,
          lang: v ? v.lang : dialect.ttsLangs[0],
          ...(v ? { voice: v.index } : {}),
          rate: r,
          pitch,
          volume: 1,
          category: 'playback',
        }))
        .then(() => true, () => false);
    }
    return new Promise((resolve) => {
      if (!synth) return resolve(false);
      synth.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      const v = voiceFor(dialect);
      if (v) u.voice = v;
      u.lang = v ? v.lang : dialect.ttsLangs[0];
      u.rate = r;
      u.pitch = pitch;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      synth.speak(u);
    });
  }

  function stop() {
    if (NativeTTS) NativeTTS.stop().catch(() => {});
    else if (synth) synth.cancel();
  }

  function voiceInfo(dialect) {
    if (!synth && !NativeTTS) return { ok: false, text: 'This browser has no text-to-speech.' };
    const v = voiceFor(dialect);
    if (!v) {
      return {
        ok: false,
        text: native
          ? 'No Spanish voice found yet. In Android Settings → Text-to-speech, install Spanish voice data (Speech Services by Google).'
          : 'No Spanish voice found on this device. Install one in your OS speech settings.',
      };
    }
    const nativeAccent = norm(v.lang) === dialect.ttsLangs[0].toLowerCase();
    return {
      ok: true,
      native: nativeAccent,
      text: `${v.name || v.voiceURI || 'Voice'} (${v.lang})${nativeAccent ? '' : ` — not a ${dialect.name} accent; closest available`}`,
    };
  }

  const canRecognize = !!(Recognition || NativeSR);

  async function listenNative(dialect) {
    const { available } = await NativeSR.available();
    if (!available) throw new Error('Speech recognition is not available. Install or enable the Google app.');
    const perm = await NativeSR.requestPermissions();
    if (perm.speechRecognition !== 'granted') throw new Error('Microphone permission denied.');
    const res = await NativeSR.start({
      language: dialect.srLang,
      maxResults: 3,
      partialResults: false,
      popup: false,
    });
    return res.matches || [];
  }

  function listen(dialect) {
    if (NativeSR) return listenNative(dialect);
    return new Promise((resolve, reject) => {
      if (!Recognition) return reject(new Error('Speech recognition is not supported in this browser (try Chrome or Edge).'));
      const r = new Recognition();
      r.lang = dialect.srLang;
      r.interimResults = false;
      r.maxAlternatives = 3;
      let done = false;
      r.onresult = (e) => {
        done = true;
        const alts = Array.from(e.results[0]).map((a) => a.transcript);
        resolve(alts);
      };
      r.onerror = (e) => { if (!done) { done = true; reject(new Error(e.error === 'not-allowed' ? 'Microphone permission denied.' : `Recognition error: ${e.error}`)); } };
      r.onend = () => { if (!done) { done = true; resolve([]); } };
      r.start();
    });
  }

  // Record the learner's own voice for comparison with the model.
  const canRecord = !!(navigator.mediaDevices && window.MediaRecorder);
  let recorder = null;
  let chunks = [];

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
  }

  function stopRecording() {
    return new Promise((resolve) => {
      if (!recorder) return resolve(null);
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        recorder = null;
        resolve(URL.createObjectURL(blob));
      };
      recorder.stop();
    });
  }

  return { native, speak, stop, voiceInfo, canRecognize, listen, canRecord, startRecording, stopRecording };
})();
