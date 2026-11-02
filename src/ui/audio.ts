/** Synthesised sound — no audio files needed. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean) { enabled = on; }

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.05, when = 0, slide = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.05, when = 0) {
  const a = ac();
  if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 2400;
  s.buffer = buf;
  g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(a.currentTime + when);
}

export const sfx = {
  roll(n = 5) { for (let i = 0; i < Math.min(n, 8); i++) noise(0.05, 0.08, i * 0.035); },
  select() { tone(660, 0.05, 'square', 0.03); },
  chip(i = 0) { tone(520 + i * 40, 0.06, 'square', 0.035); },
  mult(i = 0) { tone(300 + i * 30, 0.09, 'sawtooth', 0.04, 0, 120); },
  xmult() { tone(220, 0.25, 'sawtooth', 0.05, 0, 440); },
  total() { tone(880, 0.12, 'triangle', 0.06); tone(1320, 0.2, 'triangle', 0.05, 0.08); },
  hit() { noise(0.08, 0.12); tone(140, 0.1, 'square', 0.04, 0, -60); },
  miss() { tone(300, 0.12, 'triangle', 0.03, 0, -150); },
  heal() { tone(523, 0.1, 'sine', 0.05); tone(784, 0.16, 'sine', 0.05, 0.08); },
  coin() { tone(1046, 0.06, 'square', 0.03); tone(1568, 0.1, 'square', 0.03, 0.05); },
  step() { noise(0.04, 0.03); },
  bad() { tone(160, 0.25, 'sawtooth', 0.05, 0, -80); },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.04, i * 0.1)); },
};
