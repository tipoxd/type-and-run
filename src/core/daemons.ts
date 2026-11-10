// Amuletos (antes "Daemons"). Regla: una condición + un efecto sobre un solo eje.
// En las descripciones: [b]Poder[/]  [m]Magia[/]  [x]×Magia[/]  [g]Oro[/]
// Los id internos no cambian para no romper partidas guardadas.
import type { FormatId } from './formats';
import type { DaemonInst, RunState } from './state';

export type Rarity = 'comun' | 'infrecuente' | 'raro' | 'legendario';

export const RARITY_NAME: Record<Rarity, string> = {
  comun: 'Común',
  infrecuente: 'Poco común',
  raro: 'Raro',
  legendario: 'Legendario',
};

export interface WordCtx {
  run: RunState;
  word: string;
  format: FormatId;
  pure: boolean;
  isFirstOfSector: boolean;
  isLastEnemy: boolean;
  ocLevel: number;
  pipeline: number;
}

export interface Contribution {
  bytes?: number;
  mult?: number;
  xmult?: number;
}

export type DaemonEvent =
  | { type: 'cleanWord' }
  | { type: 'overflowKill' }
  | { type: 'sectorEnd' }
  | { type: 'error' }
  | { type: 'sell'; price: number };

export interface EventApi {
  addBits(n: number, uid: number): void;
  hurt(n: number, uid: number): void;
}

export interface DaemonDef {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  price: number;
  arch: string;
  desc: (inst?: DaemonInst) => string;
  add?: (ctx: WordCtx, inst: DaemonInst) => Contribution | null;
  mul?: (ctx: WordCtx, inst: DaemonInst) => Contribution | null;
  on?: (ev: DaemonEvent, inst: DaemonInst, api: EventApi) => void;
  flag?: 'vocalSpeed' | 'fire' | 'devnull' | 'copy';
  /** true si puede dar ×Magia (para explicar derrotas y para el simulador) */
  givesX?: boolean;
}

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
const hasRune = (run: RunState, c: string) => {
  const m = run.letterMods[c];
  return !!m && m.chrome + m.gold + m.ignite > 0;
};

export const DAEMONS: DaemonDef[] = [
  // ── Comunes ────────────────────────────────────────────────
  {
    id: 'grep', name: 'Trébol', icon: '🍀', rarity: 'comun', price: 4, arch: 'Letras',
    desc: () => '[m]+4 Magia[/] si la palabra tiene la letra de la suerte',
    add: (c) => (c.word.includes(c.run.letterOfDay) ? { mult: 4 } : null),
  },
  {
    id: 'vocal', name: 'Eco Vocal', icon: '🔔', rarity: 'comun', price: 5, arch: 'Palabras largas', flag: 'vocalSpeed',
    desc: () => 'Las vocales dan el doble de [b]Poder[/], pero los monstruos van un 15% más rápido',
    add: (c) => {
      const v = [...c.word].filter((ch) => 'aeiou'.includes(ch)).length;
      return v ? { bytes: v } : null;
    },
  },
  {
    id: 'chmod', name: 'Daga Rápida', icon: '🗡️', rarity: 'comun', price: 4, arch: 'Palabras cortas',
    desc: () => '[b]+30 Poder[/] a las palabras cortas',
    add: (c) => (c.format === 'corta' ? { bytes: 30 } : null),
  },
  {
    id: 'pingf', name: 'Botas Veloces', icon: '👢', rarity: 'comun', price: 5, arch: 'Palabras cortas',
    desc: () => '[m]+4 Magia[/] a las palabras cortas',
    add: (c) => (c.format === 'corta' ? { mult: 4 } : null),
  },
  {
    id: 'malloc', name: 'Libro Gordo', icon: '📕', rarity: 'comun', price: 5, arch: 'Palabras largas',
    desc: () => '[b]+40 Poder[/] a las palabras largas y épicas',
    add: (c) => (c.format === 'larga' || c.format === 'epica' ? { bytes: 40 } : null),
  },
  {
    id: 'cache', name: 'Hucha', icon: '🐷', rarity: 'comun', price: 4, arch: 'Oro',
    desc: (i) => `[g]+1 Oro[/] por cada 10 palabras perfectas${i ? ` (${i.data.n ?? 0}/10)` : ''}`,
    on: (ev, inst, api) => {
      if (ev.type !== 'cleanWord') return;
      inst.data.n = (inst.data.n ?? 0) + 1;
      if (inst.data.n >= 10) {
        inst.data.n = 0;
        api.addBits(1, inst.uid);
      }
    },
  },
  {
    id: 'cron', name: 'Reloj de Arena', icon: '⏳', rarity: 'comun', price: 5, arch: 'Oro',
    desc: () => '[g]+2 Oro[/] al terminar cada oleada',
    on: (ev, inst, api) => {
      if (ev.type === 'sectorEnd') api.addBits(2, inst.uid);
    },
  },
  {
    id: 'pipeline', name: 'Cadena', icon: '⛓️', rarity: 'comun', price: 5, arch: 'Palabras cortas',
    desc: () => '[m]+2 Magia[/] por cada palabra seguida del mismo tamaño (se reinicia al cambiar)',
    add: (c) => (c.pipeline > 0 ? { mult: 2 * c.pipeline } : null),
  },
  {
    id: 'watchdog', name: 'Vela', icon: '🕯️', rarity: 'comun', price: 5, arch: 'Racha',
    desc: () => '[m]+3 Magia[/] por cada nivel de racha 🔥',
    add: (c) => (c.ocLevel > 0 ? { mult: 3 * c.ocLevel } : null),
  },

  // ── Poco comunes ───────────────────────────────────────────
  {
    id: 'fire', name: 'Bola de Fuego', icon: '☄️', rarity: 'infrecuente', price: 6, arch: 'Palabras largas', flag: 'fire',
    desc: () => 'Las palabras de 7+ letras queman a todos los demás monstruos con el 30% del daño',
  },
  {
    id: 'sqrt', name: 'Gemelos', icon: '👯', rarity: 'infrecuente', price: 7, arch: 'Letras', givesX: true,
    desc: () => '[x]×1,5 Magia[/] si la palabra tiene una letra doble ("llave", "perro")',
    mul: (c) => (/(.)\1/.test(c.word) ? { xmult: 1.5 } : null),
  },
  {
    id: 'fork', name: 'Semilla Mágica', icon: '🌱', rarity: 'infrecuente', price: 7, arch: 'Palabras largas', givesX: true,
    desc: (i) =>
      `Crece [x]+0,1 ×Magia[/] cada vez que el daño sobrante mata a otro monstruo${
        i ? ` (ahora [x]×${fmt(1 + (i.data.x ?? 0))}[/])` : ''
      }`,
    mul: (_c, inst) => ((inst.data.x ?? 0) > 0 ? { xmult: 1 + inst.data.x } : null),
    on: (ev, inst) => {
      if (ev.type === 'overflowKill') inst.data.x = Math.round(((inst.data.x ?? 0) + 0.1) * 10) / 10;
    },
  },
  {
    id: 'gc', name: 'Caldero', icon: '🫕', rarity: 'infrecuente', price: 6, arch: 'Oro',
    desc: (i) =>
      `Cuando vendes otro amuleto, gana [m]+1 Magia[/] para siempre por cada 2 de Oro de su precio${
        i ? ` (ahora [m]+${i.data.m ?? 0}[/])` : ''
      }`,
    add: (_c, inst) => ((inst.data.m ?? 0) > 0 ? { mult: inst.data.m } : null),
    on: (ev, inst) => {
      if (ev.type === 'sell') inst.data.m = (inst.data.m ?? 0) + Math.floor(ev.price / 2);
    },
  },
  {
    id: 'swap', name: 'Cofre', icon: '🧰', rarity: 'infrecuente', price: 6, arch: 'Oro',
    desc: () => '[m]+1 Magia[/] por cada 3 de Oro que tengas guardado (máx. +15)',
    add: (c) => {
      const m = Math.min(15, Math.floor(c.run.bits / 3));
      return m > 0 ? { mult: m } : null;
    },
  },
  {
    id: 'hyper', name: 'Varita de Fuego', icon: '🪄', rarity: 'infrecuente', price: 8, arch: 'Racha', givesX: true,
    desc: () => '[x]×1,5 Magia[/] con racha 🔥 de nivel 3 o más',
    mul: (c) => (c.ocLevel >= 3 ? { xmult: 1.5 } : null),
  },
  {
    id: 'jit', name: 'Pluma Rúnica', icon: '🪶', rarity: 'infrecuente', price: 6, arch: 'Letras',
    desc: () => '[b]+8 Poder[/] por cada letra con runa en la palabra',
    add: (c) => {
      const n = [...c.word].filter((ch) => hasRune(c.run, ch)).length;
      return n ? { bytes: 8 * n } : null;
    },
  },

  // ── Raros ──────────────────────────────────────────────────
  {
    id: 'sudo', name: 'Corona', icon: '👑', rarity: 'raro', price: 9, arch: 'Riesgo', givesX: true,
    desc: () => '[x]×2 Magia[/] a la primera palabra de cada oleada y contra el último monstruo',
    mul: (c) => (c.isFirstOfSector || c.isLastEnemy ? { xmult: 2 } : null),
  },
  {
    id: 'panic', name: 'Furia', icon: '😡', rarity: 'raro', price: 8, arch: 'Racha', givesX: true,
    desc: () => '[x]×3 Magia[/] con racha 🔥 al máximo (nivel 4); pierdes 5 de vida por cada error',
    mul: (c) => (c.ocLevel >= 4 ? { xmult: 3 } : null),
    on: (ev, inst, api) => {
      if (ev.type === 'error') api.hurt(5, inst.uid);
    },
  },
  {
    id: 'blueprint', name: 'Espejo Gemelo', icon: '🪞', rarity: 'raro', price: 10, arch: 'Copia', flag: 'copy', givesX: true,
    desc: () => 'Copia el efecto del amuleto que tenga a su derecha',
  },

  // ── Legendarios (solo en cofres sorpresa) ──────────────────
  {
    id: 'root', name: 'Ojo del Dragón', icon: '🐉', rarity: 'legendario', price: 12, arch: 'Letras', givesX: true,
    desc: () => 'Cada letra con Runa de Fuerza en la palabra da además [x]×1,1 Magia[/]',
    mul: (c) => {
      const n = [...c.word].filter((ch) => (c.run.letterMods[ch]?.chrome ?? 0) > 0).length;
      return n ? { xmult: Math.pow(1.1, n) } : null;
    },
  },
  {
    id: 'devnull', name: 'Manto del Perdón', icon: '🧥', rarity: 'legendario', price: 12, arch: 'Riesgo', flag: 'devnull',
    desc: () => 'Las palabras con errores cuentan igual como perfectas',
  },
];

export const DAEMON_BY_ID: Record<string, DaemonDef> = Object.fromEntries(DAEMONS.map((d) => [d.id, d]));

export function daemonDef(id: string): DaemonDef {
  return DAEMON_BY_ID[id];
}

export function hasDaemonFlag(run: RunState, flag: DaemonDef['flag']): boolean {
  return run.daemons.some((d) => DAEMON_BY_ID[d.id]?.flag === flag);
}

/** Envía un evento a todos los amuletos equipados, de izquierda a derecha. */
export function emitDaemonEvent(run: RunState, ev: DaemonEvent, api: EventApi) {
  for (const inst of [...run.daemons]) DAEMON_BY_ID[inst.id]?.on?.(ev, inst, api);
}
