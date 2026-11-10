// Pequeñas utilidades para construir HTML sin framework.
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> | null;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Convierte [b]…[/] [m]…[/] [x]…[/] [g]…[/] en texto con los colores fijos del juego. */
export function markup(text: string): HTMLSpanElement {
  const html = escapeHtml(text).replace(/\[(b|m|x|g)\](.*?)\[\/\]/g, (_, k, inner) => {
    const cls = { b: 'c-bytes', m: 'c-mult', x: 'c-xmult', g: 'c-bits' }[k as 'b' | 'm' | 'x' | 'g'];
    return `<span class="${cls}">${inner}</span>`;
  });
  return h('span', { html });
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('es-ES');
}

export function dec(n: number, d = 2): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: d });
}

export function toast(text: string, kind: 'info' | 'good' = 'info') {
  const el = h('div', { class: `toast toast-${kind}` }, text);
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3200);
}
