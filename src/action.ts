import {
  body,
  call,
  cloneNode,
  dataset,
  insertBefore,
  keys,
  doMatch,
  newURL,
  parseHtml,
  preventDefault,
  querySelectorAll,
  replaceWith,
  routeFormEvent,
  subEvent,
  submit,
  textHtml,
  values,
  assign,
  pushR,
  doc,
} from "./util.ts";

declare global {
  interface Window {
    __htmaction?: (() => void)[];
  }
}

const submissions = new WeakMap<HTMLFormElement, Promise<unknown>>();

const parentForm = (el: HTMLElement | null): HTMLFormElement | null =>
  el instanceof HTMLFormElement ? el : el && parentForm(el.parentElement);

const handleSubmit = (e: SubmitEvent) => {
  let target = e.target as HTMLElement,
    form = parentForm(target),
    action: string,
    method: string | undefined,
    formData: FormData,
    optimisticPartials: (HTMLElement | SVGElement)[] = [],
    rollbacks: (() => void)[] = [],
    updateTargets = (partials: typeof optimisticPartials) => (
      rollbacks.map(call),
      (rollbacks = []),
      partials.map((partial) => {
        let addRollback = (cb: () => void) => pushR(rollbacks, cb),
          { uri, remove } = dataset(partial),
          partialSlot;

        if (uri) {
          // Update/remove instances
          // ! \\ Scope matters (callback)
          for (let el of querySelectorAll(`[data-uri="${uri}"]`)) {
            if (remove == null) {
              replaceWith(el, partial);
              addRollback(() => replaceWith(partial, el));
            } else {
              let comment = doc.createComment("");
              el.replaceWith(comment);
              addRollback(() => replaceWith(comment, el));
            }
          }

          // Add new instances
          for (partialSlot of querySelectorAll<HTMLTemplateElement>(
            `template[data-uri]`,
          )) {
            // ! \\ Scope matters (callback)
            let partialUri = dataset(partialSlot).uri!,
              curPartial: HTMLElement | SVGElement,
              reg = new RegExp(
                `^${partialUri.replace(/\/:[^/]+/, "/([^/]+)")}$`,
              );

            if (reg.test(uri)) {
              insertBefore(
                partialSlot.parentNode!,
                (curPartial = cloneNode(partial)),
                partialSlot,
              );
              addRollback(() => curPartial.remove());
            }
          }
        }
      }) as unknown as void
    );

  if (
    form &&
    (method = form.method) == "post" &&
    (preventDefault(e), !submissions.has(form))
  ) {
    action = newURL(form.action).pathname;

    formData = new FormData(form, e.submitter);

    const processTemplate = (
      node: Node,
      evaluate: ReturnType<typeof makeEvaluate<string>>,
      el?: Element,
    ) => {
      let nodeType = node.nodeType,
        processChildren = (
          el: Element,
          scopedEvaluate = evaluate,
          child?: Node,
        ) => {
          for (child of el.childNodes) processTemplate(child, scopedEvaluate);
        };

      if ((nodeType = node.nodeType) == 3 /* Node.TEXT_NODE */) {
        node.textContent = evaluate(node.textContent!);
      } else if (nodeType == 1 /* Node.ELEMENT_NODE */) {
        doMatch(
          (el = node as Element).tagName,
          {
            CONDITION$() {
              for (let matchEl of el!.children) {
                if (
                  (matchEl =
                    doMatch(matchEl.tagName, {
                      IF$: (_) =>
                        evaluate(matchEl.getAttribute("test") || "0")
                          ? matchEl
                          : (0 as unknown as Element),
                    }) ?? matchEl)
                ) {
                  processChildren(matchEl, evaluate);
                  el!.replaceWith(...matchEl.childNodes);
                }
              }
            },
            FOR$() {
              let item,
                clone,
                list: ChildNode[] = [];
              for (item of evaluate(el!.getAttribute("each") || "[]")) {
                processChildren(
                  (clone = cloneNode(el!)),
                  evaluate.add(el!.getAttribute("var") || "_", item),
                );
                pushR(list, ...clone.childNodes);
              }
              el!.replaceWith(...list);
            },
          },
          () => {
            for (let attr of (node as Element).attributes) {
              attr.value = evaluate(attr.value);
            }
            return processChildren(node as Element);
          },
        );
      }
      return node;
    };
    for (let o of querySelectorAll<HTMLTemplateElement>(
      `template[data-optimistic]`,
      form,
    )) {
      for (let oe of o.content.children) {
        pushR(
          optimisticPartials,
          processTemplate(cloneNode(oe), makeEvaluate(formData)) as
            | HTMLElement
            | SVGElement,
        );
      }
    }

    submissions.set(
      form,
      fetch(action, {
        method,
        body: formData,
      })
        .then(async (res) => {
          if (!res.headers.get("Content-Type")?.includes(textHtml))
            throw res.text();
          updateTargets([...parseHtml(await res.text()).body.children] as (
            | HTMLElement
            | SVGElement
          )[]);
        })
        .catch(() => rollbacks.map(call))
        .finally(() => submissions.delete(form!)),
    );

    updateTargets(optimisticPartials);
  }
};

const makeEvaluate = <T>(formData: FormData) => {
  let formProxy = (get: "get" | "getAll" | "has") =>
      new Proxy(formData, {
        get: (formData: FormData, name: string) => formData[get](name),
      }),
    args = {
      // ...formData,
      formData,
      all: formProxy("getAll"),
      has: formProxy("has"),
      raw: formProxy("get"),
    },
    makeScopable = (dataArgNames: string[], dataArgs: unknown[]) =>
      assign(
        (functionBody: string): T =>
          functionBody.trim()
            ? new Function(...dataArgNames, `return(${functionBody})`)(
                ...dataArgs,
              )
            : functionBody,
        {
          add: (k: string, v: unknown) =>
            makeScopable([...dataArgNames, k], [...dataArgs, v]),
        },
      );

  return makeScopable(keys(args), values(args));
};

export const register = (root = body) => {
  window.__htmaction ??= [
    subEvent(root, routeFormEvent, preventDefault),
    subEvent(root, submit, handleSubmit),
  ];
};

export const unregister = () => {
  window.__htmaction?.map(call);
  delete window.__htmaction;
};
