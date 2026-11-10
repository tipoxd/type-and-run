// Tamaños de palabra (como las manos de póker en Balatro) y valor de cada letra.
export type FormatId = 'corta' | 'media' | 'larga' | 'epica' | 'bloque';

export interface FormatDef {
  id: FormatId;
  name: string;
  range: string;
  bytes: number;
  mult: number;
  lvlBytes: number;
  lvlMult: number;
}

export const FORMATS: Record<FormatId, FormatDef> = {
  corta: { id: 'corta', name: 'Corta', range: '2–4 letras', bytes: 5, mult: 1, lvlBytes: 10, lvlMult: 1 },
  media: { id: 'media', name: 'Media', range: '5–6 letras', bytes: 15, mult: 2, lvlBytes: 15, lvlMult: 1 },
  larga: { id: 'larga', name: 'Larga', range: '7–9 letras', bytes: 30, mult: 3, lvlBytes: 20, lvlMult: 2 },
  epica: { id: 'epica', name: 'Épica', range: '10+ letras', bytes: 50, mult: 4, lvlBytes: 30, lvlMult: 2 },
  bloque: { id: 'bloque', name: 'Conjuro', range: 'frase', bytes: 80, mult: 5, lvlBytes: 40, lvlMult: 3 },
};

export const FORMAT_ORDER: FormatId[] = ['corta', 'media', 'larga', 'epica'];

export function formatOf(word: string): FormatId {
  if (/[^a-zñ]/.test(word)) return 'bloque';
  const n = word.length;
  if (n <= 4) return 'corta';
  if (n <= 6) return 'media';
  if (n <= 9) return 'larga';
  return 'epica';
}

/** Bytes y Mult base de un formato a cierto nivel (nivel 1 = base). */
export function formatValues(id: FormatId, level: number) {
  const f = FORMATS[id];
  return {
    bytes: f.bytes + (level - 1) * f.lvlBytes,
    mult: f.mult + (level - 1) * f.lvlMult,
  };
}

// Valor de las letras por frecuencia en español (estilo Scrabble).
const GROUPS: [string, number][] = [
  ['aeosnriultdc', 1],
  ['mpbgvfh', 2],
  ['yqjñz', 4],
  ['kwx', 5],
];

export const LETTER_VALUES: Record<string, number> = {};
for (const [letters, v] of GROUPS) for (const c of letters) LETTER_VALUES[c] = v;

export function letterValue(c: string): number {
  return LETTER_VALUES[c] ?? 0;
}

export const ALPHABET = 'abcdefghijklmnñopqrstuvwxyz'.split('');
