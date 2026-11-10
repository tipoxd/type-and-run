// Tienda entre oleadas: interfaz en HTML + fondo 3D (Three.js) + animaciones.
import { BOSSES, CONSUMABLE_BY_ID } from '../core/content';
import { ALPHABET, FORMAT_ORDER, FORMATS, formatValues, type FormatId } from '../core/formats';
import {
  addDaemon, bossOf, buy, canBuy, FINAL_NODE, hpPerEnemy, isBossSector, MAX_CONSUMABLES, MAX_DAEMONS,
  moveDaemon, openPack, reroll, SECTOR_NAMES, sell, sellPrice, useConsumable,
} from '../core/run';
import { scoreWord } from '../core/scoring';
import type { Offer, RunState } from '../core/state';
import type { Options } from '../meta/save';
import { sfx } from './audio';
import { consumableCard, daemonCard } from './cards';
import { DAEMON_BY_ID } from '../core/daemons';
import { h, markup, num } from './dom';
import type { Shop3D } from './shop3d';
import type { Coach } from './tips';

const SAMPLE: Record<FormatId, string> = { corta: 'sol', media: 'magia', larga: 'castillo', epica: 'biblioteca', bloque: 'luz de luna' };

/** Daño estimado de una palabra perfecta de cada tamaño con lo que tienes ahora. */
function estimate(run: RunState, f: FormatId) {
  return scoreWord({ run, word: SAMPLE[f], format: f, pure: true, isFirstOfSector: false, isLastEnemy: false, ocLevel: run.ocLevel, pipeline: 0 }).damage;
}

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function showShop(
  root: HTMLElement,
  run: RunState,
  opts: Options,
  coachBox: HTMLElement,
  coach: Coach,
  onChange: () => void,
  onContinue: () => void,
  onSeen: (ids: string[]) => void,
) {
  const shop = run.shop!;
  const fx = !opts.reduceFx;
  let modal: HTMLElement | null = null;
  let detailsOpen = false;
  let firstRender = true;
  let dealing = false;
  let leaving = false;
  let shownGold = run.bits - (shop.reward?.total ?? 0);
  let goldTimer = 0;
  let goldEl: HTMLElement | null = null;

  // ── Fondo 3D (se carga aparte; si falla, la tienda funciona igual) ──
  let s3d: Shop3D | null = null;
  let closed = false;
  if (fx) {
    import('./shop3d')
      .then((m) => {
        if (closed) return;
        const s = new m.Shop3D();
        if (s.init(document.body)) {
          s3d = s;
          document.body.classList.add('has-3d');
        }
      })
      .catch(() => null);
  }

  function changed() {
    onChange();
    render();
  }

  // ── Contador de oro animado ──
  function animateGold() {
    if (!goldEl) return;
    const from = shownGold;
    const to = run.bits;
    if (from === to) {
      goldEl.textContent = String(to);
      return;
    }
    const diff = to - from;
    const delta = h('span', { class: `gold-delta ${diff > 0 ? 'up' : 'down'}` }, `${diff > 0 ? '+' : ''}${diff}`);
    goldEl.parentElement!.append(delta);
    setTimeout(() => delta.remove(), 1100);
    goldEl.parentElement!.classList.remove('bump');
    void goldEl.parentElement!.offsetWidth;
    goldEl.parentElement!.classList.add('bump');
    const start = performance.now();
    const dur = 450;
    const el = goldEl;
    cancelAnimationFrame(goldTimer);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      el.textContent = String(Math.round(from + diff * (1 - Math.pow(1 - k, 3))));
      if (k < 1) goldTimer = requestAnimationFrame(step);
    };
    goldTimer = requestAnimationFrame(step);
    shownGold = to;
  }

  /** La tarjeta comprada vuela hasta tu inventario. */
  function flyCard(ghost: HTMLElement, from: DOMRect, destSelector: string) {
    if (!fx) return;
    const all = root.querySelectorAll<HTMLElement>(destSelector);
    const dest = all[all.length - 1];
    if (!dest) return;
    const to = dest.getBoundingClientRect();
    dest.style.opacity = '0';
    ghost.classList.add('ghost-card');
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.append(ghost);
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    ghost.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', filter: 'brightness(1)' },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 80}px) scale(1.12) rotate(-6deg)`, filter: 'brightness(1.6)', offset: 0.35 },
        { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width}) rotate(0deg)`, filter: 'brightness(1)' },
      ],
      { duration: 620, easing: 'cubic-bezier(.5,0,.3,1)' },
    ).onfinish = () => {
      ghost.remove();
      dest.style.opacity = '';
      dest.classList.add('landed');
      const c = center(dest);
      s3d?.sparkle(c.x, c.y, 0xb9a8ff, 40);
    };
  }

  function priceTag(price: number) {
    return h('span', { class: 'price' }, '🪙 ', String(price));
  }

  function offerButton(o: Offer) {
    if (o.sold) return h('button', { class: 'btn small', disabled: true }, '✔ Comprado');
    const ok = canBuy(run, o);
    let label = 'Comprar ';
    if (!ok) label = run.bits < o.price ? 'Te falta oro ' : o.kind === 'daemon' ? 'No caben más ' : 'Bolsa llena ';
    return h('button', {
      class: 'btn small buy',
      disabled: !ok,
      onclick: (e: Event) => {
        const btn = e.currentTarget as HTMLElement;
        const card = btn.closest('.card') as HTMLElement;
        const rect = card.getBoundingClientRect();
        const ghost = card.cloneNode(true) as HTMLElement;
        const c = center(btn);
        if (!buy(run, o)) return;
        sfx.buy();
        s3d?.coins(c.x, c.y, 6 + o.price);
        changed();
        flyCard(ghost, rect, o.kind === 'daemon' ? '.mine .slot.filled' : '.bag .bag-slot.filled');
      },
    }, label, priceTag(o.price));
  }

  function letterPicker(uid: number, at: { x: number; y: number }) {
    const def = CONSUMABLE_BY_ID[run.consumables.find((c) => c.uid === uid)!.id];
    const color = def.letterMod === 'gold' ? 0xffd23f : def.letterMod === 'ignite' ? 0xff9248 : 0x4cc9ff;
    modal = h('div', { class: 'overlay' },
      h('div', { class: 'panel center pop-in' },
        h('div', { class: 'card-icon big float-icon' }, def.icon),
        h('h2', null, def.name),
        h('p', null, markup(def.desc)),
        h('p', { class: 'muted small' }, 'Consejo: las vocales (A, E, O) salen en casi todas las palabras.'),
        h('div', { class: 'alphabet' },
          ...ALPHABET.map((c) => {
            const m = run.letterMods[c];
            const tag = m ? `${'💪'.repeat(m.chrome)}${'🪙'.repeat(m.gold)}${'🔥'.repeat(m.ignite)}` : '';
            return h('button', {
              class: 'key',
              onclick: (e: Event) => {
                const p = center(e.currentTarget as Element);
                useConsumable(run, uid, c);
                modal = null;
                sfx.buy();
                s3d?.sparkle(p.x, p.y, color, 70);
                s3d?.sparkle(at.x, at.y, color, 40);
                changed();
              },
            }, c.toUpperCase(), tag ? h('small', null, tag) : null);
          }),
        ),
        h('button', { class: 'btn ghost', onclick: () => { modal = null; render(); } }, 'Cancelar'),
      ),
    );
    render();
  }

  function packPicker(ids: string[], at: { x: number; y: number }) {
    onSeen(ids);
    s3d?.sparkle(at.x, at.y, 0xe27bff, 120);
    s3d?.spin();
    modal = h('div', { class: 'overlay' },
      h('div', { class: 'panel center wide pop-in' },
        h('h2', null, '🎁 Cofre sorpresa: elige 1 amuleto'),
        h('div', { class: 'cards center reveal' },
          ...ids.map((id, i) => {
            const c = daemonCard(id, undefined, h('button', {
              class: 'btn small primary',
              onclick: (e: Event) => {
                const card = (e.currentTarget as HTMLElement).closest('.card') as HTMLElement;
                const rect = card.getBoundingClientRect();
                const ghost = card.cloneNode(true) as HTMLElement;
                addDaemon(run, id);
                modal = null;
                sfx.buy();
                changed();
                flyCard(ghost, rect, '.mine .slot.filled');
              },
            }, 'Me lo quedo'));
            c.style.setProperty('--i', String(i));
            return c;
          }),
        ),
        h('button', { class: 'btn ghost', onclick: () => { modal = null; changed(); } }, 'No quiero ninguno'),
      ),
    );
    render();
  }

  // Inclinación 3D de las tarjetas al pasar el ratón
  function tilt(container: HTMLElement) {
    if (!fx) return container;
    container.addEventListener('mousemove', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--rx', `${(0.5 - py) * 14}deg`);
      card.style.setProperty('--ry', `${(px - 0.5) * 16}deg`);
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
    });
    container.addEventListener('mouseout', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
      if (card && !card.contains(e.relatedTarget as Node)) {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      }
    });
    return container;
  }

  function cardsRow(cls: string, cards: (HTMLElement | null)[]) {
    let i = 0;
    for (const c of cards) if (c) c.style.setProperty('--i', String(i++));
    return tilt(h('div', { class: `cards ${cls}` }, ...cards));
  }

  function render() {
    onSeen(shop.daemons.map((o) => o.id));
    const r = shop.reward;
    const boss = BOSSES[bossOf(run, run.node)];
    const hp = hpPerEnemy(run);
    const bossNext = isBossSector(run);

    // ── Cabecera: título + oro ──
    goldEl = h('span', null, String(shownGold));
    const header = h('header', { class: 'shop-header' },
      h('div', null,
        h('h2', { class: 'shop-title' }, h('span', { class: 'float-icon' }, '🛒'), ' Tienda del mercader'),
        r ? h('p', { class: 'shop-reward' }, '✨ ¡Oleada superada! ', h('b', { class: 'c-bits' }, `+${r.total} de oro`),
          h('span', { class: 'muted' }, ` · ${r.base} por la oleada · ${r.integrity} por tu vida${r.interest ? ` · ${r.interest} de intereses` : ''}`)) : null,
      ),
      h('div', { class: 'gold-box' },
        h('div', { class: 'gold-big' }, h('span', { class: 'coin-spin' }, '🪙'), ' ', goldEl),
        h('small', { class: 'muted' }, '🐷 +1 por cada 5 que guardes'),
      ),
    );

    // ── Columna principal: lo que se puede comprar ──
    const packCard = shop.pack
      ? h('div', { class: 'card pack' },
          h('div', { class: 'card-icon float-icon' }, '🎁'),
          h('div', { class: 'card-name' }, 'Cofre sorpresa'),
          h('div', { class: 'card-desc' }, 'Elige 1 de 3 amuletos al azar. ¡Puede salir uno ', h('b', { class: 'legend-text' }, 'Legendario'), '!'),
          h('div', { class: 'pill' }, 'Sorpresa'),
          shop.pack.sold
            ? h('button', { class: 'btn small', disabled: true }, '✔ Abierto')
            : h('button', {
                class: 'btn small buy',
                disabled: run.bits < shop.pack.price || run.daemons.length >= MAX_DAEMONS,
                onclick: (e: Event) => {
                  const p = center(e.currentTarget as Element);
                  const ids = openPack(run);
                  if (!ids) return;
                  onChange();
                  s3d?.coins(p.x, p.y, 8);
                  packPicker(ids, p);
                },
              }, 'Abrir ', priceTag(shop.pack.price)),
        )
      : null;

    const rerollBtn = h('button', {
      class: 'btn small ghost reroll',
      disabled: run.bits < shop.rerollCost,
      onclick: (e: Event) => {
        const p = center(e.currentTarget as Element);
        if (!reroll(run)) return;
        sfx.buy();
        s3d?.spin();
        s3d?.sparkle(p.x, p.y, 0x4cc9ff, 60);
        dealing = true;
        changed();
        dealing = false;
      },
    }, h('span', { class: 'reroll-icon' }, '🔄'), ' Cambiar artículos ', priceTag(shop.rerollCost));

    const offers = h('section', { class: 'panel shop-offers' },
      h('div', { class: 'section-head' }, h('h3', null, 'Comprar'), rerollBtn),
      h('div', { class: 'sub-head' }, h('span', null, '🔮 Amuletos'), h('small', null, 'te dan poder en cada hechizo')),
      cardsRow('shop-grid offers', [...shop.daemons.map((o) => daemonCard(o.id, undefined, offerButton(o))), packCard]),
      h('div', { class: 'sub-head' }, h('span', null, '🧪 Pociones y runas'), h('small', null, 'mejoras para toda la partida')),
      cardsRow('shop-grid offers', shop.consumables.map((o) => consumableCard(o.id, offerButton(o)))),
    );

    // Detalles: sólo si los pides
    const mods = Object.entries(run.letterMods).filter(([, m]) => m.chrome + m.gold + m.ignite > 0);
    const details = h('details', { class: 'panel details', open: detailsOpen, ontoggle: (e: Event) => { detailsOpen = (e.target as HTMLDetailsElement).open; } },
      h('summary', null, '📖 Ver detalles: tamaños de palabra y runas'),
      h('table', { class: 'table' },
        h('tr', null, h('th', null, 'Palabra'), h('th', null, 'Letras'), h('th', null, 'Nivel'), h('th', null, 'Poder'), h('th', null, 'Magia')),
        ...FORMAT_ORDER.map((f) => {
          const lv = run.formatLevels[f];
          const v = formatValues(f, lv);
          return h('tr', null, h('td', null, FORMATS[f].name), h('td', { class: 'muted' }, FORMATS[f].range), h('td', null, String(lv)), h('td', { class: 'c-bytes' }, String(v.bytes)), h('td', { class: 'c-mult' }, String(v.mult)));
        }),
      ),
      h('p', { class: 'small muted' }, 'Además cada letra suma Poder: las comunes 1, las raras (K, W, X) hasta 5.'),
      mods.length
        ? h('p', { class: 'small' }, 'Tus runas: ', ...mods.map(([c, m]) => h('span', { class: 'tag' }, `${c.toUpperCase()} ${'💪'.repeat(m.chrome)}${'🪙'.repeat(m.gold)}${'🔥'.repeat(m.ignite)}`)))
        : null,
    );

    // ── Barra lateral: lo que viene, tu equipo y luchar ──
    const rows = (['media', 'larga'] as FormatId[]).map((f) => {
      const d = estimate(run, f);
      const hits = Math.ceil(hp / Math.max(1, d));
      return h('div', { class: `ready-row ${hits <= 1 ? 'ok' : hits === 2 ? 'warn' : 'bad'}` },
        h('span', null, `Palabra ${FORMATS[f].name.toLowerCase()}`),
        h('b', null, num(d)),
        h('span', { class: 'verdict' }, hits <= 1 ? '✅' : `⚠️ ×${hits}`),
      );
    });
    const next = h('section', { class: `panel side-card next${bossNext ? ' boss' : ''}` },
      h('div', { class: 'side-head' }, h('h3', null, '🔮 Lo que viene'), h('span', { class: 'muted small' }, `Reino ${run.node}${run.infinite ? '' : `/${FINAL_NODE}`} · ${SECTOR_NAMES[run.sector]}`)),
      h('div', { class: 'next-hp' }, 'Monstruos con ', h('b', null, `${num(hp)} de vida`)),
      h('div', { class: 'ready-title muted small' }, 'Tu daño con palabra perfecta:'),
      ...rows,
      bossNext
        ? h('div', { class: 'boss-mini' }, h('span', null, boss.icon), h('div', null, h('b', null, `¡Jefe: ${boss.name}!`), h('small', null, boss.desc)))
        : h('div', { class: 'boss-later muted small' }, `${boss.icon} Jefe de este reino: ${boss.name}`),
    );

    const slots = Array.from({ length: MAX_DAEMONS }, (_, i) => {
      const d = run.daemons[i];
      if (!d) return h('div', { class: 'slot empty' }, h('span', { class: 'slot-num' }, String(i + 1)), h('span', { class: 'slot-plus' }, '+'));
      const def = DAEMON_BY_ID[d.id];
      return h('div', { class: `slot filled r-${def.rarity}`, tabindex: 0, 'data-uid': d.uid },
        h('span', { class: 'slot-num' }, String(i + 1)),
        h('div', { class: 'slot-icon' }, def.icon),
        h('div', { class: 'slot-name' }, def.name),
        h('div', { class: 'slot-pop' },
          h('b', null, `${def.icon} ${def.name}`),
          h('div', { class: 'slot-desc' }, markup(def.desc(d))),
          h('div', { class: 'row tight' },
            h('button', { class: 'btn small ghost', title: 'Mover a la izquierda', disabled: i === 0, onclick: () => { moveDaemon(run, d.uid, -1); changed(); } }, '◀'),
            h('button', { class: 'btn small ghost', title: 'Mover a la derecha', disabled: i === run.daemons.length - 1, onclick: () => { moveDaemon(run, d.uid, 1); changed(); } }, '▶'),
            h('button', {
              class: 'btn small danger',
              onclick: (e: Event) => {
                const slot = (e.currentTarget as HTMLElement).closest('.slot') as HTMLElement;
                const p = center(slot);
                sell(run, d.uid);
                sfx.coin();
                s3d?.coins(p.x, p.y, 10, true);
                if (fx) {
                  const ghost = slot.cloneNode(true) as HTMLElement;
                  const rc = slot.getBoundingClientRect();
                  ghost.classList.add('ghost-card');
                  Object.assign(ghost.style, { left: `${rc.left}px`, top: `${rc.top}px`, width: `${rc.width}px`, height: `${rc.height}px` });
                  document.body.append(ghost);
                  ghost.animate([{ opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(1.3) translateY(-30px)', filter: 'blur(8px)' }], { duration: 450, easing: 'ease-out' }).onfinish = () => ghost.remove();
                }
                changed();
              },
            }, 'Vender ', priceTag(sellPrice(run, d.uid))),
          ),
        ),
      );
    });
    const team = h('section', { class: 'panel side-card mine' },
      h('div', { class: 'side-head' }, h('h3', null, '🛡️ Tus amuletos'), h('span', { class: 'muted small' }, `${run.daemons.length} de ${MAX_DAEMONS}`)),
      h('div', { class: 'slots' }, ...slots),
      h('p', { class: 'muted tiny' }, run.daemons.length ? 'Pasa el ratón por uno para verlo, moverlo o venderlo. Se activan en orden 1 → 5.' : 'Aún no tienes amuletos: compra alguno a la izquierda.'),
    );

    const bagSlots = Array.from({ length: MAX_CONSUMABLES }, (_, i) => {
      const c = run.consumables[i];
      if (!c) return h('div', { class: 'bag-slot empty' }, h('span', { class: 'slot-plus' }, '+'));
      const def = CONSUMABLE_BY_ID[c.id];
      return h('div', { class: 'bag-slot filled', title: def.desc.replace(/\[\/?\w?\]/g, '') },
        h('div', { class: 'slot-icon' }, def.icon),
        h('div', { class: 'bag-name' }, def.name),
        h('button', {
          class: 'btn small primary',
          onclick: (e: Event) => {
            const p = center(e.currentTarget as Element);
            if (def.kind === 'script') letterPicker(c.uid, p);
            else {
              useConsumable(run, c.uid);
              sfx.buy();
              s3d?.sparkle(p.x, p.y, 0x4cc9ff, 80);
              changed();
            }
          },
        }, 'Usar'),
      );
    });
    const bag = h('section', { class: 'panel side-card bag' },
      h('div', { class: 'side-head' }, h('h3', null, '🎒 Tu bolsa'), h('span', { class: 'muted small' }, `${run.consumables.length} de ${MAX_CONSUMABLES}`)),
      h('div', { class: 'bag-slots' }, ...bagSlots),
    );

    const fight = h('div', { class: 'side-fight' },
      h('div', { class: 'life-line' }, '❤️ Vida de la torre', h('b', null, `${run.integrity}/${run.maxIntegrity}`)),
      h('button', { class: 'btn primary big fight', onclick: () => go() }, '¡A luchar! ▶', h('small', null, ' Enter')),
    );

    root.replaceChildren(
      h('div', { class: `screen shop v2${firstRender && fx ? ' enter' : ''}${dealing && fx ? ' deal' : ''}${leaving ? ' leaving' : ''}` },
        header,
        h('div', { class: 'shop-layout' },
          h('main', { class: 'shop-main' }, coachBox, offers, details),
          h('aside', { class: 'shop-side' }, next, team, bag, fight),
        ),
        modal,
      ),
    );
    if (firstRender) setTimeout(animateGold, fx ? 500 : 0);
    else animateGold();
    firstRender = false;
  }

  async function go() {
    if (leaving) return;
    leaving = true;
    cleanup();
    root.querySelector('.screen.shop')?.classList.add('leaving');
    await s3d?.outro();
    closeShop();
    onContinue();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !modal) void go();
  }
  function cleanup() {
    window.removeEventListener('keydown', onKey);
  }
  function closeShop() {
    closed = true;
    cancelAnimationFrame(goldTimer);
    s3d?.destroy();
    s3d = null;
    document.body.classList.remove('has-3d');
    document.querySelectorAll('.ghost-card').forEach((g) => g.remove());
  }
  window.addEventListener('keydown', onKey);
  render();
  if (!coach('shop') && run.bits >= 5) coach('interest');
  return {
    destroy: () => {
      cleanup();
      closeShop();
    },
  };
}
