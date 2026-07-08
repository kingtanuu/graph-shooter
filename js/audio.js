/* グラフシューター — Web Audio 効果音（音源ファイル不要のシンセ）+ BGM 音量管理
 * 音量調整はタイトル・ステージ選択画面のみ。プレイ画面は常に無音（main.js 側で呼び出さない）。
 */
(function () {
  'use strict';

  const GS = (globalThis.GS = globalThis.GS || {});
  const VOLUME_KEY = 'gs-volume';
  const SFX_BASE_GAIN = 0.22;
  const BGM_BASE_GAIN = 0.32;
  const DEFAULT_VOLUME = 0.8;

  let ctx = null;
  let master = null;
  let volume = DEFAULT_VOLUME; // 0..1
  let lastVolume = DEFAULT_VOLUME; // ミュート解除時に戻す値
  try {
    const saved = parseFloat(localStorage.getItem(VOLUME_KEY));
    if (!Number.isNaN(saved)) volume = Math.min(1, Math.max(0, saved));
  } catch (_) { /* プライベートモード等では保存なしで続行 */ }
  if (volume > 0) lastVolume = volume;

  function persistVolume() {
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch (_) { /* 保存失敗は無視 */ }
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume * SFX_BASE_GAIN;
    master.connect(ctx.destination);
    return ctx;
  }

  function applyVolume() {
    if (master) master.gain.value = volume * SFX_BASE_GAIN;
    if (bgmEl && !bgmEl.paused) bgmEl.volume = volume * BGM_BASE_GAIN;
  }

  function tone({ type = 'sine', from = 440, to = from, dur = 0.15, gain = 1, delay = 0 }) {
    if (volume === 0 || !ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, gain) {
    if (volume === 0 || !ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    src.connect(lp).connect(g).connect(master);
    src.start(t0);
  }

  const PENTA = [660, 742, 880, 990, 1188, 1320];

  let bgmEl = null;
  let bgmFade = null;

  function ensureBgm() {
    if (bgmEl) return bgmEl;
    bgmEl = new Audio('audio/bgm-title.mp3');
    bgmEl.loop = true;
    bgmEl.volume = 0; // 初回はフェードインで上げる（play() 成功後に fadeTo する）
    return bgmEl;
  }

  function fadeTo(el, target, ms) {
    clearInterval(bgmFade);
    const start = el.volume;
    const t0 = performance.now();
    bgmFade = setInterval(() => {
      const p = Math.min((performance.now() - t0) / ms, 1);
      el.volume = start + (target - start) * p;
      if (p >= 1) {
        clearInterval(bgmFade);
        if (target === 0) el.pause();
      }
    }, 40);
  }

  GS.sound = {
    fire() { tone({ type: 'sawtooth', from: 220, to: 880, dur: 0.3, gain: 0.5 }); },
    star(combo) {
      const f = PENTA[Math.min(combo, PENTA.length - 1)];
      tone({ type: 'sine', from: f, to: f * 1.01, dur: 0.18, gain: 0.9 });
      tone({ type: 'sine', from: f * 2, to: f * 2, dur: 0.1, gain: 0.25 });
    },
    crash() { noise(0.4, 0.7); tone({ type: 'square', from: 160, to: 40, dur: 0.35, gain: 0.5 }); },
    clear() {
      [523, 659, 784, 1047].forEach((f, i) =>
        tone({ type: 'triangle', from: f, to: f, dur: 0.22, gain: 0.7, delay: i * 0.09 }));
    },
    ui() { tone({ type: 'sine', from: 520, to: 520, dur: 0.06, gain: 0.3 }); },
    get muted() { return volume === 0; },
    getVolume() { return Math.round(volume * 100); },
    setVolume(pct) {
      volume = Math.min(100, Math.max(0, pct)) / 100;
      if (volume > 0) lastVolume = volume;
      persistVolume();
      applyVolume();
      return volume;
    },
    toggleMute() {
      if (volume > 0) GS.sound.setVolume(0);
      else GS.sound.setVolume(Math.round((lastVolume || DEFAULT_VOLUME) * 100));
      return volume === 0;
    },
    bgm: {
      play() {
        if (volume === 0) return;
        const el = ensureBgm();
        el.play().then(() => fadeTo(el, volume * BGM_BASE_GAIN, 700)).catch(() => { /* 初回操作までは自動再生がブロックされる */ });
      },
      pause() {
        if (!bgmEl || bgmEl.paused) return;
        fadeTo(bgmEl, 0, 300);
      },
    },
  };
})();
