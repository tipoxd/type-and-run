// Sonidos generados con WebAudio (sin archivos).
let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean) {
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.05, slide = 0) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur);
}

export const sfx = {
  key: () => tone(880 + Math.random() * 120, 0.03, 'triangle', 0.025),
  error: () => tone(110, 0.12, 'square', 0.06),
  hit: () => tone(520, 0.07, 'sawtooth', 0.035, 300),
  kill: () => {
    tone(660, 0.08, 'square', 0.04);
    setTimeout(() => tone(990, 0.1, 'square', 0.035), 60);
  },
  core: () => tone(70, 0.3, 'sawtooth', 0.08, -30),
  coin: () => tone(1320, 0.08, 'triangle', 0.04, 400),
  oc: (up: boolean) => tone(up ? 440 : 300, 0.25, 'sawtooth', 0.05, up ? 600 : -200),
  buy: () => tone(700, 0.08, 'triangle', 0.05, 500),
};
