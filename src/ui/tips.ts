// Consejos del tutorial: se enseña una cosa cada vez, justo cuando pasa.
// Cada consejo sale una sola vez (se guarda en save.seenTips).
import { h, markup } from './dom';

export const TIPS: Record<string, string> = {
  start: '👆 Escribe la [b]primera letra[/] de cualquier palabra para apuntarla. ¡Termínala para lanzar el hechizo!',
  firstScore: '✨ Daño = [b]Poder[/] × [m]Magia[/]. Las palabras largas tienen más Poder y más Magia.',
  firstPerfect: '🌟 ¡Palabra perfecta! Si no fallas ninguna letra ganas [m]+2 Magia[/].',
  firstError: '❌ Fallaste una letra. Bórrala con ⌫ (Backspace). Los errores también bajan tu racha 🔥.',
  firstStreak: '🔥 ¡Racha! Cada 8 palabras perfectas seguidas tu daño se multiplica más.',
  firstCore: '🏰 Un monstruo llegó a tu torre y te quitó vida. ¡No los dejes llegar!',
  firstSurvive: '💪 Ese monstruo aguantó el golpe y trae otra palabra. Más adelante necesitarás amuletos para hacer más daño.',
  boss: '👹 ¡Jefe! Esta oleada tiene una regla especial. Léela arriba.',
  shop: '🛒 Con el [g]Oro[/] compras amuletos. Se activan de izquierda a derecha cada vez que lanzas un hechizo.',
  interest: '🐷 Si guardas Oro, ganas intereses: [g]+1[/] por cada 5 que tengas (máx. +5).',
};

export type Coach = (id: keyof typeof TIPS) => boolean;

export function createCoach(box: HTMLElement, seen: string[], onSeen: () => void, enabled = true): Coach {
  let timer = 0;
  return (id) => {
    if (!enabled || seen.includes(id)) return false;
    seen.push(id);
    onSeen();
    clearTimeout(timer);
    box.replaceChildren(h('div', { class: 'tip' }, markup(TIPS[id]), h('button', { class: 'tip-close', onclick: () => box.replaceChildren() }, '✕')));
    timer = window.setTimeout(() => box.replaceChildren(), 9000);
    return true;
  };
}
