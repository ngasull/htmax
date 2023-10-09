/// <reference path="./importMeta.d.ts" />

declare global {
  interface Window {
    __htmax?: (() => void)[];
  }
}

type LocationInfo = { pathname: string; search: string; hash: string };

const segmentAttr = "route";

const doc = document;

const locationInfo = ({
  pathname,
  search,
  hash,
}: Location = location): LocationInfo => ({ pathname, search, hash });

let prevLocation: LocationInfo = locationInfo();
let routeRequests: Record<string, undefined | 0 | Promise<unknown>> = {};

// const getParent = (el: { parentElement: HTMLElement }) => el.parentElement;

// const hasParent = getParent as unknown as <T extends Element>(
//   el: T,
// ) => el is T & { parentElement: HTMLElement };

// const isParentOf = (el: Element, parent: Element): boolean =>
//   el == parent || (hasParent(el) && isParentOf(getParent(el), parent));

// const findUriElement = (uri: URI): HTMLElement | 0 | void => {
//   let segments = uri.split("/").slice(1),
//     routeEls = doc.querySelectorAll(`[data-${segmentAttr}]`),
//     cur: HTMLElement | 0 = 0,
//     el;

//   for (el of routeEls) {
//     if (!cur || isParentOf(el, cur)) {
//       if (!segments.length || el.segment != segments.shift()) return el;
//       cur = el;
//     }
//   }
// };

const dom = new DOMParser();

const locationSegments = (l: LocationInfo) => {
  let segments = l.pathname.split("/");
  if (l.search) segments.push(l.search);
  return segments;
};

const queryRouteEls = () => doc.querySelectorAll(`[data-${segmentAttr}]`);

const handleLocationChange = async () => {
  // Fallback to regular navigation if page defines no route
  if (!queryRouteEls().length) return location.replace(location.href);

  let prevSegments = locationSegments(prevLocation),
    segments = locationSegments(location),
    differentFrom = segments.findIndex((s, i) => s != prevSegments[i]),
    missingFrom =
      differentFrom < 0
        ? segments.length < prevSegments.length
          ? segments.length - 1 // Moved up: fetch last segment
          : location.hash == prevLocation.hash
          ? 0 // Requested same location: perform all segments refresh
          : differentFrom // = -1 / Same location, different hash
        : differentFrom,
    missing = (missingFrom < 0 ? [] : segments.slice(missingFrom)).map((_, j) =>
      segments.slice(0, missingFrom + j + 1),
    ),
    q: 0 | Promise<unknown> = 0,
    el;

  routeRequests = {};
  for (let m of missing) {
    let url = m.join("/"),
      prevQ = q,
      curQ =
        (q =
        routeRequests[url] =
          fetch(url, { redirect: "manual" })
            .then(async (res) => {
              if (curQ == routeRequests[url]) {
                // Await for previous area replacement in order to find next/nested area to replace
                await prevQ;

                if (res.status == 303)
                  // Redirect
                  return navigate(res.headers.get("Location") || "/");

                for (el of dom.parseFromString(await res.text(), "text/html")
                  .body.children) {
                  if (el.tagName == "HEAD") {
                    for (el of el.children) {
                      switch (el.tagName) {
                        case "TITLE":
                          doc.title = el.textContent!;
                          break;
                        // case "META": break
                        default:
                          doc.head.append(el);
                      }
                    }
                  } else {
                    // Ensure we preserve the route segment pivot
                    (el as HTMLElement).dataset[segmentAttr] = "";
                    // length - 1 = index
                    // length - 2 = index without root ("")
                    queryRouteEls()[m.length - 2]?.replaceWith(
                      document.importNode(el, true),
                    );
                  }
                }
              }
            })
            .finally(() => {
              if (curQ == routeRequests[url]) routeRequests[url] = 0;
            }));
  }
};

export const navigate = (path: string) => {
  let origin = location.origin,
    url = new URL(path, origin),
    navigated = url.origin == origin;
  if (navigated) {
    prevLocation = locationInfo();
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
      if (a instanceof HTMLAnchorElement && navigate(a.href)) {
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
