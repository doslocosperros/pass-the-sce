// Tiny synthesized sound effects (no asset files, works offline).
(function (root) {
  let ctx = null, muted = false;
  try { muted = localStorage.getItem('muted') === '1'; } catch {}
  const ensure = () => { if (!ctx) { const A = root.AudioContext || root.webkitAudioContext; if (A) ctx = new A(); } if (ctx && ctx.state === 'suspended') ctx.resume(); return ctx; };
  function tone(f, dur, type = 'sine', at = 0, vol = 0.15, slideTo) {
    const c = ensure(); if (!c || muted) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const FX = {
    deal: () => [0, .08, .16].forEach((d, i) => tone(500 + i * 60, .06, 'triangle', d, .1)),
    swap: () => { tone(420, .09, 'triangle', 0); tone(620, .12, 'triangle', .09); },
    deck: () => { tone(300, .1, 'triangle', 0); tone(500, .12, 'triangle', .1); },
    keep: () => tone(330, .06, 'sine', 0, .08),
    block: () => { tone(150, .25, 'sawtooth', 0, .12); tone(120, .25, 'square', .05, .06); },
    lose: () => { tone(440, .5, 'sawtooth', 0, .1, 110); },
    flip: () => tone(700, .05, 'square', 0, .05),
    turn: () => { tone(880, .1, 'sine', 0, .12); tone(1175, .18, 'sine', .1, .12); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, 'triangle', i * .12, .14)),
  };
  root.Sound = {
    play: (k) => { try { FX[k] && FX[k](); } catch {} },
    unlock: ensure,
    get muted() { return muted; },
    toggle: () => { muted = !muted; try { localStorage.setItem('muted', muted ? '1' : '0'); } catch {} return muted; },
  };
  ['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, () => ensure(), { once: true }));
})(window);
