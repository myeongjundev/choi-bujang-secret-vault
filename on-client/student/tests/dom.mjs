export class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.text = ''; this.attributes = {}; this.listeners = {}; this.value = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.text = ''; this.children = children; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('\n'); }
  set innerHTML(_) { throw Error('HTML sink forbidden'); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  dispatch(type) { if (!this.disabled) return this.listeners[type]?.({ target: this }); }
  all(predicate) { return [this, ...this.children.flatMap(child => child.all(predicate))].filter(predicate); }
}
export const document = { createElement: tag => new Element(tag) };
