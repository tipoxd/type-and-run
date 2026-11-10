// Estado de una run. Todo es JSON plano para poder guardarlo tal cual
// (hoy en localStorage, mañana en la base de datos).
import type { FormatId } from './formats';

export type KernelId = 'base' | 'vim';
export type BossId = 'cifrado' | 'sinretorno' | 'firewall';

export interface DaemonInst {
  uid: number;
  id: string;
  /** Datos que crecen durante la run (Fork Bomb, Garbage Collector, Caché…) */
  data: Record<string, number>;
}

export interface ConsumableInst {
  uid: number;
  id: string;
}

export interface LetterMod {
  chrome: number; // +3 Bytes por aparición
  gold: number; // +1 Bit por aparición
  ignite: number; // +2 Mult por aparición
}

export interface Offer {
  kind: 'daemon' | 'consumable';
  id: string;
  price: number;
  sold?: boolean;
}

export interface ShopState {
  daemons: Offer[];
  consumables: Offer[];
  pack: { price: number; sold?: boolean } | null;
  rerollCost: number;
  reward: Reward | null;
}

export interface Reward {
  base: number;
  integrity: number;
  interest: number;
  total: number;
}

export interface RunStats {
  words: number;
  cleanWords: number;
  keys: number;
  errors: number;
  letters: number;
  activeTime: number;
  maxDamage: number;
  epicWords: number;
  sectorsCleared: number;
  nodesCleared: number;
  maxOC: number;
  bitsEarned: number;
  overflowKills: number;
}

export interface SectorReport {
  node: number;
  sector: number;
  hpPerEnemy: number;
  avgDamage: number;
  words: number;
  coreHits: number;
  errors: number;
}

export interface RunState {
  version: 1;
  seed: number;
  rngState: number;
  kernel: KernelId;
  node: number; // 1..
  sector: number; // 0 Ping, 1 Firewall, 2 Kernel
  integrity: number;
  maxIntegrity: number;
  bits: number;
  daemons: DaemonInst[];
  consumables: ConsumableInst[];
  formatLevels: Record<FormatId, number>;
  letterMods: Record<string, LetterMod>;
  ocStreak: number;
  ocLevel: number;
  bosses: Record<number, BossId>;
  letterOfDay: string;
  lastFormat: FormatId | null;
  pipeline: number;
  shop: ShopState | null;
  phase: 'combat' | 'shop' | 'won' | 'lost';
  infinite: boolean;
  wpmCal: number;
  nextUid: number;
  /** Sectores jugados en total (para "los 2 primeros sectores van más lentos") */
  sectorsPlayed: number;
  upgrades: Record<string, number>;
  stats: RunStats;
  lastReport: SectorReport | null;
  /** Fragmentos ya cobrados (modo infinito tras ganar) */
  fragmentsPaid?: number;
}
