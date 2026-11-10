// Estructura de la run: cuotas, recompensas, tienda y Fragmentos.
import { BOSS_IDS, CONSUMABLES, CONSUMABLE_BY_ID } from './content';
import { DAEMONS, DAEMON_BY_ID, emitDaemonEvent, type EventApi, type Rarity } from './daemons';
import { Rng } from './rng';
import { ocLevelFor, OC_STEPS } from './scoring';
import type { BossId, KernelId, Offer, Reward, RunState, ShopState } from './state';

export const SECTOR_NAMES = ['Oleada 1', 'Oleada 2', 'Jefe'];
export const BASE_QUOTA = [600, 1500, 4000, 10000, 22000, 40000, 70000, 100000];
/** MVP: la run se gana al superar el Nodo 3. Luego se puede seguir en modo infinito. */
export const FINAL_NODE = 3;
export const ENEMIES_PER_SECTOR = 20;
export const MAX_DAEMONS = 5;
export const MAX_CONSUMABLES = 2;
const LETTERS_OF_DAY = 'aeosnrilutdcmpbgvfh';

export function rng(run: RunState) {
  return new Rng(run);
}

export function baseQuota(node: number): number {
  if (node <= BASE_QUOTA.length) return BASE_QUOTA[node - 1];
  return BASE_QUOTA[BASE_QUOTA.length - 1] * 2 ** (node - BASE_QUOTA.length);
}

export function bossOf(run: RunState, node: number): BossId {
  if (!run.bosses[node]) {
    const prev = run.bosses[node - 1];
    const options = BOSS_IDS.filter((b) => b !== prev);
    run.bosses[node] = rng(run).pick(options);
  }
  return run.bosses[node];
}

export function quota(run: RunState, node: number, sector: number): number {
  let k = [1, 1.5, 2][sector];
  if (sector === 2) {
    if (node === 8) k = 3;
    if (bossOf(run, node) === 'firewall') k = 4;
  }
  return Math.round(baseQuota(node) * k);
}

export function hpPerEnemy(run: RunState, node = run.node, sector = run.sector): number {
  return Math.max(1, Math.round(quota(run, node, sector) / ENEMIES_PER_SECTOR));
}

export function createRun(opts: {
  kernel: KernelId;
  wpmCal: number;
  upgrades: Record<string, number>;
  seed: number;
}): RunState {
  const up = opts.upgrades;
  const maxIntegrity = 100 + 10 * (up.buffer ?? 0);
  const ocStart = (up.ocinit ?? 0) >= 1 ? OC_STEPS[1] : 0;
  const run: RunState = {
    version: 1,
    seed: opts.seed,
    rngState: opts.seed,
    kernel: opts.kernel,
    node: 1,
    sector: 0,
    integrity: maxIntegrity,
    maxIntegrity,
    bits: 4 + 3 * (up.capital ?? 0),
    daemons: [],
    consumables: [],
    formatLevels: { corta: 1, media: 1, larga: 1, epica: 1, bloque: 1 },
    letterMods: {},
    ocStreak: ocStart,
    ocLevel: ocLevelFor(ocStart),
    bosses: {},
    letterOfDay: 'e',
    lastFormat: null,
    pipeline: 0,
    shop: null,
    phase: 'combat',
    infinite: false,
    wpmCal: opts.wpmCal,
    nextUid: 1,
    sectorsPlayed: 0,
    upgrades: { ...up },
    stats: {
      words: 0, cleanWords: 0, keys: 0, errors: 0, letters: 0, activeTime: 0, maxDamage: 0,
      epicWords: 0, sectorsCleared: 0, nodesCleared: 0, maxOC: 0, bitsEarned: 0, overflowKills: 0,
    },
    lastReport: null,
  };
  bossOf(run, 1);
  startSector(run);
  return run;
}

/** Prepara un sector nuevo (letra del día, jefe del nodo visible). */
export function startSector(run: RunState) {
  run.phase = 'combat';
  run.letterOfDay = rng(run).pick(LETTERS_OF_DAY.split(''));
  bossOf(run, run.node);
}

export function isBossSector(run: RunState) {
  return run.sector === 2;
}

export function sectorRules(run: RunState) {
  const boss = isBossSector(run) ? bossOf(run, run.node) : null;
  return {
    boss,
    reversed: boss === 'cifrado',
    noBackspace: boss === 'sinretorno' || run.kernel === 'vim',
  };
}

export function sectorReward(run: RunState): Reward {
  const base = [3, 4, 5][run.sector];
  const integrity = Math.floor(Math.max(0, run.integrity) / 25);
  const interest = Math.min(5, Math.floor(run.bits / 5));
  return { base, integrity, interest, total: base + integrity + interest };
}

export function makeApi(run: RunState, onBits?: (n: number, uid: number) => void, onHurt?: (n: number, uid: number) => void): EventApi {
  return {
    addBits(n, uid) {
      run.bits += n;
      run.stats.bitsEarned += n;
      onBits?.(n, uid);
    },
    hurt(n, uid) {
      run.integrity -= n;
      onHurt?.(n, uid);
    },
  };
}

/**
 * Se llama al ganar un sector: paga Bits, avanza el contador y abre la tienda.
 * Devuelve la recompensa (para mostrarla).
 */
export function completeSector(run: RunState): Reward {
  emitDaemonEvent(run, { type: 'sectorEnd' }, makeApi(run));
  const reward = sectorReward(run);
  run.bits += reward.total;
  run.stats.bitsEarned += reward.total;
  run.stats.sectorsCleared++;
  run.sectorsPlayed++;
  run.sector++;
  if (run.sector > 2) {
    run.sector = 0;
    run.node++;
    run.stats.nodesCleared++;
    bossOf(run, run.node);
  }
  if (!run.infinite && run.node > FINAL_NODE) {
    run.phase = 'won';
  } else {
    run.phase = 'shop';
    run.shop = generateShop(run);
    run.shop.reward = reward;
  }
  return reward;
}

// ── Tienda ────────────────────────────────────────────────────
function daemonPrice(run: RunState, id: string) {
  const discount = (run.upgrades.mercado ?? 0) >= 2 ? 1 : 0;
  return Math.max(1, DAEMON_BY_ID[id].price - discount);
}

function rollDaemon(run: RunState, weights: Partial<Record<Rarity, number>>, exclude: Set<string>): string | null {
  const r = rng(run);
  for (let tries = 0; tries < 20; tries++) {
    const rarity = r.weighted(weights as Record<Rarity, number>);
    const pool = DAEMONS.filter((d) => d.rarity === rarity && !exclude.has(d.id));
    if (pool.length) return r.pick(pool).id;
  }
  const any = DAEMONS.filter((d) => d.rarity !== 'legendario' && !exclude.has(d.id));
  return any.length ? r.pick(any).id : null;
}

function ownedIds(run: RunState) {
  return new Set(run.daemons.map((d) => d.id));
}

function rollShopDaemons(run: RunState): Offer[] {
  const exclude = ownedIds(run);
  const out: Offer[] = [];
  for (let i = 0; i < 2; i++) {
    const id = rollDaemon(run, { comun: 70, infrecuente: 25, raro: 5 }, exclude);
    if (!id) break;
    exclude.add(id);
    out.push({ kind: 'daemon', id, price: daemonPrice(run, id) });
  }
  return out;
}

function rollShopConsumables(run: RunState): Offer[] {
  const r = rng(run);
  return [0, 1].map(() => ({ kind: 'consumable' as const, id: r.pick(CONSUMABLES).id, price: 3 }));
}

export function generateShop(run: RunState): ShopState {
  const reroll = 5 - ((run.upgrades.mercado ?? 0) >= 1 ? 1 : 0);
  return {
    daemons: rollShopDaemons(run),
    consumables: rollShopConsumables(run),
    pack: { price: rng(run).int(4, 6) },
    rerollCost: reroll,
    reward: null,
  };
}

export function reroll(run: RunState): boolean {
  const shop = run.shop;
  if (!shop || run.bits < shop.rerollCost) return false;
  run.bits -= shop.rerollCost;
  shop.rerollCost++;
  shop.daemons = rollShopDaemons(run);
  shop.consumables = rollShopConsumables(run);
  return true;
}

export function canBuy(run: RunState, offer: Offer): boolean {
  if (offer.sold || run.bits < offer.price) return false;
  if (offer.kind === 'daemon') return run.daemons.length < MAX_DAEMONS;
  return run.consumables.length < MAX_CONSUMABLES;
}

export function buy(run: RunState, offer: Offer): boolean {
  if (!canBuy(run, offer)) return false;
  run.bits -= offer.price;
  offer.sold = true;
  if (offer.kind === 'daemon') addDaemon(run, offer.id);
  else run.consumables.push({ uid: run.nextUid++, id: offer.id });
  return true;
}

export function addDaemon(run: RunState, id: string) {
  run.daemons.push({ uid: run.nextUid++, id, data: {} });
}

/** Abre el paquete: devuelve 3 Daemons para elegir 1 (puede salir legendario). */
export function openPack(run: RunState): string[] | null {
  const shop = run.shop;
  if (!shop?.pack || shop.pack.sold || run.bits < shop.pack.price || run.daemons.length >= MAX_DAEMONS) return null;
  run.bits -= shop.pack.price;
  shop.pack.sold = true;
  const exclude = ownedIds(run);
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = rollDaemon(run, { comun: 55, infrecuente: 28, raro: 12, legendario: 5 }, exclude);
    if (!id) break;
    exclude.add(id);
    out.push(id);
  }
  return out;
}

export function sellPrice(run: RunState, uid: number): number {
  const inst = run.daemons.find((d) => d.uid === uid);
  return inst ? Math.floor(daemonPrice(run, inst.id) / 2) : 0;
}

export function sell(run: RunState, uid: number): boolean {
  const idx = run.daemons.findIndex((d) => d.uid === uid);
  if (idx < 0) return false;
  const inst = run.daemons[idx];
  const price = daemonPrice(run, inst.id);
  run.bits += Math.floor(price / 2);
  run.daemons.splice(idx, 1);
  emitDaemonEvent(run, { type: 'sell', price }, makeApi(run));
  return true;
}

export function moveDaemon(run: RunState, uid: number, dir: -1 | 1) {
  const i = run.daemons.findIndex((d) => d.uid === uid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= run.daemons.length) return;
  [run.daemons[i], run.daemons[j]] = [run.daemons[j], run.daemons[i]];
}

/** Usa un consumible. Los Scripts necesitan la letra elegida. */
export function useConsumable(run: RunState, uid: number, letter?: string): boolean {
  const idx = run.consumables.findIndex((c) => c.uid === uid);
  if (idx < 0) return false;
  const def = CONSUMABLE_BY_ID[run.consumables[idx].id];
  if (def.kind === 'parche' && def.format) {
    run.formatLevels[def.format]++;
  } else if (def.kind === 'script' && def.letterMod) {
    if (!letter) return false;
    const mod = (run.letterMods[letter] ??= { chrome: 0, gold: 0, ignite: 0 });
    mod[def.letterMod]++;
  }
  run.consumables.splice(idx, 1);
  return true;
}

export function continueFromShop(run: RunState) {
  run.shop = null;
  startSector(run);
}

// ── Final de run ──────────────────────────────────────────────
export function accuracy(run: RunState): number {
  const k = run.stats.keys;
  return k ? ((k - run.stats.errors) / k) * 100 : 100;
}

export function runWpm(run: RunState): number {
  const s = run.stats;
  if (!s.words || s.activeTime <= 0) return 0;
  // Se cuenta cada palabra +1 (como el espacio de un test normal)
  return (s.letters + s.words) / 5 / (s.activeTime / 60);
}

export interface FragmentBreakdown {
  nodes: number;
  sectors: number;
  accuracy: number;
  wpm: number;
  magnet: number;
  total: number;
}

export function fragmentsFor(run: RunState): FragmentBreakdown {
  const nodes = 5 * run.stats.nodesCleared;
  const sectors = run.stats.sectorsCleared;
  const acc = Math.max(0, Math.floor(accuracy(run)) - 85);
  const wpm = Math.floor(runWpm(run) / 10);
  const magnet = 0.1 * (run.upgrades.iman ?? 0);
  const total = Math.floor((nodes + sectors + acc + wpm) * (1 + magnet));
  return { nodes, sectors, accuracy: acc, wpm, magnet, total };
}

/** Explica la derrota en una frase útil. */
export function defeatReason(run: RunState): string {
  const r = run.lastReport;
  const where = `el Reino ${run.node} (${SECTOR_NAMES[run.sector]})`;
  if (!r) return `Tu torre cayó en ${where}.`;
  const hasX = run.daemons.some((d) => DAEMON_BY_ID[d.id]?.givesX);
  if (r.avgDamage < r.hpPerEnemy) {
    const per = Math.ceil(r.hpPerEnemy / Math.max(1, r.avgDamage));
    let s = `Te faltó fuerza en ${where}: cada palabra hacía unos ${Math.round(r.avgDamage)} de daño y cada monstruo tenía ${r.hpPerEnemy} de vida (necesitabas ${per} palabras por monstruo).`;
    if (!hasX && run.node >= 3) s += ' Consejo: busca amuletos de ×Magia (los de color morado).';
    else if (run.daemons.length < 3) s += ' Consejo: compra más amuletos en la tienda.';
    return s;
  }
  if (r.errors > r.words * 0.4) return `Demasiados errores en ${where}: perdías la racha 🔥 y el bonus de palabra perfecta. Ve un poco más despacio.`;
  return `Llegaron demasiados monstruos a la vez en ${where}. Prueba la Bola de Fuego o palabras cortas rápidas.`;
}
