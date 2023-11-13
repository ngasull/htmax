import { submitForm } from "./action.ts";
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
  let cleanups = new Map<EventTarget, Set<() => void>>(),
    trackUnsub = subEvent(node, trackEvent, (e) => {
      let t = e.target!,
        cs = cleanups.get(t);
      if (t != node) {
        stopPropagation(e);
        if (!cs) cleanups.set(t, (cs = new Set()));
        cs.add((e as CustomEvent<() => void>).detail);
      }
    }),
    untrackUnsub = subEvent(node, untrackEvent, (e) => {
      let t = e.target!;
      if (t != node) {
        stopPropagation(e);
        forEach(cleanups.get(t), call);
        cleanups.delete(t);
      }
    }),
    cleanup = () => {
      untrackUnsub();
      trackUnsub();
      forEach(cleanups, (cs) => forEach(cs, call));
      cleanups.clear();
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
  | [string, number[]] // [Raw JS, Resources]
  | [Hydration];

const hydrateNode = (node: Node, hydration: Hydration, resources: string[]) =>
  forEach(hydration, ([childIndex, h1, h2]) => {
    let child = node.childNodes[childIndex];

    if (isArray(h1)) {
      hydrateNode(child, h1, resources);
    } else {
      let values = new Proxy(h2 as JSONable[], {
          get: (_, i) => store[resources[(h2 as number[])[i as any]]]?.[0],
        }),
        res = new Function(
          "_$",
          "node",
          "listen",
          "sub",
          "submit",
          `return(${h1 as string})`,
        )(
          values,
          child,
          (type: string, cb: (e: Event) => void, c = child) =>
            subEvent(c, type, cb),
          (cb: () => void) =>
            subStore(
              (h2 as number[]).map((i) => resources[i]),
              cb,
            ),
          submitForm,
        );

      typeof res == "function" && lifecycleTrack(child, res);
    }

    // doMatch(type, {
    //   [HydrationType.Parent]() {
    //     hydrateNode(child, h1 as Hydration, resources);
    //   },
    //   [HydrationType.Subscribe]() {
    //     lifecycleTrack(
    //       child,
    //       new Function("_$", "node", "listen", "sub", `return ${h1 as string}`)(
    //         values,
    //         child,
    //         (type: string, cb: (e: Event) => void) => subEvent(node, type, cb),
    //         (cb: () => void) =>
    //           subStore(
    //             (h2 as number[]).map((i) => resources[i]),
    //             cb,
    //           ),
    //       ),
    //     );
    //   },
    //   // [HydrationType.Attr]() {
    //   //   subEffect(h1 as string, h2 as number[], (text) =>
    //   //     (child as Element).setAttribute(h3 as string, text),
    //   //   );
    //   // },
    //   // [HydrationType.Text]() {
    //   //   subEffect(
    //   //     h1 as string,
    //   //     h2 as number[],
    //   //     (text) => ((child as Text).textContent = text),
    //   //   );
    //   // },
    // });
  });

lifecycleTrackChildren(doc);

win.hy = (
  hydration: Hydration,
  resources: HydrationResource[],
  node = doc.currentScript!.parentNode!,
) => {
  hydrateNode(node, hydration, resources.map(first));
  setResources(resources);
};
