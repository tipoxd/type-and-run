// Efectos de "sensación" (game feel): sacudida, desenfoque, chispas, destellos y proyectil.
// Todo se desactiva con la opción "Reducir efectos".

/**
 * Sacudida con "trauma": cada golpe suma trauma (0..1) y baja sola con el tiempo.
 * El desplazamiento es trauma² para que los golpes pequeños apenas se noten y los grandes sí.
 */
export class Shaker {
  private trauma = 0;
  private blur = 0;
  constructor(private el: HTMLElement, private enabled: boolean) {}

  add(amount: number, blur = 0) {
    if (!this.enabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
    this.blur = Math.min(3, this.blur + blur);
  }

  update(dt: number) {
    if (!this.enabled) return;
    if (this.trauma <= 0.001 && this.blur <= 0.01) {
      if (this.el.style.transform) {
        this.el.style.transform = '';
        this.el.style.filter = '';
      }
      return;
    }
    const s = this.trauma * this.trauma;
    const max = 14;
    const x = (Math.random() * 2 - 1) * max * s;
    const y = (Math.random() * 2 - 1) * max * s * 0.6;
    const r = (Math.random() * 2 - 1) * 1.2 * s;
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg)`;
    this.el.style.filter = this.blur > 0.05 ? `blur(${this.blur.toFixed(2)}px)` : '';
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.blur = Math.max(0, this.blur - dt * 12);
  }
}

/** Chispas que salen disparadas desde un punto. */
export function burst(layer: HTMLElement, x: number, y: number, opts: { count?: number; color?: string; chars?: string[]; speed?: number; size?: number } = {}) {
  const { count = 8, color = '#ffd23f', chars = ['✦', '✧', '•'], speed = 90, size = 14 } = opts;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    p.textContent = chars[i % chars.length];
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.color = color;
    p.style.fontSize = `${size * (0.7 + Math.random() * 0.6)}px`;
    layer.append(p);
    const a = Math.random() * Math.PI * 2;
    const d = speed * (0.5 + Math.random());
    p.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 20}px)) scale(0.3)`, opacity: 0 },
      ],
      { duration: 450 + Math.random() * 250, easing: 'cubic-bezier(.2,.8,.3,1)' },
    ).onfinish = () => p.remove();
  }
}

/** Destello de color sobre toda la zona (rojo al fallar, blanco al golpear fuerte). */
export function flash(layer: HTMLElement, color: string, opacity = 0.35, ms = 180) {
  const f = document.createElement('div');
  f.className = 'flash';
  f.style.background = color;
  layer.append(f);
  f.animate([{ opacity }, { opacity: 0 }], { duration: ms, easing: 'ease-out' }).onfinish = () => f.remove();
}

/** Proyectil mágico de la torre al monstruo. Llama a onHit al llegar. */
export function bolt(layer: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, big: boolean, onHit: () => void, enabled: boolean) {
  if (!enabled) {
    onHit();
    return;
  }
  const b = document.createElement('div');
  b.className = `bolt${big ? ' big' : ''}`;
  layer.append(b);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const anim = b.animate(
    [
      { transform: `translate(${from.x}px, ${from.y}px) rotate(${angle}deg) scaleX(0.6)`, opacity: 0.6 },
      { transform: `translate(${to.x}px, ${to.y}px) rotate(${angle}deg) scaleX(1.6)`, opacity: 1 },
    ],
    { duration: 130, easing: 'cubic-bezier(.5,0,.9,.6)' },
  );
  anim.onfinish = () => {
    b.remove();
    onHit();
  };
}

/** Texto grande que aparece en medio (subida de racha, jefe…). */
export function banner(layer: HTMLElement, html: string, cls = '') {
  const el = document.createElement('div');
  el.className = `banner ${cls}`;
  el.innerHTML = html;
  layer.append(el);
  el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%, -60%) scale(1)', opacity: 0 },
    ],
    { duration: 1300, easing: 'ease-out' },
  ).onfinish = () => el.remove();
}
