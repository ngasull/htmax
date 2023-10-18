// Const

export const win = window;
export const doc = document;
export const head = doc.head;
export const body = doc.body;

export const textHtml = "text/html";

export const routeLoadEvent = "route-load";
export const routeFormEvent = "route-form";
export const submit = "submit";

// FP

export const call = <T>(cb: () => T): T => cb();

type DoMatch = {
  <T, M extends { [K in string | number]: (k: K) => T }>(
    k: string | number,
    matchers: M,
    cb: () => T,
  ): T;
  <T, M extends { [K in string | number]: (k: K) => T }>(
    k: string | number,
    matchers: M,
  ): T | undefined;
};

export const doMatch: DoMatch = <
  T,
  M extends { [K in string | number]: (k: K) => T },
>(
  k: string | number,
  matchers: M,
  cb = (): undefined => {},
): T | undefined => (matchers[k] ?? cb)(k as never);

export const forEach = <T>(iterable: Iterable<T>, cb: (item: T) => unknown) => {
  for (let i of iterable) cb(i);
};

export const id = <T>(v: T): T => v;

export const length = (lengthy: { length: number }) => lengthy.length;

export const makeCache = <K extends object, V>() => {
  let cache = new WeakMap<K, V>();
  return (k: K, init: () => V): V => (
    !cache.has(k) && cache.set(k, init()), cache.get(k)!
  );
};

export const popR = <T>(arr: T[]) => (arr.pop(), arr);

export const pushR = <T>(arr: T[], ...v: T[]) => (arr.push(...v), arr);

export const startsWith = (str: string, start: string) => str.startsWith(start);

export const toLowerCase = (str: string) => str.toLowerCase();

export const { Promise } = win;

export const {
  assign,
  // entries,
  keys,
  values,
} = Object;

// DOM

const domParser = new DOMParser();

export const parseHtml = (html: string) =>
  cloneNode(domParser.parseFromString(html, textHtml));

export const cloneNode = <T extends Node>(node: T) => node.cloneNode(true) as T;

export const dataset = (el: HTMLElement | SVGElement) => el.dataset;

export const dispatchPrevented = (
  el: EventTarget,
  type: string,
  event = new Event(type, { bubbles: true, cancelable: true }),
) => (el.dispatchEvent(event), event.defaultPrevented);

export const ifDef = <T, U>(v: T, cb: (v: NonNullable<T>) => U) =>
  v == null ? (v as Exclude<T, NonNullable<T>>) : cb(v);

export const insertBefore = (parent: Node, node: Node, child: Node | null) =>
  parent.insertBefore(node, child);

export const newURL = (url: string | URL, base?: string | URL | undefined) =>
  new URL(url, base);

export const preventDefault = (e: Event) => e.preventDefault();

export const querySelector = <E extends Element>(
  selector: string,
  node: ParentNode = body,
) => node.querySelector<E>(selector);

export const querySelectorAll = <E extends Element>(
  selector: string,
  node: ParentNode = body,
) => node.querySelectorAll<E>(selector);

export const remove = (el: ChildNode) => el.remove();

export const replaceWith = (el: ChildNode, node: Node | string) =>
  el.replaceWith(node);

type ListenerOfAddEvent<T extends EventTarget | Window, K extends string> = (
  this: T,
  e: T extends Window
    ? K extends keyof WindowEventMap
      ? WindowEventMap[K]
      : Event
    : K extends keyof HTMLElementEventMap
    ? HTMLElementEventMap[K]
    : Event,
) => void;

export const subEvent = <
  K extends string,
  T extends (EventTarget | Window) & {
    addEventListener(type: K, listener: ListenerOfAddEvent<T, K>): void;
    removeEventListener(type: K, listener: ListenerOfAddEvent<T, K>): void;
  },
>(
  target: T,
  type: K,
  listener: ListenerOfAddEvent<T, K>,
) => {
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
};
