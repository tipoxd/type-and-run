// Combate en tiempo real de un sector. No toca el DOM: la vista y el
// simulador de balance usan exactamente esta misma lógica.
import { emitDaemonEvent, hasDaemonFlag } from './daemons';
import { formatOf, type FormatId } from './formats';
import { ENEMIES_PER_SECTOR, hpPerEnemy, makeApi, rng, sectorRules } from './run';
import { OC_STEPS, ocLevelFor, scoreWord, type ScoreResult } from './scoring';
import type { BossId, RunState } from './state';
import { WORDS } from '../data/words';

export const ROWS = 5;

/** Parámetros de balance (el simulador los puede cambiar para probar). */
export const BALANCE = {
  spawnMult: 1.45, // intervalo de aparición = tiempo de escribir 6,5 letras × esto + spawnConst
  spawnConst: 0.35,
  knockback: 0.5, // retroceso máximo al herir sin matar (fracción del camino)
  marginExp: 1, // 0 = margen fijo (GDD original), 1 = escala con tu WPM
  readMargin: 2.5, // segundos extra para leer la palabra (a 40 WPM). El GDD decía 1,5
  firstSpawn: 1.0, // segundos antes del primer monstruo
};

export interface Enemy {
  id: number;
  word: string;
  typed: number; // letras correctas escritas
  bad: number; // letras erróneas pendientes de borrar
  badText: string; // esas letras, para enseñarlas
  wordError: boolean;
  hp: number;
  maxHp: number;
  progress: number; // 0 = aparece, 1 = llega al núcleo
  T: number; // segundos que tarda en llegar
  row: number;
  alive: boolean;
}

export type CombatEvent =
  | { type: 'spawn'; id: number }
  | { type: 'key'; id: number }
  | { type: 'error'; id: number | null }
  | { type: 'score'; id: number; word: string; result: ScoreResult }
  | { type: 'damage'; id: number; amount: number; kind: 'main' | 'overflow' | 'fire' }
  | { type: 'kill'; id: number }
  | { type: 'core'; id: number; dmg: number }
  | { type: 'bits'; amount: number; uid: number | null }
  | { type: 'hurt'; amount: number; uid: number }
  | { type: 'oc'; level: number; up: boolean };

const FORMAT_WEIGHTS: Record<'corta' | 'media' | 'larga' | 'epica', number> = { corta: 30, media: 35, larga: 25, epica: 10 };

export class Sector {
  enemies: Enemy[] = [];
  events: CombatEvent[] = [];
  spawned = 0;
  readonly total = ENEMIES_PER_SECTOR;
  time = 0;
  nextSpawn = BALANCE.firstSpawn;
  targetId: number | null = null;
  finished = false;
  failed = false;
  readonly hp: number;
  readonly rules: { boss: BossId | null; reversed: boolean; noBackspace: boolean };
  coreHits = 0;
  private firstWordDone = false;
  private nextId = 1;
  private words = 0;
  private damageSum = 0;
  private errors = 0;
  private readonly cps: number;
  private readonly speedMod: number;

  constructor(public run: RunState) {
    this.rules = sectorRules(run);
    this.hp = hpPerEnemy(run);
    this.cps = Math.max(15, run.wpmCal) * 5 / 60;
    let mod = 1;
    if (hasDaemonFlag(run, 'vocalSpeed')) mod /= 1.15;
    if ((run.upgrades.ocinit ?? 0) >= 2 && run.sectorsPlayed < 2) mod *= 1.15;
    this.speedMod = mod;
  }

  // ── Tiempo ──────────────────────────────────────────────────
  arrivalTime(word: string) {
    // GDD: 1,5 s + letras / (cps × 0,85). El margen de 1,5 s se escala con tu
    // WPM (vale 1,5 s a 40 WPM) para que la presión sea igual a cualquier velocidad.
    const margin = BALANCE.readMargin * Math.pow(40 / Math.max(15, this.run.wpmCal), BALANCE.marginExp);
    return (margin + word.length / (this.cps * 0.85)) * this.speedMod;
  }

  get spawnInterval() {
    return (6.5 / this.cps) * BALANCE.spawnMult + BALANCE.spawnConst;
  }

  alive() {
    return this.enemies.filter((e) => e.alive);
  }

  get target(): Enemy | null {
    return this.enemies.find((e) => e.id === this.targetId && e.alive) ?? null;
  }

  update(dt: number) {
    if (this.finished) return;
    this.time += dt;
    const alive = this.alive();
    if (this.spawned < this.total && (this.time >= this.nextSpawn || (alive.length === 0 && this.time >= BALANCE.firstSpawn))) {
      this.spawn();
      this.nextSpawn = this.time + this.spawnInterval;
    }
    // Velocidad real: cuenta todo el tiempo con monstruos en pantalla
    // (incluye leer y buscar la palabra, no solo teclear).
    if (alive.length > 0) this.run.stats.activeTime += dt;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.progress += dt / e.T;
      if (e.progress >= 1) {
        e.alive = false;
        const dmg = 10 + 2 * this.run.node;
        this.run.integrity -= dmg;
        this.coreHits++;
        if (this.targetId === e.id) this.targetId = null;
        this.events.push({ type: 'core', id: e.id, dmg });
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
    this.checkEnd();
  }

  private checkEnd() {
    if (this.run.integrity <= 0) {
      this.finished = true;
      this.failed = true;
    } else if (this.spawned >= this.total && this.alive().length === 0) {
      this.finished = true;
    }
    if (this.finished) {
      this.run.lastReport = {
        node: this.run.node,
        sector: this.run.sector,
        hpPerEnemy: this.hp,
        avgDamage: this.words ? this.damageSum / this.words : 0,
        words: this.words,
        coreHits: this.coreHits,
        errors: this.errors,
      };
    }
  }

  private pickWord(): string {
    const r = rng(this.run);
    const used = new Set(this.alive().map((e) => e.word[0]));
    let word = 'error';
    for (let i = 0; i < 40; i++) {
      const f = r.weighted(FORMAT_WEIGHTS) as FormatId;
      word = r.pick(WORDS[f]);
      if (!used.has(word[0])) break;
    }
    return word;
  }

  private spawn() {
    const counts = new Array(ROWS).fill(0);
    for (const e of this.alive()) counts[e.row]++;
    const min = Math.min(...counts);
    const rows = counts.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
    const word = this.pickWord();
    const e: Enemy = {
      id: this.nextId++,
      word,
      typed: 0,
      bad: 0,
      badText: '',
      wordError: false,
      hp: this.hp,
      maxHp: this.hp,
      progress: 0,
      T: this.arrivalTime(word),
      row: rng(this.run).pick(rows),
      alive: true,
    };
    this.enemies.push(e);
    this.spawned++;
    this.events.push({ type: 'spawn', id: e.id });
  }

  // ── Teclado ─────────────────────────────────────────────────
  private matches(expected: string, typed: string) {
    return expected === typed || (expected === 'ñ' && typed === 'n');
  }

  key(k: string) {
    if (this.finished) return;
    if (k === 'Escape') {
      const t = this.target;
      if (t) {
        t.typed = 0;
        t.bad = 0;
        t.badText = '';
      }
      this.targetId = null;
      return;
    }
    if (k === 'Backspace') {
      const t = this.target;
      if (!t || this.rules.noBackspace) return;
      if (t.bad > 0) {
        t.bad--;
        t.badText = t.badText.slice(0, -1);
      }
      else if (t.typed > 0) t.typed--;
      return;
    }
    if (k.length !== 1) return;
    k = k.toLowerCase();
    this.run.stats.keys++;

    let t = this.target;
    if (!t) {
      const candidates = this.alive()
        .filter((e) => this.matches(e.word[0], k))
        .sort((a, b) => b.progress - a.progress);
      if (!candidates.length) {
        this.registerError(null);
        return;
      }
      t = candidates[0];
      this.targetId = t.id;
    }

    if (t.bad === 0 && this.matches(t.word[t.typed], k)) {
      t.typed++;
      this.events.push({ type: 'key', id: t.id });
      if (t.typed >= t.word.length) this.resolve(t);
      return;
    }

    // Tecla errónea
    this.registerError(t);
    if (this.rules.noBackspace) {
      t.typed = 0;
      t.bad = 0;
      t.badText = '';
    } else if (t.bad < 4) {
      t.bad++;
      t.badText += k;
    }
  }

  private registerError(t: Enemy | null) {
    this.run.stats.errors++;
    this.errors++;
    this.events.push({ type: 'error', id: t?.id ?? null });
    emitDaemonEvent(this.run, { type: 'error' }, this.api());
    if (t && !t.wordError) {
      t.wordError = true;
      // Un error baja un nivel de Overclock (no lo resetea a 0)
      if (this.run.ocLevel > 0) {
        this.run.ocLevel--;
        this.run.ocStreak = OC_STEPS[this.run.ocLevel];
        this.events.push({ type: 'oc', level: this.run.ocLevel, up: false });
      }
    }
    this.checkEnd();
  }

  private api() {
    return makeApi(
      this.run,
      (amount, uid) => this.events.push({ type: 'bits', amount, uid }),
      (amount, uid) => this.events.push({ type: 'hurt', amount, uid }),
    );
  }

  private resolve(e: Enemy) {
    const run = this.run;
    const format = formatOf(e.word);
    run.pipeline = run.lastFormat === format ? run.pipeline + 1 : 0;
    run.lastFormat = format;
    const isLast = this.spawned >= this.total && this.alive().length === 1;

    const result = scoreWord({
      run,
      word: e.word,
      format,
      pure: !e.wordError || hasDaemonFlag(run, 'devnull'),
      isFirstOfSector: !this.firstWordDone,
      isLastEnemy: isLast,
      ocLevel: run.ocLevel,
      pipeline: run.pipeline,
    });
    this.firstWordDone = true;
    this.events.push({ type: 'score', id: e.id, word: e.word, result });

    // Estadísticas
    const s = run.stats;
    s.words++;
    s.letters += e.word.length;
    s.maxDamage = Math.max(s.maxDamage, result.damage);
    if (format === 'epica') s.epicWords++;
    this.words++;
    this.damageSum += result.damage;

    // Letras doradas
    let gold = 0;
    for (const c of e.word) gold += run.letterMods[c]?.gold ?? 0;
    if (gold) {
      run.bits += gold;
      s.bitsEarned += gold;
      this.events.push({ type: 'bits', amount: gold, uid: null });
    }

    // Overclock
    if (!e.wordError) {
      s.cleanWords++;
      run.ocStreak++;
      const lvl = ocLevelFor(run.ocStreak);
      if (lvl > run.ocLevel) this.events.push({ type: 'oc', level: lvl, up: true });
      run.ocLevel = lvl;
      s.maxOC = Math.max(s.maxOC, lvl);
      emitDaemonEvent(run, { type: 'cleanWord' }, this.api());
    }

    // Daño + Desbordamiento (50% del sobrante al enemigo más cercano)
    const dmg = result.damage;
    const overflow = Math.max(0, dmg - e.hp);
    this.hit(e, dmg, 'main');
    if (overflow > 0) {
      const next = this.alive().sort((a, b) => b.progress - a.progress)[0];
      if (next && this.hit(next, Math.floor(overflow * 0.5), 'overflow')) {
        s.overflowKills++;
        emitDaemonEvent(run, { type: 'overflowKill' }, this.api());
      }
    }
    // Incendio.exe
    if (hasDaemonFlag(run, 'fire') && e.word.length >= 7) {
      for (const o of this.alive()) if (o !== e) this.hit(o, Math.floor(dmg * 0.3), 'fire');
    }

    // Si sobrevive, recibe otra palabra y sigue avanzando
    if (e.alive) {
      // Retroceso proporcional al daño: premia pegar fuerte aunque no mate
      e.progress = Math.max(0, e.progress - BALANCE.knockback * Math.min(1, dmg / e.maxHp));
      e.word = this.pickWord();
      e.typed = 0;
      e.bad = 0;
      e.badText = '';
      e.wordError = false;
      e.T = this.arrivalTime(e.word);
    }
    this.targetId = null;
    this.checkEnd();
  }

  /** Aplica daño. Devuelve true si lo mata. */
  private hit(e: Enemy, amount: number, kind: 'main' | 'overflow' | 'fire'): boolean {
    if (!e.alive || amount <= 0) return false;
    e.hp -= amount;
    this.events.push({ type: 'damage', id: e.id, amount, kind });
    if (e.hp <= 0) {
      e.alive = false;
      e.progress = 2; // para que desaparezca
      if (this.targetId === e.id) this.targetId = null;
      this.events.push({ type: 'kill', id: e.id });
      return true;
    }
    return false;
  }

  drainEvents(): CombatEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
