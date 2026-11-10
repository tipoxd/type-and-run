import './style.css';
import { DAEMONS, RARITY_NAME } from './core/daemons';
import { KERNELS, UPGRADES } from './core/content';
import {
  accuracy, completeSector, continueFromShop, createRun, defeatReason, FINAL_NODE, fragmentsFor, generateShop, runWpm, SECTOR_NAMES,
} from './core/run';
import { randomSeed } from './core/rng';
import type { KernelId, RunState } from './core/state';
import { WORDS } from './data/words';
import { calibratedWpm, defaultSave, migrate, type SaveData } from './meta/save';
import { LocalStorageBackend, type SaveBackend } from './storage/storage';
import { setSound } from './ui/audio';
import { daemonCard } from './ui/cards';
import { startCombat } from './ui/combatView';
import { dec, h, markup, num, toast } from './ui/dom';
import { showShop } from './ui/shopView';
import { createCoach } from './ui/tips';

// Para pasar a base de datos: cambia esta línea por `new ApiBackend(url, getToken)`.
const storage: SaveBackend = new LocalStorageBackend();
const app = document.getElementById('app')!;
let save: SaveData = defaultSave();
let cleanup: (() => void) | null = null;
let lastKernel: KernelId = 'base';

function persist() {
  void storage.save(save);
}

function setScreen(fn: () => (() => void) | void) {
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  cleanup = fn() ?? null;
}

function keyHandler(map: Record<string, () => void>) {
  const on = (e: KeyboardEvent) => {
    const f = map[e.key.toLowerCase()];
    if (f) {
      e.preventDefault();
      f();
    }
  };
  window.addEventListener('keydown', on);
  return () => window.removeEventListener('keydown', on);
}

function coachFor() {
  const box = h('div', { class: 'coach' });
  return { box, coach: createCoach(box, save.seenTips, persist, save.options.tips) };
}

function back(label = 'Volver') {
  return h('button', { class: 'btn ghost', onclick: showMenu }, `← ${label}`);
}

// ── Menú ──────────────────────────────────────────────────────
function showMenu() {
  setScreen(() => {
    const cont = save.currentRun;
    const firstTime = save.history.length === 0;
    app.replaceChildren(
      h('div', { class: 'screen menu' },
        h('div', { class: 'logo-icon' }, '🧙'),
        h('div', { class: 'logo' }, 'Type & Run'),
        h('div', { class: 'logo-sub' }, 'La Torre de los Hechizos'),
        h('p', { class: 'tagline' }, 'Los monstruos atacan tu torre. Escribe sus palabras para lanzar hechizos. Compra amuletos para hacerte cada vez más fuerte.'),
        save.history.length
          ? h('div', { class: 'menu-stats' },
              h('div', null, h('b', { class: 'c-crystal' }, `💎 ${num(save.fragments)}`), h('span', null, 'cristales')),
              h('div', null, h('b', null, String(save.calWpm)), h('span', null, 'palabras/min (prueba)')),
              h('div', null, h('b', null, `🏆 ${save.wins}`), h('span', null, 'victorias')),
            )
          : null,
        h('div', { class: 'menu-buttons' },
          cont ? h('button', { class: 'btn primary big', onclick: () => resumeRun(cont) }, `▶ Continuar (Reino ${cont.node} · ${SECTOR_NAMES[cont.sector]})`) : null,
          h('button', { class: `btn ${cont ? '' : 'primary big'}`, onclick: () => newRunFlow() }, cont ? 'Nueva partida (se pierde la actual)' : '▶ Jugar'),
          firstTime ? h('button', { class: 'btn', onclick: showHowTo }, '📜 Cómo se juega (1 minuto)') : null,
          h('div', { class: 'menu-grid' },
            h('button', { class: 'btn', onclick: showUpgrades }, '🏰 Mejoras'),
            h('button', { class: 'btn', onclick: showCompendium }, '📖 Amuletos'),
            h('button', { class: 'btn', onclick: showProgress }, '📈 Progreso'),
            h('button', { class: 'btn', onclick: showOptions }, '⚙️ Opciones'),
          ),
          firstTime ? null : h('button', { class: 'btn ghost small', onclick: showHowTo }, '📜 Cómo se juega'),
        ),
      ),
    );
    return keyHandler({ enter: () => (cont ? resumeRun(cont) : newRunFlow()) });
  });
}

function newRunFlow() {
  if (!save.calibrated) showCalibration(() => showKernelSelect());
  else showKernelSelect();
}

// ── Prueba de velocidad (30 s) ────────────────────────────────
function showCalibration(next: () => void) {
  setScreen(() => {
    const pool = [...WORDS.media, ...WORDS.corta, ...WORDS.larga];
    const words = Array.from({ length: 80 }, () => pool[Math.floor(Math.random() * pool.length)]);
    let idx = 0;
    let typed = '';
    let correctChars = 0;
    let start = 0;
    let done = false;
    const DURATION = 30;
    const text = h('div', { class: 'cal-text' });
    const timer = h('div', { class: 'cal-timer' }, `${DURATION}`);
    const draw = () => {
      text.replaceChildren(
        ...words.slice(idx, idx + 12).map((w, i) => {
          if (i > 0) return h('span', { class: 'cal-word' }, w);
          const ok = w.startsWith(typed);
          return h('span', { class: `cal-word current${ok ? '' : ' wrong'}` }, h('span', { class: 'ok' }, typed), w.slice(typed.length));
        }),
      );
    };
    const finish = () => {
      done = true;
      const wpm = Math.max(15, Math.round(correctChars / 5 / (DURATION / 60)));
      save.calWpm = wpm;
      save.calibrated = true;
      persist();
      app.replaceChildren(
        h('div', { class: 'screen center-screen' },
          h('div', { class: 'panel center' },
            h('div', { class: 'card-icon big' }, '⚡'),
            h('h2', null, `${wpm} palabras por minuto`),
            h('p', null, 'Los monstruos irán a tu ritmo, ni muy rápido ni muy lento. Cada partida se vuelve a ajustar sola.'),
            h('button', { class: 'btn primary big', onclick: next }, 'Seguir ▶'),
          ),
        ),
      );
    };
    const interval = setInterval(() => {
      if (!start || done) return;
      const left = Math.max(0, DURATION - (performance.now() - start) / 1000);
      timer.textContent = left.toFixed(0);
      if (left <= 0) {
        clearInterval(interval);
        finish();
      }
    }, 100);
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (typed === words[idx]) correctChars += typed.length + 1;
        if (typed.length) {
          idx++;
          typed = '';
        }
      } else if (e.key === 'Backspace') typed = typed.slice(0, -1);
      else if (e.key.length === 1 && !e.ctrlKey) {
        if (!start) start = performance.now();
        typed += e.key.toLowerCase();
      } else return;
      draw();
    };
    window.addEventListener('keydown', onKey);
    app.replaceChildren(
      h('div', { class: 'screen center-screen' },
        h('div', { class: 'panel center wide' },
          h('h2', null, '⚡ Prueba de velocidad'),
          h('p', null, 'Antes de empezar, medimos tu velocidad para que el juego vaya a tu ritmo.'),
          h('p', { class: 'muted' }, 'Escribe las palabras y pulsa ', h('b', null, 'espacio'), ' después de cada una. Tienes 30 segundos; el tiempo empieza con tu primera tecla.'),
          timer,
          text,
          h('button', { class: 'btn ghost small', onclick: () => { save.calibrated = true; persist(); next(); } }, 'Saltar (usar velocidad normal)'),
        ),
      ),
    );
    draw();
    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', onKey);
    };
  });
}

// ── Elegir mago ───────────────────────────────────────────────
function showKernelSelect() {
  setScreen(() => {
    app.replaceChildren(
      h('div', { class: 'screen center-screen' },
        h('div', { class: 'panel center wide' },
          h('h2', null, 'Elige tu mago'),
          h('p', { class: 'muted' }, 'Cada mago juega con reglas distintas. Ninguno es más fuerte que otro.'),
          h('p', { class: 'muted small' }, `🐢🐇 Los monstruos irán a ${calibratedWpm(save)} palabras/min. Puedes cambiarlo en ⚙️ Opciones.`),
          h('div', { class: 'cards center' },
            ...KERNELS.map((k) => {
              const unlocked = save.unlockedKernels.includes(k.id);
              return h('div', { class: `card hero${unlocked ? '' : ' locked'}` },
                h('div', { class: 'card-icon big' }, unlocked ? k.icon : '🔒'),
                h('div', { class: 'card-name' }, k.name),
                h('div', { class: 'card-desc' }, markup(k.rule)),
                h('div', { class: 'pill' }, unlocked ? 'Disponible' : `Se desbloquea: ${k.unlock}`),
                h('button', { class: 'btn primary', disabled: !unlocked, onclick: () => startNewRun(k.id) }, 'Elegir'),
              );
            }),
          ),
          back(),
        ),
      ),
    );
    return keyHandler({ enter: () => startNewRun('base') });
  });
}

function startNewRun(kernel: KernelId) {
  lastKernel = kernel;
  const run = createRun({ kernel, wpmCal: calibratedWpm(save), upgrades: save.upgrades, seed: randomSeed() });
  save.currentRun = run;
  persist();
  playSector(run);
}

function resumeRun(run: RunState) {
  if (run.phase === 'shop' && run.shop) goShop(run);
  else playSector(run);
}

// ── Combate y tienda ──────────────────────────────────────────
function playSector(run: RunState) {
  run.phase = 'combat';
  // Guardamos al empezar la oleada: si sales, vuelves a este punto.
  save.currentRun = JSON.parse(JSON.stringify(run)) as RunState;
  persist();
  setScreen(() => {
    const { box, coach } = coachFor();
    const c = startCombat(app, run, save.options, box, coach, (failed) => {
      if (failed) endRun(run, false);
      else {
        completeSector(run);
        if (run.phase === 'won') endRun(run, true);
        else goShop(run);
      }
    }, showMenu);
    return () => c.destroy();
  });
}

function goShop(run: RunState) {
  save.currentRun = run;
  persist();
  setScreen(() => {
    const { box, coach } = coachFor();
    const s = showShop(
      app,
      run,
      save.options,
      box,
      coach,
      () => { save.currentRun = run; persist(); },
      () => { continueFromShop(run); playSector(run); },
      (ids) => {
        let added = false;
        for (const id of ids) if (!save.discovered.includes(id)) { save.discovered.push(id); added = true; }
        if (added) persist();
      },
    );
    return () => s.destroy();
  });
}

// ── Fin de partida ────────────────────────────────────────────
function endRun(run: RunState, won: boolean) {
  const frag = fragmentsFor(run);
  // En modo infinito sólo se cobra lo ganado desde la victoria
  const paid = run.fragmentsPaid ?? 0;
  run.fragmentsPaid = frag.total;
  frag.total = Math.max(0, frag.total - paid);
  const wpm = runWpm(run);
  const acc = accuracy(run);
  save.fragments += frag.total;
  save.totalFragments += frag.total;
  save.history.push({
    date: new Date().toISOString(),
    wpm: Math.round(wpm),
    accuracy: Math.round(acc * 10) / 10,
    node: run.node,
    sector: run.sector,
    won,
    fragments: frag.total,
    kernel: run.kernel,
    maxDamage: run.stats.maxDamage,
    wpmV: 2,
  });
  if (save.history.length > 200) save.history.shift();
  save.bestNode = Math.max(save.bestNode, run.stats.nodesCleared);
  save.epicWordsTotal += run.stats.epicWords;
  for (const d of run.daemons) if (!save.discovered.includes(d.id)) save.discovered.push(d.id);
  const unlocks: string[] = [];
  if (won) {
    save.wins++;
    if (!save.unlockedKernels.includes('vim')) {
      save.unlockedKernels.push('vim');
      unlocks.push('🧘 ¡Nuevo mago desbloqueado: el Monje!');
    }
  }
  save.currentRun = null;
  persist();

  setScreen(() => {
    const again = () => startNewRun(lastKernel);
    const continueInfinite = () => {
      run.infinite = true;
      run.phase = 'shop';
      run.shop = generateShop(run);
      save.currentRun = run;
      persist();
      goShop(run);
    };
    app.replaceChildren(
      h('div', { class: 'screen center-screen' },
        h('div', { class: `panel center wide end ${won ? 'won' : 'lost'}` },
          h('div', { class: 'card-icon big' }, won ? '🏆' : '💥'),
          h('h2', null, won ? '¡Has salvado la torre!' : 'La torre ha caído'),
          h('p', { class: 'reason' }, won ? `Venciste a los monstruos de los ${FINAL_NODE} reinos.` : defeatReason(run)),
          h('div', { class: 'end-stats' },
            stat('⚡', 'Palabras/min', String(Math.round(wpm))),
            stat('🎯', 'Acierto', `${dec(acc, 0)}%`),
            stat('💥', 'Mayor golpe', num(run.stats.maxDamage)),
            stat('🔥', 'Mejor racha', `nivel ${run.stats.maxOC}`),
          ),
          h('div', { class: 'frag-box' },
            h('div', { class: 'total' }, h('span', null, 'Cristales ganados'), h('b', { class: 'c-crystal' }, `💎 +${frag.total}`)),
            h('details', null,
              h('summary', { class: 'muted small' }, '¿De dónde salen?'),
              h('div', null, `Reinos superados (5 cada uno)`, h('b', null, `+${frag.nodes}`)),
              h('div', null, 'Oleadas superadas', h('b', null, `+${frag.sectors}`)),
              h('div', null, 'Acierto por encima del 85%', h('b', null, `+${frag.accuracy}`)),
              h('div', null, 'Velocidad', h('b', null, `+${frag.wpm}`)),
              frag.magnet ? h('div', null, 'Imán de cristales', h('b', null, `×${dec(1 + frag.magnet)}`)) : null,
            ),
            h('p', { class: 'muted small' }, 'Gasta los cristales en 🏰 Mejoras para empezar más fuerte.'),
          ),
          ...unlocks.map((u) => h('p', { class: 'unlock' }, u)),
          h('div', { class: 'row center' },
            h('button', { class: 'btn primary big', onclick: again }, '↻ Otra partida', h('small', null, ' (R)')),
            won ? h('button', { class: 'btn', onclick: continueInfinite }, '♾️ Seguir sin fin') : null,
            h('button', { class: 'btn ghost', onclick: showMenu }, 'Menú', h('small', null, ' (M)')),
          ),
        ),
      ),
    );
    return keyHandler({ r: again, m: showMenu });
  });
}

function stat(icon: string, label: string, value: string) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-i' }, icon), h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label));
}

// ── Mejoras permanentes ───────────────────────────────────────
function showUpgrades() {
  setScreen(() => {
    const render = () =>
      app.replaceChildren(
        h('div', { class: 'screen narrow' },
          h('div', { class: 'page-head' }, h('h2', null, '🏰 Mejoras de la torre'), h('div', { class: 'gold-big c-crystal' }, `💎 ${num(save.fragments)}`)),
          h('p', { class: 'muted' }, 'Ganas cristales al terminar cada partida, ganes o pierdas. Estas mejoras duran para siempre.'),
          ...UPGRADES.map((u) => {
            const lvl = save.upgrades[u.id] ?? 0;
            const maxed = lvl >= u.costs.length;
            const cost = u.costs[lvl];
            return h('div', { class: 'panel upgrade' },
              h('div', { class: 'upgrade-icon' }, u.icon),
              h('div', { class: 'upgrade-body' },
                h('h3', null, u.name, ' ', h('span', { class: 'dots' }, '●'.repeat(lvl), h('span', { class: 'muted' }, '○'.repeat(u.costs.length - lvl)))),
                h('p', { class: 'small' }, maxed ? `✔ ${u.levels[lvl - 1]}` : `Siguiente: ${u.levels[lvl]}`),
              ),
              maxed
                ? h('button', { class: 'btn small', disabled: true }, 'Completo')
                : h('button', {
                    class: 'btn small buy',
                    disabled: save.fragments < cost,
                    onclick: () => { save.fragments -= cost; save.upgrades[u.id] = lvl + 1; persist(); render(); },
                  }, 'Mejorar ', h('span', { class: 'c-crystal' }, `💎 ${cost}`)),
            );
          }),
          back(),
        ),
      );
    render();
  });
}

// ── Libro de amuletos ─────────────────────────────────────────
function showCompendium() {
  setScreen(() => {
    const found = new Set(save.discovered);
    app.replaceChildren(
      h('div', { class: 'screen' },
        h('div', { class: 'page-head' }, h('h2', null, '📖 Libro de amuletos'), h('span', { class: 'muted' }, `${found.size} de ${DAEMONS.length} descubiertos`)),
        h('p', { class: 'muted' }, 'Los amuletos que veas en la tienda se apuntan aquí.'),
        h('div', { class: 'cards' },
          ...DAEMONS.map((d) =>
            found.has(d.id)
              ? daemonCard(d.id)
              : h('div', { class: 'card undiscovered' }, h('div', { class: 'card-icon' }, '❔'), h('div', { class: 'card-name' }, '???'), h('div', { class: 'card-desc muted' }, 'Aún no lo has encontrado.'), h('div', { class: `pill r-${d.rarity}` }, RARITY_NAME[d.rarity])),
          ),
        ),
        back(),
      ),
    );
  });
}

// ── Progreso (gráficas) ───────────────────────────────────────
function lineChart(title: string, values: number[], unit: string, color: string, yMin: number, yMax: number) {
  const W = 520;
  const H = 160;
  const P = { l: 40, r: 12, t: 12, b: 24 };
  const x = (i: number) => P.l + (values.length <= 1 ? (W - P.l - P.r) / 2 : (i / (values.length - 1)) * (W - P.l - P.r));
  const y = (v: number) => P.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - P.t - P.b);
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const svg = `
  <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${title}">
    ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${P.l - 6}" y="${y(t) + 4}" class="axis" text-anchor="end">${Math.round(t)}</text>`).join('')}
    <text x="${P.l}" y="${H - 6}" class="axis">partida 1</text>
    <text x="${W - P.r}" y="${H - 6}" class="axis" text-anchor="end">partida ${values.length}</text>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${color}" stroke="var(--panel)" stroke-width="2"><title>Partida ${i + 1}: ${dec(v, 1)} ${unit}</title></circle><circle cx="${x(i)}" cy="${y(v)}" r="12" fill="transparent"><title>Partida ${i + 1}: ${dec(v, 1)} ${unit}</title></circle>`).join('')}
  </svg>`;
  return h('div', { class: 'panel chart-box' }, h('h3', null, title, ' ', h('span', { class: 'muted small' }, `última: ${dec(values[values.length - 1] ?? 0, 1)} ${unit}`)), h('div', { html: svg }));
}

function showProgress() {
  setScreen(() => {
    const hist = save.history.slice(-40);
    const wpms = hist.map((r) => r.wpm);
    const accs = hist.map((r) => r.accuracy);
    const maxW = Math.max(60, ...wpms);
    app.replaceChildren(
      h('div', { class: 'screen narrow' },
        h('h2', null, '📈 Tu progreso'),
        hist.length
          ? h('div', null,
              lineChart('⚡ Palabras por minuto en partida (incluye leer y apuntar)', wpms, 'palabras/min', 'var(--bytes)', 0, Math.ceil(maxW / 10) * 10),
              lineChart('🎯 Acierto', accs, '%', 'var(--good)', Math.min(80, Math.floor(Math.min(...accs) / 5) * 5), 100),
              h('div', { class: 'panel' },
                h('h3', null, 'Últimas partidas'),
                h('table', { class: 'table' },
                  h('tr', null, h('th', null, 'Fecha'), h('th', null, 'Resultado'), h('th', null, 'Pal/min'), h('th', null, 'Acierto'), h('th', null, '💎')),
                  ...hist.slice(-12).reverse().map((r) =>
                    h('tr', null,
                      h('td', null, new Date(r.date).toLocaleDateString('es-ES')),
                      h('td', null, r.won ? '🏆 Victoria' : `Reino ${r.node} · ${SECTOR_NAMES[r.sector]}`),
                      h('td', null, String(r.wpm)),
                      h('td', null, `${dec(r.accuracy, 0)}%`),
                      h('td', { class: 'c-crystal' }, `+${r.fragments}`),
                    ),
                  ),
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'Juega alguna partida y aquí verás cómo mejoras.'),
        back(),
      ),
    );
  });
}

// ── Opciones ──────────────────────────────────────────────────
const SPEEDS: [number, string][] = [[0.7, 'Muy lento'], [0.85, 'Lento'], [1, 'Normal'], [1.15, 'Rápido'], [1.3, 'Muy rápido']];

function showOptions() {
  setScreen(() => {
    let confirmWipe = false;
    const render = () =>
      app.replaceChildren(
        h('div', { class: 'screen narrow' },
          h('h2', null, '⚙️ Opciones'),
          h('div', { class: 'panel' },
            toggle('🔊 Sonido', save.options.sound, (v) => { save.options.sound = v; setSound(v); }),
            toggle('💡 Mostrar consejos mientras juego', save.options.tips, (v) => { save.options.tips = v; }),
            toggle('🌙 Reducir efectos (sin sacudidas ni destellos)', save.options.reduceFx, (v) => { save.options.reduceFx = v; }),
            h('button', { class: 'btn small ghost', onclick: () => { save.seenTips = []; save.options.tips = true; persist(); toast('Los consejos volverán a salir'); render(); } }, 'Volver a ver todos los consejos'),
          ),
          h('div', { class: 'panel' },
            h('h3', null, '🐢 Velocidad de los monstruos 🐇'),
            h('p', { class: 'muted small' }, `Tu prueba de velocidad: ${save.calWpm} palabras/min. Los monstruos van a ${calibratedWpm(save)}.`),
            h('div', { class: 'speed-row' },
              ...SPEEDS.map(([v, label]) =>
                h('button', { class: `btn small${Math.abs((save.options.speed ?? 1) - v) < 0.01 ? ' primary' : ''}`, onclick: () => { save.options.speed = v; persist(); render(); } }, label),
              ),
            ),
            h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => showCalibration(showOptions) }, '⚡ Repetir la prueba de velocidad')),
          ),
          h('div', { class: 'panel' },
            h('button', {
              class: 'btn danger',
              onclick: async () => {
                if (!confirmWipe) { confirmWipe = true; render(); return; }
                await storage.clear();
                save = defaultSave();
                toast('Progreso borrado');
                showMenu();
              },
            }, confirmWipe ? '⚠️ Pulsa otra vez para BORRAR TODO' : 'Borrar todo mi progreso'),
          ),
          back(),
        ),
      );
    function toggle(label: string, value: boolean, set: (v: boolean) => void) {
      return h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: value, onchange: (e: Event) => { set((e.target as HTMLInputElement).checked); persist(); } }), label);
    }
    render();
  });
}

// ── Cómo se juega: 4 pasos con dibujos, uno por pantalla ──────
function showHowTo() {
  const steps = [
    { icon: '🏰', title: 'Defiende tu torre', text: 'Los monstruos caminan hacia tu torre. Cada uno lleva una palabra. Si llegan, tu torre pierde vida.' },
    { icon: '⌨️', title: 'Escribe para atacar', text: 'Escribe la primera letra de una palabra para apuntar a ese monstruo. Termina la palabra y lanzarás un hechizo.' },
    { icon: '✨', title: 'Poder × Magia = daño', text: 'Las palabras largas hacen más daño. Si no fallas ninguna letra, es perfecta y ganas Magia extra. Muchas perfectas seguidas encienden tu racha 🔥.' },
    { icon: '🛒', title: 'Compra amuletos', text: 'Entre oleadas ganas oro. En la tienda compras amuletos que multiplican tu daño. Cada reino tiene 3 oleadas y la última es un jefe. ¡Supera 3 reinos para ganar!' },
  ];
  let i = 0;
  setScreen(() => {
    const render = () => {
      const s = steps[i];
      app.replaceChildren(
        h('div', { class: 'screen center-screen' },
          h('div', { class: 'panel center howto' },
            h('div', { class: 'steps' }, ...steps.map((_, j) => h('span', { class: j === i ? 'on' : '' }))),
            h('div', { class: 'card-icon huge' }, s.icon),
            h('h2', null, s.title),
            h('p', { class: 'big-text' }, s.text),
            h('div', { class: 'row center' },
              i > 0 ? h('button', { class: 'btn ghost', onclick: () => { i--; render(); } }, '← Atrás') : back('Menú'),
              i < steps.length - 1
                ? h('button', { class: 'btn primary', onclick: () => { i++; render(); } }, 'Siguiente →')
                : h('button', { class: 'btn primary', onclick: newRunFlow }, '¡A jugar! ▶'),
            ),
          ),
        ),
      );
    };
    render();
    return keyHandler({
      arrowright: () => { if (i < steps.length - 1) { i++; render(); } },
      arrowleft: () => { if (i > 0) { i--; render(); } },
      enter: () => { if (i < steps.length - 1) { i++; render(); } else newRunFlow(); },
    });
  });
}

// ── Arranque ──────────────────────────────────────────────────
async function boot() {
  const loaded = await storage.load();
  save = loaded ? migrate(loaded) : defaultSave();
  setSound(save.options.sound);
  showMenu();
}
void boot();
