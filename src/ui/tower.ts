// Torre del mago dibujada en SVG: orbe que flota, ventanas encendidas,
// círculo de runas en la base, grietas según la vida y un escudo mágico delante.
import { h } from './dom';

const SVG = `
<svg viewBox="0 0 100 230" class="tower-svg" aria-hidden="true">
  <defs>
    <linearGradient id="tw-stone" x1="0" x2="1">
      <stop offset="0" stop-color="#2a2152"/><stop offset=".45" stop-color="#4a3c86"/><stop offset="1" stop-color="#231b45"/>
    </linearGradient>
    <linearGradient id="tw-roof" x1="0" x2="1">
      <stop offset="0" stop-color="#3b1f78"/><stop offset=".5" stop-color="#6d3fd0"/><stop offset="1" stop-color="#2e1866"/>
    </linearGradient>
    <radialGradient id="tw-win"><stop offset="0" stop-color="#fff3b0"/><stop offset=".6" stop-color="#ffb43d"/><stop offset="1" stop-color="#b85c00"/></radialGradient>
    <pattern id="tw-bricks" width="16" height="10" patternUnits="userSpaceOnUse">
      <path d="M0 10H16M8 0V5M0 5H16M0 0V5" stroke="#1a1338" stroke-width=".8" fill="none" opacity=".55"/>
    </pattern>
  </defs>
  <!-- círculo de runas -->
  <g class="tw-runes">
    <ellipse cx="50" cy="214" rx="44" ry="9" fill="none" stroke="#9d7bff" stroke-width="1.2" stroke-dasharray="3 5" opacity=".8"/>
    <ellipse cx="50" cy="214" rx="34" ry="6" fill="none" stroke="#4cc9ff" stroke-width=".8" stroke-dasharray="1 4" opacity=".7"/>
  </g>
  <ellipse cx="50" cy="214" rx="40" ry="7" fill="#9d7bff" opacity=".18"/>
  <!-- cuerpo -->
  <path d="M24 212 L30 92 H70 L76 212 Z" fill="url(#tw-stone)"/>
  <path d="M24 212 L30 92 H70 L76 212 Z" fill="url(#tw-bricks)"/>
  <!-- almenas -->
  <path d="M26 92 V78 H33 V84 H40 V78 H47 V84 H53 V78 H60 V84 H67 V78 H74 V92 Z" fill="#3d3174"/>
  <!-- tejado -->
  <path d="M28 80 L50 34 L72 80 Z" fill="url(#tw-roof)"/>
  <path d="M50 34 L50 80" stroke="#ffffff22" stroke-width="1"/>
  <!-- bandera -->
  <path d="M50 34 V18" stroke="#c9b8ff" stroke-width="1.4"/>
  <path class="tw-flag" d="M50 18 Q60 20 66 18 Q60 23 66 27 Q58 25 50 27 Z" fill="#ff6fa8"/>
  <!-- ventanas -->
  <path class="tw-win" d="M44 128 v-8 a6 6 0 0 1 12 0 v8 Z" fill="url(#tw-win)"/>
  <path class="tw-win w2" d="M36 165 v-6 a5 5 0 0 1 10 0 v6 Z" fill="url(#tw-win)"/>
  <path class="tw-win w3" d="M54 165 v-6 a5 5 0 0 1 10 0 v6 Z" fill="url(#tw-win)"/>
  <!-- puerta -->
  <path d="M41 212 v-16 a9 9 0 0 1 18 0 v16 Z" fill="#140e2c" stroke="#ffd23f" stroke-width="1.2"/>
  <!-- grietas (aparecen al perder vida) -->
  <g class="tw-cracks" stroke="#0b0720" stroke-width="1.6" fill="none" stroke-linecap="round">
    <path class="c1" d="M62 100 l-5 9 l4 6 l-6 10"/>
    <path class="c2" d="M33 140 l6 7 l-3 8 l7 9"/>
    <path class="c3" d="M66 178 l-7 5 l2 9 l-6 6 M30 110 l5 4"/>
  </g>
</svg>`;

export interface TowerUI {
  el: HTMLElement;
  /** Centro del orbe, relativo a la arena (de donde sale el rayo) */
  orbPoint(arena: HTMLElement): { x: number; y: number };
  setLife(pct: number): void;
  setStreak(level: number): void;
  cast(): void;
  hit(): void;
}

export function createTower(): TowerUI {
  const orb = h('div', { class: 'orb' }, h('div', { class: 'orb-core' }), h('div', { class: 'orb-ring' }));
  const art = h('div', { class: 'tower-art', html: SVG });
  art.append(orb);
  const ward = h('div', { class: 'ward' });
  const label = h('div', { class: 'tower-label' }, 'Tu torre');
  const el = h('div', { class: 'tower', 'data-hp': 'high', 'data-streak': '0' }, art, ward, label);

  const retrigger = (node: Element, cls: string) => {
    node.classList.remove(cls);
    void (node as HTMLElement).offsetWidth;
    node.classList.add(cls);
  };

  return {
    el,
    orbPoint(arena) {
      const a = arena.getBoundingClientRect();
      const r = orb.getBoundingClientRect();
      return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
    },
    setLife(pct) {
      el.dataset.hp = pct > 70 ? 'high' : pct > 40 ? 'mid' : pct > 15 ? 'low' : 'crit';
    },
    setStreak(level) {
      el.dataset.streak = String(level);
    },
    cast() {
      retrigger(orb, 'casting');
    },
    hit() {
      retrigger(el, 'hit');
      retrigger(ward, 'flare');
    },
  };
}
