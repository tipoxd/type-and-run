import { CONSUMABLE_BY_ID } from '../core/content';
import { DAEMON_BY_ID, RARITY_NAME } from '../core/daemons';
import type { DaemonInst } from '../core/state';
import { h, markup } from './dom';

/** Tarjeta grande de amuleto (tienda, compendio). */
export function daemonCard(id: string, inst?: DaemonInst, extra?: Node | null): HTMLDivElement {
  const d = DAEMON_BY_ID[id];
  return h(
    'div',
    { class: `card r-${d.rarity}`, 'data-uid': inst?.uid ?? '' },
    h('div', { class: 'card-icon' }, d.icon),
    h('div', { class: 'card-name' }, d.name),
    h('div', { class: 'card-desc' }, markup(d.desc(inst))),
    h('div', { class: `pill r-${d.rarity}` }, RARITY_NAME[d.rarity]),
    extra ?? null,
  );
}

/** Ficha pequeña de amuleto para la pantalla de combate. */
export function daemonChip(id: string, inst: DaemonInst): HTMLDivElement {
  const d = DAEMON_BY_ID[id];
  const desc = markup(d.desc(inst));
  return h(
    'div',
    { class: `chip-amulet r-${d.rarity}`, 'data-uid': inst.uid },
    h('span', { class: 'chip-icon' }, d.icon),
    h('span', { class: 'chip-name' }, d.name),
    h('div', { class: 'chip-tip' }, h('b', null, d.name), h('br'), desc),
  );
}

export function consumableCard(id: string, extra?: Node | null): HTMLDivElement {
  const c = CONSUMABLE_BY_ID[id];
  return h(
    'div',
    { class: `card k-${c.kind}` },
    h('div', { class: 'card-icon' }, c.icon),
    h('div', { class: 'card-name' }, c.name),
    h('div', { class: 'card-desc' }, markup(c.desc)),
    h('div', { class: 'pill k' }, c.kind === 'parche' ? 'Poción' : 'Runa'),
    extra ?? null,
  );
}
