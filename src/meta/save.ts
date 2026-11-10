// Datos permanentes del jugador (meta-progresión).
import { UPGRADES } from '../core/content';
import type { KernelId, RunState } from '../core/state';

export interface RunRecord {
  date: string;
  wpm: number;
  accuracy: number;
  node: number;
  sector: number;
  won: boolean;
  fragments: number;
  kernel: KernelId;
  maxDamage: number;
  /** 2 = velocidad medida con el método corregido (las anteriores salían infladas) */
  wpmV?: number;
}

export interface Options {
  sound: boolean;
  reduceFx: boolean; // sin sacudidas ni destellos
  tips: boolean; // consejos del tutorial
  /** Velocidad de los monstruos respecto a tu prueba (0,6 = mucho más lentos … 1,3 = más rápidos) */
  speed: number;
}

export interface SaveData {
  version: 1;
  fragments: number;
  totalFragments: number;
  upgrades: Record<string, number>;
  unlockedKernels: KernelId[];
  discovered: string[];
  history: RunRecord[];
  calibrated: boolean;
  calWpm: number;
  wins: number;
  bestNode: number;
  epicWordsTotal: number;
  options: Options;
  currentRun: RunState | null;
  /** Consejos del tutorial ya vistos */
  seenTips: string[];
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    fragments: 0,
    totalFragments: 0,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    unlockedKernels: ['base'],
    discovered: [],
    history: [],
    calibrated: false,
    calWpm: 40,
    wins: 0,
    bestNode: 0,
    epicWordsTotal: 0,
    options: { sound: true, reduceFx: false, tips: true, speed: 1 },
    currentRun: null,
    seenTips: [],
  };
}

/** Rellena campos que falten si el guardado es de una versión anterior. */
export function migrate(data: Partial<SaveData>): SaveData {
  const d = defaultSave();
  return {
    ...d,
    ...data,
    upgrades: { ...d.upgrades, ...(data.upgrades ?? {}) },
    options: { ...d.options, ...(data.options ?? {}) },
  };
}

/**
 * Velocidad a la que van los monstruos = tu prueba de velocidad × el ajuste de Opciones.
 * No se recalcula sola con cada partida: así no se dispara ni se hunde.
 * (Antes usaba la media de tus últimas partidas y se inflaba en cada run.)
 */
export function calibratedWpm(save: SaveData): number {
  const speed = save.options.speed ?? 1;
  return Math.round(Math.min(150, Math.max(15, save.calWpm * speed)));
}

/** Velocidad real medida en tus partidas (sólo para las gráficas). */
export function playedWpm(save: SaveData): number {
  const last = save.history.filter((r) => r.wpmV === 2 && r.wpm > 0).slice(-3).map((r) => r.wpm);
  return last.length ? Math.round(last.reduce((a, b) => a + b, 0) / last.length) : 0;
}
