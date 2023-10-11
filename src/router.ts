/// <reference path="./importMeta.d.ts" />

declare global {
  interface Window {
    __htmax?: (() => void)[];
  }
}

const suspenseDelay = 500;
const routeAttr = "route";
const dataRoute = `data-${routeAttr}`;
const routeFromParam = "_routefrom";

const doc = document;

let routeRequests: Record<string, undefined | 0 | Promise<unknown>> = {};

const findObsoleteRoute = (
  url: string,
  parent?: HTMLElement,
  path = "",
): [string, HTMLElement] | null => {
  let routeEl = (parent || doc).querySelector<HTMLElement>(`[${dataRoute}]`),
    subPath = routeEl ? path + routeEl.dataset[routeAttr] : path;
  return parent
    ? routeEl
      ? url.startsWith(subPath)
        ? findObsoleteRoute(url, routeEl, subPath)
        : subPath.startsWith(url)
        ? [subPath.slice(0, url.length), routeEl]
        : [subPath, parent]
      : [path, parent]
    : routeEl && findObsoleteRoute(url, routeEl, subPath);
};

const currentUrl = () => location.pathname + location.search;

const handleLocationChange = () => {
  let url = currentUrl(),
    fromRoute = findObsoleteRoute(url);

  // Fallback to regular navigation if page defines no route
  if (!fromRoute) return location.replace(url);

  let [fromPath, slot] = fromRoute,
    curSlot = slot as HTMLElement | null | undefined,
    search = new URLSearchParams(location.search),
    q: Promise<unknown>,
    streamQ: Promise<unknown>,
    action,
    actions: null | ((slot: HTMLElement) => HTMLElement | null | undefined)[] =
      [];

  search.append(routeFromParam, fromPath);

  q = routeRequests[url] ||= fetch(`${url}?${search}`)
    .then(async (res) => {
      await (res.redirected
        ? Promise.reject(navigate(res.url))
        : Promise.race([
            (streamQ = (async () => {
              for await (action of responseActions(url, res.body!)) {
                if (actions) {
                  actions.push(action);
                } else if (!curSlot || !(curSlot = action(curSlot))) {
                  break;
                }
              }
              return 1;
            })()),
            new Promise<undefined>((resolve) =>
              setTimeout(resolve, suspenseDelay),
            ),
          ]));

      for (action of actions!)
        if (q == routeRequests[url] && curSlot) curSlot = action(curSlot);
      actions = 0 as unknown as null;

      await streamQ;

      slot.dispatchEvent(new Event("route-load", { bubbles: true }));
    })
    .finally(() => (routeRequests[url] = 0));
};

async function* responseActions(url: string, body: ReadableStream<Uint8Array>) {
  let decoder = new TextDecoder(),
    reader = body.getReader(),
    len = 0,
    lenLen: number,
    match,
    html = "",
    r;

  while (!(r = await reader.read()).done) {
    if (currentUrl() != url) return;
    html += decoder.decode(r.value);

    while ((match = html.match(/^(\d*[1-9])[^0-9]/))) {
      len = parseInt(match[1]);
      lenLen = match[1].length;

      if (html.length < len + lenLen) break;

      yield processHtmlRoute(html.slice(lenLen, lenLen + len));
      html = html.slice(lenLen + len);
    }
  }
  if (html) yield processHtmlRoute(html);
}

const dom = new DOMParser();

const processHtmlRoute = (html: string) => (slot: HTMLElement) => {
  let receivedEl;
  for (receivedEl of doc.importNode<HTMLElement>(
    dom.parseFromString(html, "text/html").body,
    true,
  ).children as HTMLCollectionOf<HTMLElement>) {
    if (receivedEl.tagName == "HEAD") {
      for (receivedEl of receivedEl.children as HTMLCollectionOf<HTMLElement>) {
        switch (receivedEl.tagName) {
          case "TITLE":
            doc.title = receivedEl.textContent!;
            break;
          default:
            doc.head.append(receivedEl);
        }
      }
    } else {
      slot.replaceWith(receivedEl);
      return receivedEl.querySelector<HTMLElement>(`[${dataRoute}]`);
    }
  }
};

export const navigate = (path: string) => {
  let origin = location.origin,
    url = new URL(path, origin),
    navigated = url.origin == origin;
  if (navigated) {
    history.pushState(0, "", url);
    handleLocationChange();
  }
  return navigated;
};

type ListenerOfAddEvent<
  T extends EventTarget | Window,
  K extends keyof HTMLElementEventMap | keyof WindowEventMap,
> = (
  this: T,
  e: T extends Window
    ? K extends keyof WindowEventMap
      ? WindowEventMap[K]
      : never
    : K extends keyof HTMLElementEventMap
    ? HTMLElementEventMap[K]
    : never,
) => void;

const subEvent = <
  K extends keyof HTMLElementEventMap | keyof WindowEventMap,
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

export const register = (root = doc.body) => {
  window.__htmax ??= [
    subEvent(root, "click", (e) => {
      let a = e.target;
      if (
        !e.ctrlKey &&
        !e.shiftKey &&
        a instanceof HTMLAnchorElement &&
        navigate(a.href)
      ) {
        e.preventDefault();
      }
    }),

    subEvent(root, "submit", (e) => {
      let f = e.target;
      if (
        f instanceof HTMLFormElement &&
        f.action &&
        f.method == "get" &&
        navigate(f.action)
      ) {
        e.preventDefault();
      }
    }),

    subEvent(window, "popstate", handleLocationChange),
  ];
};

export const unregister = () => {
  routeRequests = {};
  window.__htmax?.map((cleanup) => cleanup());
  delete window.__htmax;
};
