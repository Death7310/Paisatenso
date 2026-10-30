// Browser speech: text-to-speech, speech recognition and self-recording.
PT.speech = (() => {
  const synth = window.speechSynthesis;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let voices = [];

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices();
  }
  if (synth) {
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
  }

  // Pick the closest regional voice available on this device.
  function voiceFor(dialect) {
    if (!voices.length) loadVoices();
    for (const lang of dialect.ttsLangs) {
      const want = lang.toLowerCase();
      const v = voices.find((x) => x.lang.replace('_', '-').toLowerCase() === want)
        || (want === 'es' && voices.find((x) => x.lang.toLowerCase().startsWith('es')));
      if (v) return v;
    }
    return null;
  }

  function speak(text, dialect, { rate, pitch = 1 } = {}) {
    return new Promise((resolve) => {
      if (!synth) return resolve(false);
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/—/g, ', '));
      const v = voiceFor(dialect);
      if (v) u.voice = v;
      u.lang = v ? v.lang : dialect.ttsLangs[0];
      u.rate = rate ?? PT.store.settings().rate;
      u.pitch = pitch;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      synth.speak(u);
    });
  }

  function stop() {
    if (synth) synth.cancel();
  }

  function voiceInfo(dialect) {
    if (!synth) return { ok: false, text: 'This browser has no text-to-speech.' };
    const v = voiceFor(dialect);
    if (!v) return { ok: false, text: 'No Spanish voice found on this device. Install one in your OS speech settings.' };
    const native = v.lang.replace('_', '-').toLowerCase() === dialect.ttsLangs[0].toLowerCase();
    return {
      ok: true,
      native,
      text: `${v.name} (${v.lang})${native ? '' : ` — not a ${dialect.name} accent; closest available`}`,
    };
  }

  const canRecognize = !!Recognition;

  function listen(dialect) {
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

  return { speak, stop, voiceInfo, canRecognize, listen, canRecord, startRecording, stopRecording };
})();
