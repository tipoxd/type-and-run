// Simulador de balance: miles de runs con un jugador virtual de X WPM y Y% de
// precisión que usa la MISMA lógica de combate y tienda que el juego.
// Uso: npm run sim            (o)  npm run sim -- 500   (runs por perfil)
import { BALANCE, Sector } from '../src/core/combat';
import { CONSUMABLE_BY_ID } from '../src/core/content';
import { DAEMON_BY_ID } from '../src/core/daemons';
import type { FormatId } from '../src/core/formats';
import { buy, canBuy, completeSector, continueFromShop, createRun, FINAL_NODE, openPack, addDaemon, reroll, useConsumable } from '../src/core/run';
import type { RunState } from '../src/core/state';

const RUNS = Number(process.argv[2] ?? 200);
const DT = 0.05;
const REACTION = 0.35;
// Variables opcionales para probar balance: SPAWN=1.45,0.35 KB=0.5 TA=1 npm run sim
if (process.env.SPAWN) [BALANCE.spawnMult, BALANCE.spawnConst] = process.env.SPAWN.split(',').map(Number);
if (process.env.KB) BALANCE.knockback = Number(process.env.KB);
if (process.env.TA) BALANCE.marginExp = Number(process.env.TA);

interface Profile {
  name: string;
  wpm: number;
  acc: number;
  strategy: 'random' | 'smart' | 'nox';
}

const PROFILES: Profile[] = [
  { name: '35 WPM / 92% · compra al azar', wpm: 35, acc: 0.92, strategy: 'random' },
  { name: '35 WPM / 92% · compra razonable', wpm: 35, acc: 0.92, strategy: 'smart' },
  { name: '50 WPM / 94% · compra razonable', wpm: 50, acc: 0.94, strategy: 'smart' },
  { name: '70 WPM / 96% · compra razonable', wpm: 70, acc: 0.96, strategy: 'smart' },
  { name: '90 WPM / 97% · SIN ×Mult', wpm: 90, acc: 0.97, strategy: 'nox' },
];

// Semilla simple para que los resultados sean repetibles
let seed = 12345;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

function playSector(run: RunState, p: Profile): boolean {
  const s = new Sector(run);
  const cps = (p.wpm * 5) / 60;
  let budget = 0;
  let guard = 0;
  let react = 0;
  while (!s.finished && guard++ < 200000) {
    s.update(DT);
    react -= DT;
    if (react > 0) continue;
    budget = Math.min(budget + DT * cps, 2);
    while (budget >= 1 && !s.finished) {
      // Tiempo de reacción humano al cambiar de palabra
      if (!s.target) {
        if (react > -0.01 && react <= 0 && budget < 1.5) {
          react = REACTION;
          break;
        }
      }
      budget--;
      const t = s.target ?? s.alive().sort((a, b) => b.progress - a.progress)[0];
      if (!t) break;
      if (t.bad > 0) {
        s.key('Backspace');
        continue;
      }
      const next = t.word[t.typed];
      if (rand() < p.acc) s.key(next);
      else s.key(next === 'q' ? 'w' : 'q');
    }
    s.drainEvents();
  }
  return !s.failed;
}

function mostUsedFormat(): FormatId {
  return 'media';
}

function shopBot(run: RunState, p: Profile) {
  const shop = run.shop!;
  const allowed = (id: string) => p.strategy !== 'nox' || !DAEMON_BY_ID[id].givesX;
  // Consumibles: usar al momento
  const useAll = () => {
    for (const c of [...run.consumables]) {
      const def = CONSUMABLE_BY_ID[c.id];
      if (def.kind === 'parche') useConsumable(run, c.uid);
      else useConsumable(run, c.uid, rand() < 0.5 ? 'e' : 'a');
    }
  };
  const keep = p.strategy === 'random' ? 0 : 5; // la estrategia razonable guarda algo para el interés
  for (let round = 0; round < 2; round++) {
    let offers = shop.daemons.filter((o) => !o.sold && allowed(o.id) && canBuy(run, o));
    if (p.strategy !== 'random') offers.sort((a, b) => Number(!!DAEMON_BY_ID[b.id].givesX) - Number(!!DAEMON_BY_ID[a.id].givesX));
    else offers = offers.sort(() => rand() - 0.5);
    for (const o of offers) if (run.bits - o.price >= (run.daemons.length < 2 ? 0 : keep)) buy(run, o);
    if (shop.pack && !shop.pack.sold && run.bits - shop.pack.price >= keep && run.daemons.length < 5) {
      const ids = openPack(run)?.filter(allowed);
      if (ids?.length) addDaemon(run, ids[0]);
    }
    for (const o of shop.consumables) {
      if (!o.sold && run.bits - o.price >= keep && canBuy(run, o)) {
        const def = CONSUMABLE_BY_ID[o.id];
        if (def.kind === 'parche' && def.format !== mostUsedFormat() && p.strategy !== 'random') continue;
        buy(run, o);
        useAll();
      }
    }
    if (run.daemons.length < 5 && run.bits >= shop.rerollCost + 10) reroll(run);
    else break;
  }
  useAll();
}

interface Result {
  won: boolean;
  node: number;
  sectors: number;
  minutes: number;
}

function playRun(p: Profile): Result {
  const run = createRun({ kernel: 'base', wpmCal: p.wpm, upgrades: {}, seed: (rand() * 2 ** 32) >>> 0 });
  let time = 0;
  while (true) {
    const ok = playSector(run, p);
    time += 60; // aproximado, sólo para el informe
    if (!ok) return { won: false, node: run.node, sectors: run.stats.sectorsCleared, minutes: time / 60 };
    completeSector(run);
    if (run.phase === 'won') return { won: true, node: FINAL_NODE, sectors: run.stats.sectorsCleared, minutes: time / 60 };
    shopBot(run, p);
    continueFromShop(run);
  }
}

console.log(`\nSimulando ${RUNS} runs por perfil (MVP: ${FINAL_NODE} nodos)…\n`);
for (const p of PROFILES) {
  const results: Result[] = [];
  for (let i = 0; i < RUNS; i++) results.push(playRun(p));
  const wins = results.filter((r) => r.won).length;
  const deaths: Record<string, number> = {};
  for (const r of results) if (!r.won) {
    const key = `N${r.node}`;
    deaths[key] = (deaths[key] ?? 0) + 1;
  }
  const avgSectors = results.reduce((a, r) => a + r.sectors, 0) / results.length;
  console.log(
    `${p.name.padEnd(36)}  victorias ${((wins / RUNS) * 100).toFixed(1).padStart(5)}%   sectores medios ${avgSectors.toFixed(1)}   muertes ${JSON.stringify(deaths)}`,
  );
}
console.log('\nRegla: 35 WPM con build razonable debe ganar ≥5%; 90 WPM sin ×Mult NO debería ganar casi siempre.\n');
