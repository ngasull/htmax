import { JSONable } from "./jsx/jsx.types.ts";
import {
  call,
  customEvent,
  dispatchPrevented,
  doc,
  entries,
  first,
  forEach,
  isArray,
  isFunction,
  stopPropagation,
  subEvent,
  win,
} from "./util.ts";

declare global {
  interface Window {
    hy(hydration: Hydration, resources: HydrationResource[]): void;
  }
}

const store: ResourceStore = {};

const trackEvent = "lf-t";
const untrackEvent = "lf-u";

// Registers a lifecycle-tracking Node
export const lifecycleTrackChildren = (node: Node) => {
  let nodes = new Map<EventTarget, Set<() => void>>(),
    trackUnsub = subEvent(node, trackEvent, (e) => {
      let t = e.target!,
        cs = nodes.get(t);
      if (t != node) {
        stopPropagation(e);
        if (!cs) nodes.set(t, (cs = new Set()));
        cs.add((e as CustomEvent<() => void>).detail);
      }
    }),
    untrackUnsub = subEvent(node, untrackEvent, (e) => {
      let t = e.target!,
        cleanups = nodes.get(t);
      if (t != node) {
        stopPropagation(e);
        if (
          cleanups?.delete((e as CustomEvent<() => void>).detail) &&
          cleanups.size < 1
        )
          nodes.delete(t);
      }
    }),
    cleanup = () => {
      untrackUnsub();
      trackUnsub();
      forEach(nodes, (cleanups) => forEach(cleanups, call));
      nodes.clear();
    };

  lifecycleTrack(node, cleanup);
  return cleanup;
};

// Tells the closest lifecycle-tracking parent to attach a cleanup to a Node
export const lifecycleTrack = (node: Node, cleanup: () => void) => (
  dispatchPrevented(node, customEvent(trackEvent, cleanup)),
  () => lifecycleUntrack(node)
);

export const lifecycleUntrack = (node: Node) =>
  dispatchPrevented(node, customEvent(untrackEvent));

export const getValues = (uris: string[]) => uris.map((uri) => store[uri]![0]);

export const subStore = (uris: string[], cb: () => void) => {
  forEach(uris, (uri) => (store[uri] ??= [undefined!, new Set()])![1].add(cb));
  return () => forEach(uris, (uri) => store[uri]![1].delete(cb));
};

export const setResources = (
  resources: HydrationResource[] | Record<string, JSONable | undefined>,
) => {
  if (!isArray(resources))
    resources = entries(resources).filter(
      (r) => r[1] != null,
    ) as HydrationResource[];

  let batch = new Set<() => void>(),
    rollbacks: (() => void)[] = [];

  forEach(resources, ([uri, v]) => {
    let r = (store[uri] ??= [undefined!, new Set()]),
      prev = r[0];
    if (v !== prev) {
      r[0] = v;
      forEach(r[1], (cb) => batch.add(cb));
      rollbacks.push(() => {
        if (r[0] === v) {
          r[0] = prev;
          forEach(r[1], (cb) => batch.add(cb));
        }
      });
    }
  });

  forEach(batch, call);

  return () => {
    batch = new Set();
    forEach(rollbacks, call);
    forEach(batch, call);
  };
};

type ResourceStore = Record<string, StoredResource | undefined>;

type StoredResource = [JSONable, Set<ResouceListener>];

type ResouceListener = () => void;

export type HydrationResource = [string, JSONable];

export type Hydration = [number, ...HydrationInfo][];

export type HydrationInfo =
  | [string, 0 | 1, ...number[]] // [Raw JS, isExpression, ...Resources]
  | [Hydration];

const hydrateNode = (node: Node, hydration: Hydration, resources: string[]) =>
  forEach(hydration, ([childIndex, h1, h2, ...rs]) => {
    let child = node.childNodes[childIndex];

    if (isArray(h1)) {
      hydrateNode(child, h1, resources);
    } else {
      let values = new Proxy(rs as JSONable[], {
          get: (_, i) => store[resources[(rs as number[])[i as any]]]?.[0],
        }),
        res = new Function(
          "$0",
          "$1",
          "_$",
          h2 ? `return(${h1 as string})` : h1,
        )(
          child,
          (cb: () => void) =>
            subStore(
              (rs as number[]).map((i) => resources[i]),
              cb,
            ),
          values,
        );

      isFunction(res) && lifecycleTrack(child, res);
    }
  });

lifecycleTrackChildren(doc);

win.hy = (
  hydration: Hydration,
  resources: HydrationResource[],
  node = doc.currentScript!.parentNode!,
) => {
  setResources(resources);
  hydrateNode(node, hydration, resources.map(first));
};
