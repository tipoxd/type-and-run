// Pociones y runas, jefes, personajes y mejoras permanentes.
import { FORMATS, type FormatId } from './formats';
import type { BossId, KernelId } from './state';

// ── Pociones (suben un tamaño de palabra) y Runas (mejoran una letra) ──
export interface ConsumableDef {
  id: string;
  name: string;
  icon: string;
  kind: 'parche' | 'script';
  desc: string;
  format?: FormatId;
  letterMod?: 'chrome' | 'gold' | 'ignite';
}

const POTION_ICON: Record<string, string> = { corta: '🧪', media: '⚗️', larga: '🍶', epica: '🏺' };

export const CONSUMABLES: ConsumableDef[] = [
  ...(['corta', 'media', 'larga', 'epica'] as FormatId[]).map(
    (f): ConsumableDef => ({
      id: `parche_${f}`,
      name: `Poción de palabras ${FORMATS[f].name.toLowerCase()}s`,
      icon: POTION_ICON[f],
      kind: 'parche',
      format: f,
      desc: `Las palabras ${FORMATS[f].name.toLowerCase()}s suben de nivel: [b]+${FORMATS[f].lvlBytes} Poder[/] y [m]+${FORMATS[f].lvlMult} Magia[/] para siempre`,
    }),
  ),
  { id: 'cromar', name: 'Runa de Fuerza', icon: '💪', kind: 'script', letterMod: 'chrome', desc: 'Elige una letra: dará [b]+3 Poder[/] cada vez que aparezca' },
  { id: 'dorar', name: 'Runa de Oro', icon: '🪙', kind: 'script', letterMod: 'gold', desc: 'Elige una letra: te dará [g]+1 Oro[/] cada vez que la escribas' },
  { id: 'ignicion', name: 'Runa de Fuego', icon: '🔥', kind: 'script', letterMod: 'ignite', desc: 'Elige una letra: dará [m]+2 Magia[/] cada vez que aparezca' },
];

export const CONSUMABLE_BY_ID: Record<string, ConsumableDef> = Object.fromEntries(CONSUMABLES.map((c) => [c.id, c]));

// ── Jefes (tercera oleada de cada reino) ──────────────────────
export interface BossDef {
  id: BossId;
  name: string;
  icon: string;
  desc: string;
  counter: string;
}

export const BOSSES: Record<BossId, BossDef> = {
  cifrado: { id: 'cifrado', name: 'Espejo Maldito', icon: '🪞', desc: 'Las palabras se ven al revés, pero se escriben al derecho', counter: 'Lee con calma' },
  sinretorno: { id: 'sinretorno', name: 'Bruja del Silencio', icon: '🧙‍♀️', desc: 'No puedes borrar: un error reinicia la palabra', counter: 'Escribe despacio y sin fallos' },
  firewall: { id: 'firewall', name: 'Gólem de Piedra', icon: '🗿', desc: 'Sus monstruos tienen el doble de vida', counter: 'Amuletos de ×Magia' },
};
export const BOSS_IDS = Object.keys(BOSSES) as BossId[];

// ── Personajes (cambian reglas, no dan más poder) ─────────────
export interface KernelDef {
  id: KernelId;
  name: string;
  icon: string;
  rule: string;
  unlock: string;
}

export const KERNELS: KernelDef[] = [
  { id: 'base', name: 'Aprendiz', icon: '🧑‍🎓', rule: 'El mago normal. Ideal para empezar.', unlock: 'Disponible desde el principio' },
  { id: 'vim', name: 'Monje', icon: '🧘', rule: 'No puede borrar (un error reinicia la palabra), pero cada palabra perfecta da [m]+4 Magia[/] en vez de +2', unlock: 'Gana una partida' },
];

// ── Mejoras permanentes (con tope) ────────────────────────────
export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  levels: string[];
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'buffer', name: 'Muros reforzados', icon: '🧱', levels: ['+10 de vida de la torre', '+20 de vida', '+30 de vida'], costs: [30, 60, 120] },
  { id: 'ocinit', name: 'Calentamiento', icon: '🔥', levels: ['Empiezas con racha nivel 1', 'Además, las 2 primeras oleadas van un 15% más lentas'], costs: [40, 100] },
  { id: 'iman', name: 'Imán de cristales', icon: '🧲', levels: ['+10% de cristales', '+20%', '+30%', '+40%', '+50%'], costs: [25, 40, 65, 100, 160] },
  { id: 'mercado', name: 'Amigo mercader', icon: '🤝', levels: ['Cambiar tienda cuesta 1 menos', 'Además, los amuletos cuestan 1 menos'], costs: [50, 120] },
  { id: 'capital', name: 'Bolsa inicial', icon: '💰', levels: ['+3 de Oro al empezar', '+6 de Oro al empezar'], costs: [30, 70] },
];
