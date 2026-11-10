// Demo animada para la pantalla principal: enseña cómo se juega sin leer nada.
// Un monstruo se acerca, las letras se escriben solas, sale el hechizo y explota.
import { h } from './dom';
import { createTower } from './tower';

const WORDS = [
  { word: 'dragon', monster: '🐉', dmg: 120 },
  { word: 'magia', monster: '👻', dmg: 88 },
  { word: 'castillo', monster: '🧟', dmg: 190 },
  { word: 'hada', monster: '🦇', dmg: 54 },
];

const STEPS = [
  { icon: '👀', text: 'Llega un monstruo con una palabra' },
  { icon: '⌨️', text: 'Escríbela letra a letra' },
  { icon: '✨', text: '¡Hechizo! Más letras = más daño' },
];

export function createDemo(reduceFx: boolean) {
  const tower = createTower();
  const monster = h('div', { class: 'monster' });
  const word = h('div', { class: 'word' });
  const hpFill = h('i', { class: 'fill' });
  const enemy = h('div', { class: 'demo-enemy' }, monster, word, h('div', { class: 'hp' }, h('i', { class: 'lag' }), hpFill));
  const path = h('div', { class: 'path demo-path hot' });
  const fx = h('div', { class: 'demo-fx' });
  const stage = h('div', { class: 'demo-stage' }, path, tower.el, enemy, fx);
  const keys = h('div', { class: 'cast-word demo-keys' });
  const steps = STEPS.map((s, i) => h('div', { class: 'demo-step' }, h('span', { class: 'demo-num' }, String(i + 1)), h('span', null, `${s.icon} ${s.text}`)));
  const el = h('div', { class: 'demo' }, h('div', { class: 'demo-label' }, '▶ Así se juega'), stage, keys, h('div', { class: 'demo-steps' }, ...steps));

  let timers: number[] = [];
  let alive = true;
  let n = 0;
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && fn(), reduceFx ? ms * 0.6 : ms));
  const step = (i: number) => steps.forEach((s, k) => s.classList.toggle('on', k === i));

  function play() {
    const w = WORDS[n++ % WORDS.length];
    // Preparar
    monster.textContent = w.monster;
    word.replaceChildren(...[...w.word].map((c, i) => h('span', { class: i === 0 ? 'first' : '' }, c)));
    const caps = [...w.word].map((c) => h('span', { class: 'lt rest' }, h('b', null, c)));
    keys.replaceChildren(...caps);
    hpFill.style.width = '100%';
    (hpFill.previousSibling as HTMLElement).style.width = '100%';
    enemy.className = 'demo-enemy walking';
    enemy.style.left = '100%';
    step(0);
    // Entra caminando
    requestAnimationFrame(() => requestAnimationFrame(() => (enemy.style.left = '56%')));
    // Escribir letra a letra
    const start = 1100;
    const per = 170;
    [...w.word].forEach((_, i) => {
      later(start + i * per, () => {
        if (i === 0) step(1);
        word.children[i]?.classList.add('ok');
        word.children[0]?.classList.remove('first');
        caps.forEach((k, j) => (k.className = `lt ${j < i + 1 ? 'ok' : j === i + 1 ? 'cur' : 'rest'}`));
        caps[i].classList.add('press');
        enemy.classList.add('target');
      });
    });
    // Hechizo
    const castAt = start + w.word.length * per + 150;
    later(castAt, () => {
      step(2);
      enemy.style.left = getComputedStyle(enemy).left; // se queda quieto
      const s = stage.getBoundingClientRect();
      const o = tower.orbPoint(stage);
      const e = enemy.getBoundingClientRect();
      const to = { x: e.left - s.left + e.width / 2, y: e.top - s.top + e.height / 2 };
      tower.cast();
      const bolt = h('div', { class: 'bolt' });
      fx.append(bolt);
      const ang = (Math.atan2(to.y - o.y, to.x - o.x) * 180) / Math.PI;
      bolt.animate(
        [
          { transform: `translate(${o.x}px, ${o.y}px) rotate(${ang}deg) scaleX(.6)` },
          { transform: `translate(${to.x}px, ${to.y}px) rotate(${ang}deg) scaleX(1.5)` },
        ],
        { duration: 200, easing: 'cubic-bezier(.5,0,.9,.6)' },
      ).onfinish = () => {
        bolt.remove();
        // Impacto
        enemy.classList.add('boom');
        hpFill.style.width = '0%';
        (hpFill.previousSibling as HTMLElement).style.width = '0%';
        const dmg = h('div', { class: 'demo-dmg' }, `-${w.dmg}`);
        dmg.style.left = `${to.x}px`;
        dmg.style.top = `${to.y}px`;
        fx.append(dmg);
        for (let i = 0; i < 12; i++) {
          const p = h('span', { class: 'demo-spark' }, i % 2 ? '✦' : '✧');
          p.style.left = `${to.x}px`;
          p.style.top = `${to.y}px`;
          fx.append(p);
          const a = (i / 12) * Math.PI * 2;
          p.animate(
            [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * 60}px), calc(-50% + ${Math.sin(a) * 60}px)) scale(.3)`, opacity: 0 }],
            { duration: 600, easing: 'cubic-bezier(.2,.8,.3,1)' },
          ).onfinish = () => p.remove();
        }
        setTimeout(() => dmg.remove(), 1000);
      };
    });
    later(castAt + 1900, play);
  }

  // Empieza cuando ya está en pantalla (para medir bien posiciones)
  requestAnimationFrame(() => later(300, play));

  return {
    el,
    destroy() {
      alive = false;
      timers.forEach(clearTimeout);
      timers = [];
    },
  };
}
