// Moteur audio 100% synthétisé (Web Audio API) — aucun fichier externe.
// Expose window.SFX (bruitages ponctuels) et window.Music (nappes
// d'ambiance monde/combat, avec transition en fondu).
//
// L'AudioContext ne peut démarrer qu'après un geste utilisateur (politique
// autoplay des navigateurs) : on le déclenche au premier clic/touche.
(function () {
  let ctx = null;
  let masterGain, sfxGain, musicGain, worldGain, combatGain;
  let started = false;
  let pulseTimer = null;
  let chimeTimer = null;

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    masterGain = ctx.createGain(); masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);

    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9;
    sfxGain.connect(masterGain);

    musicGain = ctx.createGain(); musicGain.gain.value = 0.35;
    musicGain.connect(masterGain);

    worldGain = ctx.createGain(); worldGain.gain.value = 1;
    worldGain.connect(musicGain);

    combatGain = ctx.createGain(); combatGain.gain.value = 0;
    combatGain.connect(musicGain);

    return ctx;
  }

  function resume() {
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (!started) {
      started = true;
      startMusic();
    }
  }

  // ───────────────────────── SFX ponctuels ─────────────────────────
  function playTone({ freq = 440, duration = 0.15, type = 'sine', gain = 0.3, glideTo = null, delay = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t0); osc.stop(t0 + duration + 0.03);
  }

  function playNoise({ duration = 0.15, gain = 0.3, delay = 0, filterFreq = 1200 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter); filter.connect(g); g.connect(sfxGain);
    src.start(t0);
  }

  function playArpeggio(freqs, { duration = 0.18, type = 'triangle', gain = 0.28, step = 0.09 } = {}) {
    freqs.forEach((f, i) => playTone({ freq: f, duration, type, gain, delay: i * step }));
  }

  const SFX = {
    hit() {
      playNoise({ duration: 0.1, gain: 0.3, filterFreq: 2200 });
      playTone({ freq: 180, glideTo: 60, duration: 0.1, type: 'square', gain: 0.22 });
    },
    hurt() {
      playTone({ freq: 220, glideTo: 80, duration: 0.22, type: 'sawtooth', gain: 0.26 });
    },
    heal() {
      playArpeggio([523, 784], { duration: 0.14, type: 'sine', gain: 0.2, step: 0.08 });
    },
    pickup() {
      playArpeggio([660, 880], { duration: 0.1, type: 'sine', gain: 0.22, step: 0.07 });
    },
    levelUp() {
      playArpeggio([523, 659, 784, 1046], { duration: 0.18, type: 'triangle', gain: 0.28, step: 0.09 });
    },
    jump() {
      playTone({ freq: 300, glideTo: 600, duration: 0.1, type: 'square', gain: 0.12 });
    },
    win() {
      playArpeggio([523, 659, 784, 1046, 1318], { duration: 0.2, type: 'triangle', gain: 0.26, step: 0.1 });
    },
    lose() {
      playArpeggio([400, 340, 280, 220], { duration: 0.28, type: 'sawtooth', gain: 0.22, step: 0.15 });
    },
  };

  // ───────────────────────── Musique générative ─────────────────────────
  // Nappe "monde" : deux oscillateurs légèrement désaccordés + LFO sur un
  // filtre passe-bas, avec des carillons occasionnels sur une gamme
  // pentatonique pour éviter le côté purement drone/monotone.
  const PENTATONIC = [261.6, 293.7, 349.2, 392.0, 440.0, 523.3, 587.3];

  function startMusic() {
    const padOsc1 = ctx.createOscillator(); padOsc1.type = 'sine'; padOsc1.frequency.value = 110;
    const padOsc2 = ctx.createOscillator(); padOsc2.type = 'sine'; padOsc2.frequency.value = 110 * 1.5;
    const padGain = ctx.createGain(); padGain.gain.value = 0.16;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 300;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
    padOsc1.connect(filter); padOsc2.connect(filter); filter.connect(padGain); padGain.connect(worldGain);
    padOsc1.start(); padOsc2.start(); lfo.start();

    chimeTimer = setInterval(() => {
      if (worldGain.gain.value < 0.05) return; // pas la peine en plein combat
      if (Math.random() < 0.35) {
        const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
        playTone({ freq: f, duration: 1.4, type: 'sine', gain: 0.05, delay: 0 });
      }
    }, 3200);

    // Combat : pulsation basse régulière + nappe filtrée plus tendue.
    const bassOsc = ctx.createOscillator(); bassOsc.type = 'sawtooth'; bassOsc.frequency.value = 55;
    const bassFilter = ctx.createBiquadFilter(); bassFilter.type = 'lowpass'; bassFilter.frequency.value = 300;
    const bassGain = ctx.createGain(); bassGain.gain.value = 0;
    bassOsc.connect(bassFilter); bassFilter.connect(bassGain); bassGain.connect(combatGain);
    bassOsc.start();

    pulseTimer = setInterval(() => {
      if (combatGain.gain.value < 0.05) return; // pas en combat, pas la peine de pulser
      const t = ctx.currentTime;
      bassGain.gain.cancelScheduledValues(t);
      bassGain.gain.setValueAtTime(0.28, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    }, 500);
  }

  function setMusicState(state) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const inCombat = state === 'combat';
    combatGain.gain.cancelScheduledValues(t);
    combatGain.gain.linearRampToValueAtTime(inCombat ? 1 : 0, t + 0.8);
    worldGain.gain.cancelScheduledValues(t);
    worldGain.gain.linearRampToValueAtTime(inCombat ? 0.35 : 1, t + 0.8);
  }

  window.SFX = SFX;
  window.Music = { setState: setMusicState };

  // ───────────────────────── Écoute des événements joueur ─────────────────────────
  // On accroche ici les effets liés à `player:*` plutôt que dans player.js,
  // pour ne pas toucher à la logique du joueur : un delta de PV négatif
  // joue un son de dégâts, un delta positif un léger carillon de soin.
  let lastHp = null;
  window.addEventListener('player:hpChanged', (e) => {
    const hp = e.detail && e.detail.hp;
    if (typeof hp !== 'number') return;
    if (lastHp !== null) {
      if (hp < lastHp) SFX.hurt();
      else if (hp > lastHp) SFX.heal();
    }
    lastHp = hp;
  });
  window.addEventListener('player:levelUp', () => SFX.levelUp());

  // Démarre/reprend l'audio au premier clic ou appui clavier.
  const resumeOnce = () => {
    resume();
    window.removeEventListener('click', resumeOnce);
    window.removeEventListener('keydown', resumeOnce);
  };
  window.addEventListener('click', resumeOnce);
  window.addEventListener('keydown', resumeOnce);
})();
