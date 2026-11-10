// Generador aleatorio con semilla (mulberry32). El estado vive dentro del
// objeto que se le pasa, así una run guardada sigue igual al cargarla.
export interface RngHolder {
  rngState: number;
}

export class Rng {
  constructor(private holder: RngHolder) {}

  next(): number {
    let t = (this.holder.rngState = (this.holder.rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entero entre min y max, ambos incluidos. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Elige una clave según pesos: { comun: 70, raro: 5 } */
  weighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as [K, number][];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r < 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
