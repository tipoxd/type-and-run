// Capa de efectos con PixiJS (WebGL), detrás de los monstruos.
// Las palabras y la interfaz siguen en HTML para que el texto se vea nítido;
// aquí sólo van: cielo con estrellas en capas, partículas con resplandor (bloom),
// el rayo mágico con estela, ondas expansivas y separación de colores.
import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, ShockwaveFilter } from 'pixi-filters';

interface P {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grav: number;
  drag: number;
  scale: number;
  spin: number;
}

interface Bolt {
  head: Sprite;
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
  dur: number;
  color: number;
  big: boolean;
  onHit: () => void;
}

interface Wave {
  f: ShockwaveFilter;
  t: number;
  max: number;
}

interface Star {
  s: Sprite;
  speed: number;
  phase: number;
  base: number;
}

/** Textura de punto suave (centro brillante que se difumina). */
function softDot(size: number, inner = 0.15): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(inner, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** Textura de estrella de 4 puntas (para chispas). */
function starTex(size: number): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const m = size / 2;
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(m, 0);
  g.quadraticCurveTo(m, m, size, m);
  g.quadraticCurveTo(m, m, m, size);
  g.quadraticCurveTo(m, m, 0, m);
  g.quadraticCurveTo(m, m, m, 0);
  g.fill();
  return Texture.from(c);
}

/** Anillo (para el destello del impacto). */
function ringTex(size: number): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineWidth = size * 0.06;
  g.shadowColor = '#fff';
  g.shadowBlur = size * 0.08;
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
  g.stroke();
  return Texture.from(c);
}

export class FxGL {
  ready = false;
  private app = new Application();
  private sky = new Container();
  private fx = new Container();
  private dot!: Texture;
  private star!: Texture;
  private ring!: Texture;
  private parts: P[] = [];
  private bolts: Bolt[] = [];
  private waves: Wave[] = [];
  private stars: Star[] = [];
  private nebulas: { s: Sprite; vx: number }[] = [];
  private rgb = new RGBSplitFilter({ red: { x: 0, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 0, y: 0 } });
  private chromaAmt = 0;
  private streak = 0;
  private emberAcc = 0;
  private time = 0;
  private destroyed = false;
  /** Escala de la interfaz (1 = 16px de letra base) */
  private get u() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
  }

  constructor(private host: HTMLElement) {}

  async init(): Promise<boolean> {
    try {
      await this.app.init({
        resizeTo: this.host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        preference: 'webgl',
      });
    } catch {
      return false;
    }
    if (this.destroyed) {
      this.app.destroy(true);
      return false;
    }
    const canvas = this.app.canvas;
    canvas.classList.add('gl-layer');
    this.host.prepend(canvas);

    this.dot = softDot(64);
    this.star = starTex(32);
    this.ring = ringTex(128);

    this.app.stage.addChild(this.sky, this.fx);
    this.fx.filters = [new AdvancedBloomFilter({ threshold: 0.25, bloomScale: 1.3, brightness: 1.05, blur: 6, quality: 4 })];
    this.buildSky();
    this.app.ticker.add((t) => this.tick(Math.min(0.05, t.deltaMS / 1000)));
    this.ready = true;
    return true;
  }

  private get w() {
    return this.app.screen.width;
  }
  private get h() {
    return this.app.screen.height;
  }

  // ── Cielo: nebulosas y 3 capas de estrellas a distinta velocidad ──
  private buildSky() {
    const colors = [0x6d4fd8, 0x2f6fd8, 0xc04fd8];
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(this.dot);
      s.anchor.set(0.5);
      s.tint = colors[i % colors.length];
      s.alpha = 0.16;
      s.width = s.height = 380 + Math.random() * 260;
      s.x = Math.random() * this.w;
      s.y = Math.random() * this.h;
      s.blendMode = 'add';
      this.sky.addChild(s);
      this.nebulas.push({ s, vx: -(3 + Math.random() * 4) });
    }
    const layers = [
      { n: 60, size: 2, speed: 5, alpha: 0.35 },
      { n: 35, size: 3, speed: 12, alpha: 0.55 },
      { n: 14, size: 5, speed: 24, alpha: 0.8 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const s = new Sprite(this.dot);
        s.anchor.set(0.5);
        s.width = s.height = L.size * (0.7 + Math.random() * 0.6) * 3;
        s.x = Math.random() * this.w;
        s.y = Math.random() * this.h;
        s.alpha = L.alpha;
        s.blendMode = 'add';
        this.sky.addChild(s);
        this.stars.push({ s, speed: L.speed, phase: Math.random() * 10, base: L.alpha });
      }
    }
  }

  setStreak(level: number) {
    this.streak = level;
  }

  // ── Partículas ──
  sparks(x: number, y: number, o: { count?: number; color?: number; speed?: number; size?: number; life?: number; gravity?: number; star?: boolean } = {}) {
    if (!this.ready) return;
    const u = this.u;
    const { count = 10, color = 0xffd23f, life = 0.6, star = true } = o;
    const speed = (o.speed ?? 160) * u;
    const size = (o.size ?? 10) * u;
    const gravity = (o.gravity ?? 120) * u;
    for (let i = 0; i < count; i++) {
      if (this.parts.length > 900) break;
      const s = new Sprite(star && i % 2 === 0 ? this.star : this.dot);
      s.anchor.set(0.5);
      s.tint = color;
      s.blendMode = 'add';
      s.x = x;
      s.y = y;
      const sc = (size / 32) * (0.6 + Math.random() * 0.8);
      s.scale.set(sc);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.8);
      this.fx.addChild(s);
      this.parts.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, grav: gravity, drag: 2.2, scale: sc, spin: (Math.random() - 0.5) * 8 });
    }
  }

  /** Anillo de luz que crece (impacto). */
  pulse(x: number, y: number, color = 0xffffff, size = 1) {
    if (!this.ready) return;
    const s = new Sprite(this.ring);
    s.anchor.set(0.5);
    s.tint = color;
    s.blendMode = 'add';
    s.x = x;
    s.y = y;
    s.scale.set(0.15 * size * this.u);
    this.fx.addChild(s);
    this.parts.push({ s, vx: 0, vy: 0, life: 0.35, max: 0.35, grav: 0, drag: 0, scale: -1.2 * size * this.u, spin: 0 });
  }

  // ── Rayo mágico con estela ──
  bolt(from: { x: number; y: number }, to: { x: number; y: number }, big: boolean, onHit: () => void) {
    if (!this.ready) {
      onHit();
      return;
    }
    const head = new Sprite(this.dot);
    head.anchor.set(0.5);
    head.tint = big ? 0xe27bff : 0xb9a8ff;
    head.blendMode = 'add';
    head.scale.set((big ? 1.1 : 0.75) * this.u);
    this.fx.addChild(head);
    this.bolts.push({ head, from, to, t: 0, dur: 0.14, color: big ? 0xe27bff : 0x9d8bff, big, onHit });
  }

  /** Onda expansiva que deforma el fondo. strength 0..1 */
  shockwave(x: number, y: number, strength = 0.5) {
    if (!this.ready || this.waves.length >= 3) return;
    const f = new ShockwaveFilter({
      center: { x, y },
      amplitude: (10 + 30 * strength) * this.u,
      wavelength: (90 + 80 * strength) * this.u,
      speed: (520 + 300 * strength) * this.u,
      brightness: 1.15,
      radius: (180 + 380 * strength) * this.u,
      time: 0,
    });
    this.waves.push({ f, t: 0, max: 0.7 });
    this.syncFilters();
  }

  /** Separación de colores (al recibir daño). */
  chroma(amount: number) {
    this.chromaAmt = Math.max(this.chromaAmt, amount);
    this.syncFilters();
  }

  private syncFilters() {
    const list = this.waves.map((w) => w.f) as unknown as import('pixi.js').Filter[];
    if (this.chromaAmt > 0.05) list.push(this.rgb);
    this.app.stage.filters = list.length ? list : null;
    this.app.stage.filterArea = new Rectangle(0, 0, this.w, this.h);
  }

  // ── Bucle ──
  private tick(dt: number) {
    this.time += dt;
    const w = this.w;
    const h = this.h;

    for (const st of this.stars) {
      st.s.x -= st.speed * dt * (1 + this.streak * 0.6);
      if (st.s.x < -10) {
        st.s.x = w + 10;
        st.s.y = Math.random() * h;
      }
      st.s.alpha = st.base * (0.7 + 0.3 * Math.sin(this.time * 2 + st.phase));
    }
    for (const n of this.nebulas) {
      n.s.x += n.vx * dt;
      if (n.s.x < -300) n.s.x = w + 300;
    }

    // Brasas que suben con la racha 🔥
    if (this.streak > 0) {
      this.emberAcc += dt * this.streak * 7;
      while (this.emberAcc >= 1) {
        this.emberAcc--;
        const s = new Sprite(this.dot);
        s.anchor.set(0.5);
        s.tint = this.streak >= 4 ? 0xe27bff : this.streak >= 3 ? 0xff6a3d : 0xff9248;
        s.blendMode = 'add';
        s.x = Math.random() * w;
        s.y = h + 6;
        const sc = 0.12 + Math.random() * 0.18;
        s.scale.set(sc);
        this.fx.addChild(s);
        this.parts.push({ s, vx: (Math.random() - 0.5) * 20, vy: -(40 + Math.random() * 60), life: 2.5, max: 2.5, grav: -10, drag: 0.2, scale: sc, spin: 0 });
      }
    }

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.destroy();
        this.parts.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      if (p.scale < 0) {
        // anillo que crece
        p.s.scale.set(p.s.scale.x + -p.scale * dt * 4);
        p.s.alpha = k;
        continue;
      }
      p.vx *= 1 - p.drag * dt;
      p.vy = p.vy * (1 - p.drag * dt) + p.grav * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      p.s.alpha = Math.min(1, k * 1.5);
      p.s.scale.set(p.scale * (0.4 + 0.6 * k));
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      const e = k * k; // acelera al final
      const x = b.from.x + (b.to.x - b.from.x) * e;
      const y = b.from.y + (b.to.y - b.from.y) * e + Math.sin(k * Math.PI) * -18;
      b.head.x = x;
      b.head.y = y;
      this.sparks(x, y, { count: b.big ? 3 : 2, color: b.color, speed: 25, size: b.big ? 14 : 10, life: 0.3, gravity: 0, star: false });
      if (k >= 1) {
        b.head.destroy();
        this.bolts.splice(i, 1);
        b.onHit();
      }
    }

    if (this.waves.length) {
      for (let i = this.waves.length - 1; i >= 0; i--) {
        const wv = this.waves[i];
        wv.t += dt;
        wv.f.time = wv.t;
        if (wv.t >= wv.max) this.waves.splice(i, 1);
      }
      this.syncFilters();
    }

    if (this.chromaAmt > 0) {
      const a = this.chromaAmt;
      this.rgb.red = { x: -6 * a, y: 0 };
      this.rgb.blue = { x: 6 * a, y: 2 * a };
      this.chromaAmt = Math.max(0, this.chromaAmt - dt * 3);
      if (this.chromaAmt <= 0.05) {
        this.chromaAmt = 0;
        this.syncFilters();
      }
    }
  }

  destroy() {
    this.destroyed = true;
    if (!this.ready) return;
    this.ready = false;
    this.app.canvas.remove();
    this.app.destroy(true, { children: true });
  }
}
