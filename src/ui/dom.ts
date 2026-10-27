/**
 * Tiny DOM helpers used by the interface layer.
 * Kept deliberately small so the UI stays plain, dependency-free TypeScript.
 */

export type Attrs = Record<string, string | number | boolean | undefined | null>;

/** Creates an element with attributes, classes and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key.startsWith('data-')) node.setAttribute(key, String(value));
    else if (key === 'style') node.setAttribute('style', String(value));
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): HTMLElement {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function frag(...children: (Node | string | null | undefined)[]): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const child of children) {
    if (child === null || child === undefined) continue;
    f.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return f;
}

export function on<K extends keyof HTMLElementEventMap>(
  node: HTMLElement,
  event: K,
  handler: (ev: HTMLElementEventMap[K]) => void,
): void {
  node.addEventListener(event, handler);
}

/** A bar element showing a 0..1 ratio. */
export function bar(ratio: number, kind = ''): HTMLElement {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  const wrap = el('div', { class: `bar ${kind}`.trim() });
  wrap.appendChild(el('span', { style: `width:${pct}%` }));
  return wrap;
}

/** A labelled key/value line. */
export function kv(label: string, value: string | Node, cls = ''): HTMLElement {
  return el('div', { class: 'kv' }, [
    el('span', { text: label }),
    typeof value === 'string' ? el('span', { class: cls, text: value }) : el('span', { class: cls }, [value]),
  ]);
}

/** A tag chip. */
export function tag(text: string, kind = ''): HTMLElement {
  return el('span', { class: `tag ${kind}`.trim(), text });
}

/** A section with a heading. */
export function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return el('div', { class: 'section' }, [
    el('h3', { text: title }),
    ...children.filter(Boolean) as Node[],
  ]);
}

/** Convenience: a button. */
export function button(
  label: string,
  onClick: () => void,
  cls = '',
  disabled = false,
): HTMLButtonElement {
  const b = el('button', { class: `btn ${cls}`.trim(), type: 'button', disabled });
  b.textContent = label;
  if (!disabled) b.addEventListener('click', onClick);
  return b;
}

/**
 * A lightweight tooltip attached to the document body.
 * Elements opt in with `data-tip` (and optionally `data-tip-title`).
 */
export class Tooltip {
  private node: HTMLElement;
  private target: HTMLElement | null = null;

  constructor() {
    this.node = el('div', { class: 'tip hidden' });
    document.body.appendChild(this.node);
    document.addEventListener('mousemove', (ev) => this.onMove(ev as MouseEvent));
    document.addEventListener('mouseover', (ev) => this.onOver(ev as MouseEvent));
    document.addEventListener('mouseout', () => this.hide());
  }

  private onOver(ev: MouseEvent): void {
    const target = (ev.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (!target) {
      this.hide();
      return;
    }
    this.target = target;
    const title = target.getAttribute('data-tip-title');
    const body = target.getAttribute('data-tip') ?? '';
    clear(this.node);
    if (title) this.node.appendChild(el('b', { text: title }));
    this.node.appendChild(el('div', { text: body }));
    this.node.classList.remove('hidden');
  }

  private onMove(ev: MouseEvent): void {
    if (!this.target) return;
    const pad = 14;
    const rect = this.node.getBoundingClientRect();
    let x = ev.clientX + pad;
    let y = ev.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = ev.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = ev.clientY - rect.height - pad;
    this.node.style.left = `${Math.max(4, x)}px`;
    this.node.style.top = `${Math.max(4, y)}px`;
  }

  hide(): void {
    this.target = null;
    this.node.classList.add('hidden');
  }
}
