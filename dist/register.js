// src/util.ts
var win = window;
var doc = document;
var head = doc.head;
var textHtml = "text/html";
var routeLoadEvent = "route-load";
var routeFormEvent = "route-form";
var submit = "submit";
var call = (cb) => cb();
var doMatch = (k, matchers, cb = () => {
}) => (matchers[k] ?? cb)(k);
var first = (a) => a[0];
var forEach = (iterable, cb) => iterable?.forEach(cb);
var forOf = (iterable, cb) => {
  for (let i of iterable)
    cb(i);
};
var startsWith = (str, start) => str.startsWith(start);
var { Promise: Promise2 } = win;
var {
  isArray,
  prototype: { slice: arraySlice }
} = Array;
var { parse } = JSON;
var { assign, entries, fromEntries, keys, values } = Object;
var domParser = new DOMParser();
var parseHtml = (html) => domParser.parseFromString(html, textHtml);
var adoptNode = (node) => doc.adoptNode(node);
var dataset = (el) => el.dataset;
var dispatchPrevented = (el, event) => (el.dispatchEvent(event), event.defaultPrevented);
var customEvent = (type, detail, opts) => new CustomEvent(type, { bubbles: true, cancelable: true, detail, ...opts });
var newURL = (url, base) => new URL(url, base);
var preventDefault = (e) => e.preventDefault();
var querySelector = (selector, node = doc.body) => node.querySelector(selector);
var querySelectorAll = (selector, node = doc.body) => node.querySelectorAll(selector);
var replaceWith = (el, ...node) => el.replaceWith(...node);
var stopPropagation = (e) => e.stopPropagation();
var subEvent = (target, type, listener, stopPropag) => {
  let wrappedListener = stopPropag ? function(e) {
    stopPropagation(e);
    listener.call(this, e);
  } : listener;
  target.addEventListener(type, wrappedListener);
  return () => target.removeEventListener(type, wrappedListener);
};

// src/lifecycle.ts
var store = {};
var trackEvent = "lf-t";
var untrackEvent = "lf-u";
var lifecycleTrackChildren = (node) => {
  let cleanups = /* @__PURE__ */ new Map(), trackUnsub = subEvent(node, trackEvent, (e) => {
    let t = e.target, cs = cleanups.get(t);
    if (t != node) {
      stopPropagation(e);
      if (!cs)
        cleanups.set(t, cs = /* @__PURE__ */ new Set());
      cs.add(e.detail);
    }
  }), untrackUnsub = subEvent(node, untrackEvent, (e) => {
    let t = e.target;
    if (t != node) {
      stopPropagation(e);
      forEach(cleanups.get(t), call);
      cleanups.delete(t);
    }
  }), cleanup = () => {
    untrackUnsub();
    trackUnsub();
    forEach(cleanups, (cs) => forEach(cs, call));
    cleanups.clear();
  };
  lifecycleTrack(node, cleanup);
  return cleanup;
};
var lifecycleTrack = (node, cleanup) => (dispatchPrevented(node, customEvent(trackEvent, cleanup)), () => lifecycleUntrack(node));
var lifecycleUntrack = (node) => dispatchPrevented(node, customEvent(untrackEvent));
var subStore = (uris, cb) => {
  forEach(uris, (uri) => (store[uri] ??= [void 0, /* @__PURE__ */ new Set()])[1].add(cb));
  return () => forEach(uris, (uri) => store[uri][1].delete(cb));
};
var setResources = (resources) => {
  if (!isArray(resources))
    resources = entries(resources).filter(
      (r) => r[1] != null
    );
  let batch = /* @__PURE__ */ new Set(), rollbacks = [];
  forEach(resources, ([uri, v]) => {
    let r = store[uri] ??= [void 0, /* @__PURE__ */ new Set()], prev = r[0];
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
    batch = /* @__PURE__ */ new Set();
    forEach(rollbacks, call);
    forEach(batch, call);
  };
};
var hydrateNode = (node, hydration, resources) => forEach(hydration, ([childIndex, h1, h2]) => {
  let child = node.childNodes[childIndex];
  if (isArray(h1)) {
    hydrateNode(child, h1, resources);
  } else {
    let values2 = new Proxy(h2, {
      get: (_, i) => store[resources[h2[i]]]?.[0]
    }), res = new Function(
      "_$",
      "node",
      "listen",
      "sub",
      "submit",
      `return(${h1})`
    )(
      values2,
      child,
      (type, cb, c = child) => subEvent(c, type, cb),
      (cb) => subStore(
        h2.map((i) => resources[i]),
        cb
      ),
      submitForm
    );
    typeof res == "function" && lifecycleTrack(child, res);
  }
});
lifecycleTrackChildren(doc);
win.hy = (hydration, resources, node = doc.currentScript.parentNode) => {
  hydrateNode(node, hydration, resources.map(first));
  setResources(resources);
};

// src/action.ts
var submissions = /* @__PURE__ */ new WeakMap();
var submitForm = (e, optimisticData) => {
  let form = e.currentTarget, formData, rollback;
  if (form && (preventDefault(e), !submissions.has(form))) {
    formData = new FormData(form, e.submitter);
    submissions.set(
      form,
      fetch(newURL(form.action).pathname, {
        method: form.method,
        body: formData
      }).then(
        (res) => !res.ok ? (rollback?.(), Promise.reject()) : res.json()
      ).then((resources) => (rollback?.(), setResources(resources))).finally(() => submissions.delete(form))
    );
    rollback = optimisticData && setResources(optimisticData(formData));
  }
};
var register = (root = doc.body) => {
  window.__htmaction ??= [
    subEvent(root, routeFormEvent, preventDefault)
    // subEvent(root, submit, handleSubmit),
  ];
};

// src/router.ts
var suspenseDelay = 500;
var routeAttr = "route";
var dataRoute = `data-${routeAttr}`;
var routeIndexParam = "_index";
var routeLayoutParam = "_layout";
var routeRequests = {};
var findObsolete = (url, parent, path = "") => {
  let routeEl = querySelector(`[${dataRoute}]`, parent), subPath = routeEl ? path + dataset(routeEl)[routeAttr] : path;
  return routeEl ? startsWith(url, subPath) ? findObsolete(url, routeEl, subPath) : [
    startsWith(subPath, url) ? (
      // Only index needed
      [url]
    ) : (
      // Subpaths starting from `path`
      url.slice(path.length).split("/").map((_, i, arr) => path + arr.slice(0, i + 1).join("/"))
    ),
    routeEl
  ] : parent ? [[url], parent] : routeEl;
};
var handleLocationChange = async () => {
  let { pathname, search } = location, obsolete = findObsolete(pathname);
  if (!obsolete)
    return location.replace(pathname + search);
  let [missingPartials, slot] = obsolete, curSlot = slot, searchParams = new URLSearchParams(search), resEls, el;
  searchParams.append(routeIndexParam, "");
  await Promise2.race([
    new Promise2((resolve) => setTimeout(resolve, suspenseDelay)),
    Promise2.all(
      resEls = missingPartials.map(
        (url, i, q) => routeRequests[url] ||= q = fetch(
          `${url}?${i == missingPartials.length - 1 ? searchParams : routeLayoutParam}`
        ).then(
          (res) => res.redirected ? Promise2.reject(navigate(res.url)) : res.text()
        ).then(
          (html) => q == routeRequests[url] ? parseHtml(html) : Promise2.reject()
        ).finally(() => routeRequests[url] = 0)
      )
    )
  ]);
  for await (el of resEls) {
    if (!(curSlot = processHtmlRoute(el, curSlot)))
      break;
  }
  dispatchPrevented(slot, customEvent(routeLoadEvent));
};
var processHtmlRoute = (receivedDoc, slot) => {
  let handleResource = (el, srcAttr) => (tagName, src) => {
    if ((src = el[srcAttr]) && !querySelector(`${tagName}[${srcAttr}="${src}"]`, head)) {
      head.append(adoptNode(el));
    }
  }, content = adoptNode(receivedDoc.body.children[0]);
  forEach(
    querySelectorAll(`template[data-head]`, receivedDoc),
    (headEl) => {
      forOf(
        headEl.content.children,
        (el) => doMatch(el.tagName, {
          TITLE() {
            doc.title = el.text;
          },
          LINK: handleResource(el, "href"),
          SCRIPT: handleResource(el, "src")
        })
      );
      headEl.remove();
    }
  );
  lifecycleUntrack(slot);
  replaceWith(slot, content);
  lifecycleTrackChildren(content);
  return querySelector(`[${dataRoute}]`, content);
};
var navigate = (path) => {
  let origin = location.origin, url = newURL(path, origin), navigated = url.origin == origin;
  if (navigated) {
    history.pushState(0, "", url);
    handleLocationChange();
  }
  return navigated;
};
var register2 = (root = doc.body) => {
  let t;
  win.__htmax ??= [
    subEvent(
      root,
      "click",
      (e) => !e.ctrlKey && !e.shiftKey && (t = e.target) instanceof HTMLAnchorElement && navigate(t.href) && preventDefault(e)
    ),
    subEvent(
      root,
      submit,
      (e) => (t = e.target) instanceof HTMLFormElement && t.method == "get" && !dispatchPrevented(t, customEvent(routeFormEvent)) && navigate(t.action) && preventDefault(e)
    ),
    subEvent(win, "popstate", handleLocationChange),
    ...[...querySelectorAll(`[${dataRoute}]`)].map(lifecycleTrackChildren).reverse()
  ];
};

// src/register.ts
subEvent(doc, "DOMContentLoaded", () => {
  register();
  register2();
});
