// Pantalla de combate: dibuja la oleada, le pasa las teclas y pone los efectos.
import { ROWS, Sector, type Enemy } from '../core/combat';
import { BOSSES } from '../core/content';
import { FORMATS } from '../core/formats';
import { FINAL_NODE, MAX_DAEMONS, SECTOR_NAMES } from '../core/run';
import { OC_MULT, OC_STEPS, type ScoreResult } from '../core/scoring';
import type { RunState } from '../core/state';
import type { Options } from '../meta/save';
import { sfx } from './audio';
import { daemonChip } from './cards';
import { dec, h, num } from './dom';
import { banner, bolt, burst, flash, Shaker } from './juice';
import type { Coach } from './tips';
import type { FxGL } from './fxgl';
import { createTower } from './tower';

export interface CombatHandle {
  destroy(): void;
}

const MONSTERS = ['👻', '🦇', '🐺', '💀', '🕷️', '🐍', '👺', '🧟', '🦂', '🐗'];
const MONSTER_NAMES: Record<string, string> = {
  '👻': 'Fantasma', '🦇': 'Murciélago', '🐺': 'Lobo', '💀': 'Calavera', '🕷️': 'Araña',
  '🐍': 'Serpiente', '👺': 'Ogro', '🧟': 'Zombi', '🦂': 'Escorpión', '🐗': 'Jabalí',
};

export function startCombat(
  root: HTMLElement,
  run: RunState,
  opts: Options,
  coachBox: HTMLElement,
  coach: Coach,
  onEnd: (failed: boolean) => void,
  onQuit: () => void,
): CombatHandle {
  const sector = new Sector(run);
  const boss = sector.rules.boss ? BOSSES[sector.rules.boss] : null;
  const showLuck = run.daemons.some((d) => d.id === 'grep');
  const fx = !opts.reduceFx;
  let paused = false;
  let ended = false;
  let raf = 0;
  let last = performance.now();
  let defeated = 0;
  let hitStop = 0;
  /** Escala de la interfaz: 1 = 16px de letra base (crece en pantallas grandes) */
  const unit = () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
  let u = unit();
  const onResize = () => (u = unit());
  const enemyEls = new Map<number, HTMLDivElement>();
  const enemyPos = new Map<number, { x: number; y: number }>();
  const prevTyped = new Map<number, number>();

  // ── Barra superior: progreso · vida · oro · racha ──
  const meter = (cls: string) => {
    const lag = h('i', { class: 'lag' });
    const fill = h('i', { class: 'fill' });
    return { el: h('div', { class: `meter ${cls}` }, lag, fill), lag, fill };
  };
  const waveTitle = h('div', { class: 'hud-title' });
  const waveMeter = meter('wave');
  const waveSub = h('div', { class: 'hud-sub' });
  const lifeMeter = meter('life');
  const lifeSub = h('div', { class: 'hud-sub' });
  const goldNum = h('div', { class: 'hud-num c-bits' }, String(run.bits));
  const streakTitle = h('div', { class: 'hud-title' });
  const streakMeter = meter('streak');
  const streakSub = h('div', { class: 'hud-sub' });
  const hudGold = h('div', { class: 'hud-group small-group' }, h('div', { class: 'hud-title' }, '🪙 Oro'), goldNum);
  const hudStreak = h('div', { class: 'hud-group' }, streakTitle, streakMeter.el, streakSub);
  const hud = h('header', { class: 'hud' },
    h('div', { class: 'hud-group' }, waveTitle, waveMeter.el, waveSub),
    h('div', { class: 'hud-group' }, h('div', { class: 'hud-title' }, '❤️ Vida de la torre'), lifeMeter.el, lifeSub),
    hudGold,
    hudStreak,
  );
  let shownGold = run.bits;
  let goldAnim = 0;
  let lastStreakKey = '';

  const amulets = h('div', { class: 'amulet-row' });
  const bossBanner = boss
    ? h('div', { class: 'boss-banner' }, h('span', { class: 'boss-icon' }, boss.icon), h('div', null, h('b', null, `Jefe: ${boss.name}`), h('div', null, boss.desc)))
    : null;
  const towerUI = createTower();
  const tower = towerUI.el;
  const fxLayer = h('div', { class: 'fx-layer' });
  const dangerZone = h('div', { class: 'danger-zone' });
  const arena = h('div', { class: 'arena' }, dangerZone);
  // Caminos por donde llegan los monstruos, con un portal al fondo
  const paths = Array.from({ length: ROWS }, (_, i) => {
    const portal = h('div', { class: 'portal' }, h('i'));
    const path = h('div', { class: 'path', style: { animationDelay: `${-i * 1.3}s` } }, portal);
    arena.append(path);
    return { path, portal };
  });
  arena.append(tower, h('div', { class: 'fog' }), fxLayer);
  const stage = h('div', { class: 'stage' }, arena, coachBox);
  const shaker = new Shaker(arena, fx);
  const screenShaker = new Shaker(stage, fx);

  // Capa WebGL (PixiJS): se carga aparte; si falla, se usan los efectos HTML.
  let gl: FxGL | null = null;
  let destroyed = false;
  if (fx) {
    import('./fxgl')
      .then(async (m) => {
        const g = new m.FxGL(arena);
        if ((await g.init()) && !destroyed) {
          gl = g;
          arena.classList.add('gl');
          g.setStreak(run.ocLevel);
        } else g.destroy();
      })
      .catch(() => null);
  }

  // Línea del hechizo: Poder × Magia = daño
  const sPower = h('b', null, '0');
  const sMagic = h('b', null, '0');
  const sX = h('b', null, '');
  const sDmg = h('b', null, '0');
  const xBox = h('div', { class: 'formula-box x hidden' }, sX, h('small', null, 'multiplica'));
  const spellWord = h('div', { class: 'spell-word' }, 'Aún no has lanzado ningún hechizo');
  const spellbar = h(
    'div',
    { class: 'spellbar' },
    spellWord,
    h('div', { class: 'formula' },
      h('div', { class: 'formula-box power' }, sPower, h('small', null, 'Poder')),
      h('span', { class: 'op' }, '×'),
      h('div', { class: 'formula-box magic' }, sMagic, h('small', null, 'Magia')),
      xBox,
      h('span', { class: 'op' }, '='),
      h('div', { class: 'formula-box dmg' }, sDmg, h('small', null, 'daño')),
    ),
  );

  // ── Zona de escritura ──
  const castTarget = h('div', { class: 'cast-target' });
  const castLetters = h('div', { class: 'cast-letters' });
  const castHelp = h('div', { class: 'cast-help' });
  const pauseBtn = h('button', { class: 'btn small ghost', onclick: () => togglePause() }, '⏸ Pausa');
  const cast = h('div', { class: 'cast' }, castTarget, castLetters, h('div', { class: 'cast-side' }, castHelp, pauseBtn));

  const overlay = h('div', { class: 'overlay hidden' });
  const screen = h('div', { class: `screen combat${boss ? ' is-boss' : ''}` }, hud, bossBanner, amulets, stage, cast, spellbar, overlay);
  root.replaceChildren(screen);

  renderAmulets();
  renderHud();
  coach(boss ? 'boss' : 'start');
  if (boss) setTimeout(() => banner(fxLayer, `${boss.icon} <b>${boss.name}</b><small>${boss.desc}</small>`, 'boss'), 200);
  else setTimeout(() => banner(fxLayer, `<b>${SECTOR_NAMES[run.sector]}</b><small>Reino ${run.node}</small>`), 200);

  function renderAmulets() {
    amulets.replaceChildren(
      h('span', { class: 'amulet-label' }, 'Amuletos'),
      ...run.daemons.map((d) => daemonChip(d.id, d)),
      ...Array.from({ length: Math.max(0, MAX_DAEMONS - run.daemons.length) }, () => h('div', { class: 'chip-amulet empty' }, '＋')),
      ...(showLuck ? [h('span', { class: 'luck' }, '🍀 Letra de la suerte: ', h('b', null, run.letterOfDay.toUpperCase()))] : []),
    );
  }

  function renderHud() {
    const total = sector.total;
    waveTitle.textContent = `Reino ${run.node}${run.infinite ? '' : ` de ${FINAL_NODE}`} · ${SECTOR_NAMES[run.sector]}`;
    const wp = `${(defeated / total) * 100}%`;
    waveMeter.fill.style.width = wp;
    waveMeter.lag.style.width = wp;
    waveSub.textContent = `${defeated} de ${total} monstruos · ${num(sector.hp)} de vida cada uno`;

    const pct = Math.max(0, run.integrity / run.maxIntegrity) * 100;
    lifeMeter.fill.style.width = `${pct}%`;
    lifeMeter.lag.style.width = `${pct}%`;
    lifeMeter.fill.classList.toggle('low', pct < 30);
    lifeSub.textContent = `${Math.max(0, run.integrity)} de ${run.maxIntegrity}`;
    towerUI.setLife(pct);

    // Oro: el número cuenta hasta el nuevo valor
    if (run.bits !== shownGold) {
      const from = shownGold;
      const to = run.bits;
      shownGold = to;
      const start = performance.now();
      cancelAnimationFrame(goldAnim);
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / 400);
        goldNum.textContent = String(Math.round(from + (to - from) * k));
        if (k < 1) goldAnim = requestAnimationFrame(step);
      };
      goldAnim = requestAnimationFrame(step);
      retrigger(hudGold, 'bump');
    }

    const lvl = run.ocLevel;
    const next = OC_STEPS[lvl + 1];
    const from = OC_STEPS[lvl];
    const sp = next ? `${((run.ocStreak - from) / (next - from)) * 100}%` : '100%';
    streakMeter.fill.style.width = sp;
    streakMeter.lag.style.width = sp;
    const key = String(lvl);
    if (key !== lastStreakKey) {
      lastStreakKey = key;
      streakTitle.replaceChildren(lvl ? h('span', null, 'Racha ', h('span', { class: 'flames' }, '🔥'.repeat(lvl)), h('b', { class: 'c-xmult' }, `  ×${dec(OC_MULT[lvl])} daño`)) : h('span', null, 'Racha: ', h('span', { class: 'muted' }, 'sin encender')));
      hudStreak.dataset.lvl = key;
    }
    streakSub.textContent = next ? `${next - run.ocStreak} palabras perfectas para subir` : '¡Racha al máximo!';
    arena.dataset.streak = fx ? String(lvl) : '0';
    towerUI.setStreak(fx ? lvl : 0);
    gl?.setStreak(lvl);
  }


  // ── Monstruos ──
  function monsterOf(e: Enemy) {
    return boss && e.id % 5 === 0 ? boss.icon : MONSTERS[e.id % MONSTERS.length];
  }

  function enemyEl(e: Enemy) {
    let el = enemyEls.get(e.id);
    if (!el) {
      el = h(
        'div',
        { class: 'enemy spawn' },
        h('div', { class: 'monster', style: { animationDelay: `${-(e.id % 7) * 0.37}s` } }, monsterOf(e)),
        h('div', { class: 'word' }),
        h('div', { class: 'hp' }, h('i', { class: 'lag' }), h('i', { class: 'fill' })),
      );
      arena.insertBefore(el, fxLayer);
      enemyEls.set(e.id, el);
      const made = el;
      setTimeout(() => made.classList.remove('spawn'), 400);
    }
    return el;
  }

  function drawWord(e: Enemy, el: HTMLDivElement, hasTarget: boolean) {
    const key = `${e.word}|${e.typed}|${e.bad}|${hasTarget}`;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    const before = prevTyped.get(e.id) ?? 0;
    prevTyped.set(e.id, e.typed);
    const letters = [...e.word].map((c, i) => {
      let cls = '';
      if (i < e.typed) cls = i === e.typed - 1 && e.typed > before ? 'ok just' : 'ok';
      else if (i === e.typed && e.bad) cls = 'badnext';
      else if (i === 0 && !hasTarget) cls = 'first';
      return h('span', { class: cls }, c);
    });
    if (sector.rules.reversed) letters.reverse();
    (el.children[1] as HTMLElement).replaceChildren(...letters);
  }

  /** Altura (px) del centro de cada camino */
  function rowY(row: number, hgt: number) {
    return 44 * u + ((row + 0.5) / ROWS) * (hgt - 64 * u);
  }

  // Caminos: el del monstruo apuntado brilla; se ponen rojos si hay peligro
  function drawPaths(hgt: number) {
    const alive = sector.alive();
    const target = sector.target;
    let danger = false;
    paths.forEach((p, i) => {
      p.path.style.top = `${rowY(i, hgt)}px`;
      p.path.style.left = `${tower.offsetWidth - 6 * u}px`;
      const inRow = alive.filter((e) => e.row === i);
      const warn = inRow.some((e) => e.progress > 0.7);
      if (warn) danger = true;
      p.path.classList.toggle('hot', !!target && target.row === i);
      p.path.classList.toggle('warn', warn);
      p.path.classList.toggle('busy', inRow.length > 0);
    });
    dangerZone.style.left = `${tower.offsetWidth}px`;
    dangerZone.classList.toggle('on', danger);
  }

  function draw() {
    const w = arena.clientWidth;
    const hgt = arena.clientHeight;
    const target = sector.targetId;
    for (const e of sector.alive()) {
      const el = enemyEl(e);
      drawWord(e, el, target !== null);
      // El monstruo entra por la derecha sin salirse, sea cual sea el largo de la palabra
      const elW = el.offsetWidth || 150 * u;
      const left = tower.offsetWidth + 10 * u;
      const x = left + (1 - Math.min(1, e.progress)) * Math.max(100 * u, w - left - elW - 40 * u);
      const y = rowY(e.row, hgt);
      enemyPos.set(e.id, { x: x + elW / 2, y });
      el.style.transform = `translate(${x}px, ${y}px) translate(0, -50%)`;
      el.classList.toggle('target', e.id === target);
      el.classList.toggle('dim', target !== null && e.id !== target);
      el.classList.toggle('danger', e.progress > 0.75);
      const hpPct = `${(Math.max(0, e.hp) / e.maxHp) * 100}%`;
      const bar = el.children[2] as HTMLElement;
      (bar.children[0] as HTMLElement).style.width = hpPct;
      (bar.children[1] as HTMLElement).style.width = hpPct;
    }
    drawPaths(hgt);
    drawCast();
  }

  // ── Zona de escritura: qué escribir y cómo vas ──
  let castKey = '';
  let castTyped = 0;
  let castWordId = -1;
  let castWordText = '';
  let castKeys: HTMLElement[] = [];
  let castWord: HTMLElement = h('div');
  let castBad: HTMLElement = h('span');
  let castProgress: HTMLElement = h('div');
  let castHpLag: HTMLElement = h('i');
  let castHpFill: HTMLElement = h('i');
  function drawCast() {
    const t = sector.target;
    const alive = sector.alive().sort((a, b) => b.progress - a.progress);
    const key = t ? `t${t.id}|${t.word}|${t.typed}|${t.badText}` : `n|${alive.map((e) => `${e.id}${e.word}${e.progress > 0.6 ? '!' : ''}`).join(',')}`;
    if (key === castKey) return;
    castKey = key;
    cast.classList.toggle('active', !!t);
    cast.classList.toggle('error', !!t?.bad);

    if (!t) {
      castTyped = 0;
      castWordId = -1;
      castTarget.replaceChildren(h('div', { class: 'cast-emoji idle' }, '🪄'));
      castLetters.replaceChildren(
        h('div', { class: 'cast-prompt' }, alive.length ? 'Escribe la primera letra de un monstruo:' : 'Espera, ¡vienen monstruos!'),
        h('div', { class: 'cast-choices' },
          ...alive.slice(0, 5).map((e, i) =>
            h('div', { class: `choice${i === 0 && e.progress > 0.6 ? ' urgent' : ''}` },
              h('kbd', null, e.word[0].toUpperCase()),
              h('span', null, sector.rules.reversed ? '¿?' : e.word),
              i === 0 && e.progress > 0.6 ? h('em', null, '¡cerca!') : null,
            ),
          ),
        ),
      );
      castHelp.replaceChildren(h('span', null, h('kbd', null, 'Tab'), ' pausa'));
      return;
    }

    const hide = sector.rules.reversed;
    const sameWord = castWordId === t.id && castWordText === t.word;
    if (!sameWord) {
      // Palabra nueva: se construyen las teclas una vez
      castWordId = t.id;
      castWordText = t.word;
      castTyped = 0;
      const emoji = monsterOf(t);
      castHpLag = h('i', { class: 'lag' });
      castHpFill = h('i', { class: 'fill' });
      castTarget.replaceChildren(
        h('div', { class: 'cast-emoji' }, emoji),
        h('div', { class: 'cast-info' },
          h('small', null, 'Apuntando a'),
          h('b', null, MONSTER_NAMES[emoji] ?? 'Monstruo'),
          h('div', { class: 'cast-hp' }, castHpLag, castHpFill),
        ),
      );
      castKeys = [...t.word].map((c, i) => h('span', { class: 'lt rest', style: { animationDelay: `${i * 25}ms` } }, h('b', null, hide ? '?' : c)));
      castBad = h('span', { class: 'bad-group' });
      castWord = h('div', { class: 'cast-word enter' }, ...castKeys);
      castProgress = h('div', { class: 'cast-progress' });
      castLetters.replaceChildren(castWord, castProgress);
      const cw = castWord;
      setTimeout(() => cw.classList.remove('enter'), 450);
      castHelp.replaceChildren(
        sector.rules.noBackspace ? h('span', { class: 'err' }, 'Sin borrar') : h('span', null, h('kbd', null, '⌫'), ' borrar'),
        h('span', null, h('kbd', null, 'Esc'), ' cambiar'),
      );
    }
    // Sólo se cambian clases: las teclas se hunden y cambian de color con transición
    const hpPct = `${(Math.max(0, t.hp) / t.maxHp) * 100}%`;
    castHpLag.style.width = hpPct;
    castHpFill.style.width = hpPct;
    castKeys.forEach((k, i) => {
      const state = i < t.typed ? 'ok' : i === t.typed ? (t.bad ? 'cur blocked' : 'cur') : 'rest';
      const cls = `lt ${state}`;
      if (k.className.replace(' press', '') !== cls) k.className = cls;
      if (hide && i < t.typed) (k.firstChild as HTMLElement).textContent = t.word[i];
      if (i === t.typed - 1 && t.typed > castTyped) retrigger(k, 'press');
    });
    // Letras equivocadas: aparecen justo antes de la tecla que toca
    castBad.replaceChildren(...[...t.badText].map((b) => h('span', { class: 'lt bad' }, h('b', null, b))));
    const cur = castKeys[t.typed];
    if (t.bad && cur) castWord.insertBefore(castBad, cur);
    else castBad.remove();
    castTyped = t.typed;
    castProgress.replaceChildren(
      t.bad
        ? h('span', { class: 'err' }, sector.rules.noBackspace ? '¡Error! Empieza la palabra otra vez' : `¡Error! Pulsa ⌫ para borrar ${t.bad === 1 ? 'la letra roja' : 'las letras rojas'}`)
        : h('span', null, h('span', { class: 'dots' }, ...castKeys.map((_, i) => h('i', { class: i < t.typed ? 'on' : '' }))), ` ${t.typed} de ${t.word.length}`),
    );
  }

  // ── Animación del hechizo ──
  let scoreTimer = 0;
  function showScore(word: string, r: ScoreResult) {
    clearInterval(scoreTimer);
    spellWord.replaceChildren(
      h('b', null, word),
      ` · palabra ${FORMATS[r.format].name.toLowerCase()}`,
      ...(r.pure ? [h('span', { class: 'perfect' }, ' · ✨ perfecta')] : []),
    );
    sDmg.textContent = '…';
    let b = 0;
    let m = 0;
    let x = 1;
    let i = 0;
    xBox.classList.add('hidden');
    const step = () => {
      const s = r.steps[i++];
      if (!s) {
        clearInterval(scoreTimer);
        sDmg.textContent = num(r.damage);
        const box = sDmg.parentElement!;
        box.classList.remove('pop');
        void box.offsetWidth;
        box.classList.add('pop');
        return;
      }
      if (s.kind === 'bytes') b += s.value;
      else if (s.kind === 'mult') m += s.value;
      else x *= s.value;
      sPower.textContent = num(b);
      sMagic.textContent = num(m);
      if (x !== 1) {
        xBox.classList.remove('hidden');
        sX.textContent = `×${dec(x)}`;
      }
      if (s.uid) flashAmulet(s.uid, s.kind === 'xmult' ? `×${dec(s.value)}` : `+${num(s.value)}`, s.kind);
    };
    step();
    scoreTimer = window.setInterval(step, fx ? 45 : 10);
  }

  function flashAmulet(uid: number, label: string, kind: string) {
    const chip = amulets.querySelector<HTMLElement>(`[data-uid="${uid}"]`);
    if (!chip) return;
    chip.classList.remove('fire');
    void chip.offsetWidth;
    chip.classList.add('fire');
    const f = h('div', { class: `chip-float k-${kind}` }, label);
    chip.append(f);
    setTimeout(() => f.remove(), 700);
  }

  function floatAt(id: number, text: string, cls: string, size = 22) {
    const p = enemyPos.get(id);
    if (!p) return;
    const f = h('div', { class: `float ${cls}` }, text);
    f.style.left = `${p.x}px`;
    f.style.top = `${p.y}px`;
    f.style.fontSize = `${size * u}px`;
    fxLayer.append(f);
    setTimeout(() => f.remove(), 900);
  }

  function retrigger(el: Element, cls: string) {
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
  }

  // Posición de una letra del monstruo dentro de la arena (para las chispas al teclear)
  function letterPoint(id: number): { x: number; y: number } | null {
    const el = enemyEls.get(id);
    const span = el?.querySelector<HTMLElement>('.word .just');
    if (!span) return enemyPos.get(id) ?? null;
    const a = arena.getBoundingClientRect();
    const r = span.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
  }

  function handleEvents() {
    let hudDirty = false;
    // Los golpes se enseñan cuando el proyectil llega al monstruo
    let pending: (() => void)[] | null = null;
    const later = (fn: () => void) => (pending ? pending.push(fn) : fn());
    let lastMaxHp = sector.hp;

    for (const ev of sector.drainEvents()) {
      switch (ev.type) {
        case 'key': {
          sfx.key();
          draw();
          const el = enemyEls.get(ev.id);
          if (el && fx) retrigger(el, 'nudge');
          if (fx) {
            const pt = letterPoint(ev.id);
            if (pt && gl) gl.sparks(pt.x, pt.y, { count: 5, color: 0x5ee08a, speed: 70, size: 10, life: 0.35, gravity: 60 });
            else if (pt) burst(fxLayer, pt.x, pt.y, { count: 3, color: '#5ee08a', speed: 30, size: 10, chars: ['✦', '·'] });
          }
          retrigger(cast, 'tick');
          break;
        }
        case 'error':
          sfx.error();
          shaker.add(0.28, 0.6);
          retrigger(cast, 'shake');
          if (fx) flash(fxLayer, '#ff5d6c', 0.18, 160);
          gl?.chroma(0.6);
          if (ev.id) {
            const el = enemyEls.get(ev.id);
            if (el) retrigger(el, 'shake');
            coach('firstError');
          }
          hudDirty = true;
          break;
        case 'score': {
          showScore(ev.word, ev.result);
          coach(ev.result.pure ? 'firstPerfect' : 'firstScore');
          const to = enemyPos.get(ev.id);
          const queue: (() => void)[] = [];
          pending = queue;
          const big = ev.result.damage >= lastMaxHp * 2;
          const from = towerUI.orbPoint(arena);
          towerUI.cast();
          const hit = () => queue.forEach((f) => f());
          if (to && gl) gl.bolt(from, to, big, hit);
          else if (to) bolt(fxLayer, from, to, big, hit, fx);
          else queue.forEach((f) => f());
          break;
        }
        case 'damage': {
          const e = sector.enemies.find((x) => x.id === ev.id);
          const maxHp = e?.maxHp ?? sector.hp;
          lastMaxHp = maxHp;
          const ratio = ev.amount / maxHp;
          later(() => {
            const size = ev.kind === 'main' ? Math.min(54, 22 + ratio * 9) : 18;
            floatAt(ev.id, `-${num(ev.amount)}`, `d-${ev.kind}`, size);
            const el = enemyEls.get(ev.id);
            if (el) retrigger(el, 'hit');
            const p = enemyPos.get(ev.id);
            if (gl && p) {
              if (ev.kind === 'main') {
                gl.pulse(p.x, p.y, 0xffffff, 0.6 + Math.min(1.4, ratio * 0.25));
                gl.sparks(p.x, p.y, { count: 8 + Math.min(20, Math.round(ratio * 4)), color: 0xb9a8ff, speed: 140 + ratio * 30, size: 12 });
                if (ratio >= 1) gl.shockwave(p.x, p.y, Math.min(1, ratio / 3));
              } else gl.sparks(p.x, p.y, { count: 6, color: ev.kind === 'fire' ? 0xff9248 : 0xe27bff, speed: 90, size: 10 });
            }
            if (ev.kind === 'main') {
              sfx.hit();
              shaker.add(Math.min(0.45, 0.1 + ratio * 0.08), Math.min(2.2, 0.3 + ratio * 0.35));
              if (ratio >= 2 && fx) {
                flash(fxLayer, '#ffffff', 0.22, 140);
                hitStop = Math.max(hitStop, 0.06);
              }
              if (e && e.hp > 0) coach('firstSurvive');
            }
          });
          break;
        }
        case 'kill': {
          const id = ev.id;
          defeated++;
          later(() => {
            sfx.kill();
            const el = enemyEls.get(id);
            const p = enemyPos.get(id);
            if (p && gl) {
              gl.sparks(p.x, p.y, { count: 26, color: 0xffd23f, speed: 260, size: 16, life: 0.8 });
              gl.sparks(p.x, p.y, { count: 12, color: 0xe27bff, speed: 160, size: 12, life: 0.7 });
              gl.pulse(p.x, p.y, 0xffd23f, 1.2);
              gl.shockwave(p.x, p.y, 0.35);
            } else if (p && fx) {
              burst(fxLayer, p.x, p.y, { count: 12, color: '#ffd23f', speed: 110, size: 16 });
              burst(fxLayer, p.x, p.y, { count: 6, color: '#e27bff', speed: 70, size: 12, chars: ['✧'] });
            }
            shaker.add(0.14, 0.8);
            hitStop = Math.max(hitStop, 0.035);
            if (el) {
              el.classList.add('dead');
              setTimeout(() => el.remove(), 400);
            }
            enemyEls.delete(id);
          });
          hudDirty = true;
          break;
        }
        case 'core': {
          sfx.core();
          defeated++;
          const el = enemyEls.get(ev.id);
          el?.remove();
          enemyEls.delete(ev.id);
          screenShaker.add(0.75, 2.5);
          if (gl) {
            const tp = towerUI.orbPoint(arena);
            const tx = tp.x;
            const ty = arena.clientHeight * 0.6;
            gl.chroma(1.4);
            gl.shockwave(tx, ty, 0.9);
            gl.sparks(tx, ty, { count: 30, color: 0xff5d6c, speed: 220, size: 14, life: 0.7 });
          }
          if (fx) flash(fxLayer, '#ff5d6c', 0.45, 350);
          towerUI.hit();
          coach('firstCore');
          hudDirty = true;
          break;
        }
        case 'bits':
          sfx.coin();
          if (ev.uid) flashAmulet(ev.uid, `+${ev.amount} Oro`, 'bits');
          hudDirty = true;
          break;
        case 'hurt':
          flashAmulet(ev.uid, `−${ev.amount} vida`, 'hurt');
          hudDirty = true;
          break;
        case 'oc':
          sfx.oc(ev.up);
          if (ev.up) {
            coach('firstStreak');
            banner(fxLayer, `${'🔥'.repeat(ev.level)} <b>¡Racha ${ev.level}!</b><small>Tu daño ×${dec(OC_MULT[ev.level])}</small>`, 'streak');
            shaker.add(0.2, 0);
            if (gl) {
              gl.sparks(arena.clientWidth / 2, arena.clientHeight / 2, { count: 40, color: 0xff9248, speed: 320, size: 14, life: 0.9 });
              gl.shockwave(arena.clientWidth / 2, arena.clientHeight / 2, 0.6);
            }
          } else {
            banner(fxLayer, `💨 <b>Racha perdida</b><small>Ahora ×${dec(OC_MULT[ev.level])}</small>`, 'lost');
          }
          hudDirty = true;
          break;
        case 'spawn': {
          const e = sector.enemies.find((x) => x.id === ev.id);
          if (e) retrigger(paths[e.row].portal, 'open');
          hudDirty = true;
          break;
        }
      }
    }
    if (hudDirty) {
      renderHud();
      renderAmulets();
    }
  }

  // ── Bucle ──
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused && !ended) {
      if (hitStop > 0) hitStop -= dt; // pequeña pausa en los golpes fuertes
      else sector.update(dt);
      handleEvents();
      draw();
      if (sector.finished) finish();
    }
    shaker.update(dt);
    screenShaker.update(dt);
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    ended = true;
    if (!sector.failed) banner(fxLayer, '✨ <b>¡Oleada superada!</b>', 'win');
    setTimeout(() => {
      destroy();
      onEnd(sector.failed);
    }, sector.failed ? 900 : 1000);
  }

  function togglePause(force?: boolean) {
    if (ended) return;
    paused = force ?? !paused;
    overlay.classList.toggle('hidden', !paused);
    if (paused) {
      overlay.replaceChildren(
        h('div', { class: 'panel center' },
          h('h2', null, '⏸ Pausa'),
          h('p', { class: 'muted' }, 'Pulsa Tab para seguir jugando.'),
          h('div', { class: 'row center' },
            h('button', { class: 'btn primary', onclick: () => togglePause(false) }, 'Seguir jugando'),
            h('button', { class: 'btn ghost', onclick: () => { destroy(); onQuit(); } }, 'Salir al menú'),
          ),
          h('p', { class: 'muted small' }, 'Si sales, la partida se guarda al inicio de esta oleada.'),
        ),
      );
    } else last = performance.now();
  }

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      togglePause();
      return;
    }
    if (paused || ended) return;
    if (e.key === 'Backspace' || e.key === 'Escape' || e.key.length === 1) {
      e.preventDefault();
      if (e.key === ' ') return;
      sector.key(e.key);
      handleEvents();
      draw();
    }
  }

  function onBlur() {
    togglePause(true);
  }

  function destroy() {
    destroyed = true;
    gl?.destroy();
    gl = null;
    cancelAnimationFrame(raf);
    clearInterval(scoreTimer);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onResize);
  }

  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  raf = requestAnimationFrame(frame);
  return { destroy };
}
