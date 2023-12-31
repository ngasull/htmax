/// <reference path="./importMeta.d.ts" />

import { lifecycleTrackChildren, lifecycleUntrack } from "./lifecycle.ts";
import {
  Promise,
  adoptNode,
  call,
  customEvent,
  dataset,
  dispatchPrevented,
  doMatch,
  doc,
  forEach,
  forOf,
  head,
  newURL,
  parseHtml,
  preventDefault,
  querySelector,
  querySelectorAll,
  replaceWith,
  routeFormEvent,
  routeLoadEvent,
  startsWith,
  subEvent,
  submit,
  win,
} from "./util.ts";

declare global {
  interface Window {
    __htmax?: (() => void)[];
  }
}

const suspenseDelay = 500;
const routeAttr = "route";
const dataRoute = `data-${routeAttr}`;
const routeIndexParam = "_index";
const routeLayoutParam = "_layout";

let routeRequests: Record<string, Promise<Document> | 0 | undefined> = {};

const findObsolete = (
  url: string,
  parent?: HTMLElement,
  path = "",
): [string[], HTMLElement] | null => {
  let routeEl = querySelector<HTMLElement>(`[${dataRoute}]`, parent),
    subPath = routeEl ? path + dataset(routeEl)[routeAttr] : path;
  return routeEl
    ? startsWith(url, subPath)
      ? findObsolete(url, routeEl, subPath)
      : [
          startsWith(subPath, url)
            ? // Only index needed
              [url]
            : // Subpaths starting from `path`
              url
                .slice(path.length)
                .split("/")
                .map((_, i, arr) => path + arr.slice(0, i + 1).join("/")),
          routeEl,
        ]
    : parent
    ? [[url], parent] // No layout to replace; parent is the page to replace
    : routeEl;
};

const handleLocationChange = async () => {
  let { pathname, search } = location,
    obsolete = findObsolete(pathname);

  // Fallback to regular navigation if page defines no route
  if (!obsolete) return location.replace(pathname + search);

  let [missingPartials, slot] = obsolete,
    curSlot = slot as HTMLElement | null | undefined,
    searchParams = new URLSearchParams(search),
    resEls: Promise<Document>[],
    el: Document;

  searchParams.append(routeIndexParam, "");

  await Promise.race([
    new Promise<undefined>((resolve) => setTimeout(resolve, suspenseDelay)),
    Promise.all(
      (resEls = missingPartials.map(
        (url, i, q: any) =>
          (routeRequests[url] ||= q =
            fetch(
              `${url}?${
                i == missingPartials.length - 1
                  ? searchParams
                  : routeLayoutParam
              }`,
            )
              .then((res) =>
                res.redirected ? Promise.reject(navigate(res.url)) : res.text(),
              )
              .then((html) =>
                q == routeRequests[url] ? parseHtml(html) : Promise.reject(),
              )
              .finally(() => (routeRequests[url] = 0))),
      )),
    ),
  ]);

  for await (el of resEls) {
    if (!(curSlot = processHtmlRoute(el, curSlot!))) break;
  }

  dispatchPrevented(slot, customEvent(routeLoadEvent));
};

const processHtmlRoute = (receivedDoc: Document, slot: HTMLElement) => {
  let handleResource =
      <A extends string>(el: HTMLElement & Record<A, string>, srcAttr: A) =>
      (tagName: string, src?: string) => {
        if (
          (src = el[srcAttr]) &&
          !querySelector(`${tagName}[${srcAttr}="${src}"]`, head)
        ) {
          head.append(adoptNode(el));
        }
      },
    content = adoptNode(receivedDoc.body.children[0]);

  forEach(
    querySelectorAll<HTMLTemplateElement>(`template[data-head]`, receivedDoc),
    (headEl) => {
      forOf(headEl.content.children, (el) =>
        doMatch(el.tagName, {
          TITLE() {
            doc.title = (el as HTMLTitleElement).text;
          },
          LINK: handleResource(el as HTMLLinkElement, "href"),
          SCRIPT: handleResource(el as HTMLScriptElement, "src"),
        }),
      );
      headEl.remove();
    },
  );

  lifecycleUntrack(slot);
  replaceWith(slot, content);
  lifecycleTrackChildren(content);

  return querySelector<HTMLElement>(`[${dataRoute}]`, content);
};

export const navigate = (path: string) => {
  let origin = location.origin,
    url = newURL(path, origin),
    navigated = url.origin == origin;
  if (navigated) {
    history.pushState(0, "", url);
    handleLocationChange();
  }
  return navigated;
};

export const register = (root = doc.body) => {
  let t: EventTarget | null;

  win.__htmax ??= [
    subEvent(
      root,
      "click",
      (e) =>
        !e.ctrlKey &&
        !e.shiftKey &&
        (t = e.target) instanceof HTMLAnchorElement &&
        navigate(t.href) &&
        preventDefault(e),
    ),

    subEvent(
      root,
      submit,
      (e) =>
        (t = e.target) instanceof HTMLFormElement &&
        t.method == "get" &&
        !dispatchPrevented(t, customEvent(routeFormEvent)) &&
        navigate(t.action) &&
        preventDefault(e),
    ),

    subEvent(win, "popstate", handleLocationChange),

    ...[...querySelectorAll(`[${dataRoute}]`)]
      .map(lifecycleTrackChildren)
      .reverse(),
  ];
};

export const unregister = () => {
  routeRequests = {};
  win.__htmax?.map(call);
  delete win.__htmax;
};
