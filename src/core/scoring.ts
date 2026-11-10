// Fórmula de daño: (Bytes) × (Mult) × ∏×Mult × Overclock
// Orden fijo: Formato → letras → Pureza → Daemons que suman → Daemons ×Mult → Overclock.
import { DAEMON_BY_ID, type DaemonDef, type WordCtx } from './daemons';
import { FORMATS, formatValues, letterValue, type FormatId } from './formats';
import type { DaemonInst } from './state';

export const OC_STEPS = [0, 8, 16, 24, 32];
export const OC_MULT = [1, 1.25, 1.5, 2, 3];

export interface ScoreStep {
  kind: 'bytes' | 'mult' | 'xmult';
  label: string;
  value: number;
  uid?: number;
}

export interface ScoreResult {
  damage: number;
  bytes: number;
  mult: number;
  x: number;
  format: FormatId;
  pure: boolean;
  steps: ScoreStep[];
}

/** El Daemon cuyo efecto se usa en la posición i (Blueprint copia al de su derecha). */
function effective(daemons: DaemonInst[], i: number): { def: DaemonDef; inst: DaemonInst } | null {
  for (let depth = 0; i < daemons.length && depth < 6; depth++, i++) {
    const def = DAEMON_BY_ID[daemons[i].id];
    if (!def) return null;
    if (def.flag !== 'copy') return { def, inst: daemons[i] };
  }
  return null;
}

export function scoreWord(ctx: WordCtx): ScoreResult {
  const run = ctx.run;
  const steps: ScoreStep[] = [];
  const level = run.formatLevels[ctx.format] ?? 1;
  const base = formatValues(ctx.format, level);
  let bytes = base.bytes;
  let mult = base.mult;
  let x = 1;
  steps.push({ kind: 'bytes', label: `Palabra ${FORMATS[ctx.format].name.toLowerCase()}`, value: base.bytes });
  steps.push({ kind: 'mult', label: `Palabra ${FORMATS[ctx.format].name.toLowerCase()}`, value: base.mult });

  // Letras
  let letterBytes = 0;
  let letterMult = 0;
  for (const c of ctx.word) {
    letterBytes += letterValue(c);
    const mod = run.letterMods[c];
    if (mod) {
      letterBytes += 3 * mod.chrome;
      letterMult += 2 * mod.ignite;
    }
  }
  bytes += letterBytes;
  steps.push({ kind: 'bytes', label: 'Letras', value: letterBytes });
  if (letterMult) {
    mult += letterMult;
    steps.push({ kind: 'mult', label: 'Runas de fuego', value: letterMult });
  }

  // Pureza
  if (ctx.pure) {
    const p = run.kernel === 'vim' ? 4 : 2;
    mult += p;
    steps.push({ kind: 'mult', label: 'Perfecta', value: p });
  }

  // Daemons: primero los que suman, luego los ×Mult (izquierda a derecha)
  for (let i = 0; i < run.daemons.length; i++) {
    const e = effective(run.daemons, i);
    const c = e?.def.add?.(ctx, e.inst);
    if (!c) continue;
    const uid = run.daemons[i].uid;
    if (c.bytes) {
      bytes += c.bytes;
      steps.push({ kind: 'bytes', label: DAEMON_BY_ID[run.daemons[i].id].name, value: c.bytes, uid });
    }
    if (c.mult) {
      mult += c.mult;
      steps.push({ kind: 'mult', label: DAEMON_BY_ID[run.daemons[i].id].name, value: c.mult, uid });
    }
  }
  for (let i = 0; i < run.daemons.length; i++) {
    const e = effective(run.daemons, i);
    const c = e?.def.mul?.(ctx, e.inst);
    if (!c?.xmult) continue;
    x *= c.xmult;
    steps.push({ kind: 'xmult', label: DAEMON_BY_ID[run.daemons[i].id].name, value: c.xmult, uid: run.daemons[i].uid });
  }

  // Overclock al final
  const oc = OC_MULT[ctx.ocLevel] ?? 1;
  if (oc > 1) {
    x *= oc;
    steps.push({ kind: 'xmult', label: `Racha ${ctx.ocLevel}`, value: oc });
  }

  return {
    damage: Math.floor(bytes * mult * x),
    bytes,
    mult,
    x,
    format: ctx.format,
    pure: ctx.pure,
    steps,
  };
}

export function ocLevelFor(streak: number): number {
  let lvl = 0;
  for (let i = 0; i < OC_STEPS.length; i++) if (streak >= OC_STEPS[i]) lvl = i;
  return lvl;
}
