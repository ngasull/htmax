import { JSONable } from "./jsx/jsx.types.ts";
import { setResources } from "./lifecycle.ts";
import {
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
  adoptNode,
  forEach,
  forOf,
  length,
} from "./util.ts";

declare global {
  interface Window {
    __htmaction?: (() => void)[];
  }
}

const submissions = new WeakMap<HTMLFormElement, Promise<unknown>>();

const parentForm = (el: HTMLElement | null): HTMLFormElement | null =>
  el instanceof HTMLFormElement ? el : el && parentForm(el.parentElement);

const handleSubmitOld = (e: SubmitEvent) => {
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
              replaceWith(el, comment);
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

    const processChildren = (
        el: Element,
        evaluate: ReturnType<typeof makeEvaluate<string>>,
      ) => processChildNodes([...el.childNodes], evaluate),
      processChildNodes = (
        childNodes: Iterable<ChildNode>,
        evaluate: ReturnType<typeof makeEvaluate<string>>,
      ) => {
        let isCaseResolved = 1,
          unresolve = () => (isCaseResolved = 0),
          chexecTest = (el: Element, test = el.getAttribute("test")) =>
            !isCaseResolved && evaluate(test || "0")
              ? execCase(el)
              : el.remove(),
          execCase = (el: Element) => {
            isCaseResolved = 1;
            processChildren(el!, evaluate);
            replaceWith(el!, ...el!.childNodes);
          },
          child;

        for (child of childNodes)
          processTemplate(child, evaluate, unresolve, chexecTest);
      },
      processTemplate = (
        node: ChildNode,
        evaluate: ReturnType<typeof makeEvaluate<string>>,
        unresolve: () => void,
        chexecTest: (el: Element, test?: string) => void,
      ) => {
        let nodeType = node.nodeType;

        if (nodeType == 1 /* Node.ELEMENT_NODE */) {
          let name,
            value,
            match,
            el = node as Element;
          for ({ name, value } of el.attributes) {
            if ((match = name.match(/^js-(.+)$/))) {
              el.removeAttribute(name);
              el.setAttribute(match[1], evaluate(value));
            }
          }
          doMatch(
            el.tagName,
            {
              "JS-TEXT"() {
                replaceWith(node, evaluate((el as HTMLElement).innerText));
              },
              "JS-IF"() {
                unresolve();
                chexecTest(el);
              },
              "JS-ELSEIF"() {
                chexecTest(el);
              },
              "JS-ELSE"() {
                chexecTest(el, "1");
              },
              "JS-FOR"() {
                let item,
                  clone,
                  list: ChildNode[] = [];
                for (item of evaluate(el.getAttribute("each") || "[]")) {
                  processChildren(
                    (clone = cloneNode(el)),
                    evaluate.add(el.getAttribute("var") || "_", item),
                  );
                  pushR(list, ...clone.childNodes);
                }
                replaceWith(el, ...list);
              },
            },
            () => processChildren(el, evaluate),
          );
        }
      };
    for (let o of querySelectorAll<HTMLTemplateElement>(
      `template[data-optimistic]`,
      form,
    )) {
      for (let oe of o.content.children) {
        let clone = cloneNode(oe);
        processChildNodes([clone], makeEvaluate(formData));
        pushR(optimisticPartials, clone as HTMLElement | SVGElement);
      }
    }

    submissions.set(
      form,
      fetch(action, {
        method,
        body: formData,
      })
        .then((res) =>
          !res.ok || !res.headers.get("Content-Type")?.includes(textHtml)
            ? (rollbacks.map(call), Promise.reject())
            : res.text(),
        )
        .then(
          (html) => (
            rollbacks.map(call),
            updateTargets([...adoptNode(parseHtml(html).body).children] as (
              | HTMLElement
              | SVGElement
            )[])
          ),
        )
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
    args: Record<string, unknown> = {
      ...[...formData.keys()].map((k, vs?: any) => [
        k,
        ((vs = formData.getAll(k)), length(vs) > 1 ? vs : vs[0]),
      ]),
      form: {
        data: formData,
        all: formProxy("getAll"),
        has: formProxy("has"),
        raw: formProxy("get"),
      },
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

export const submitForm = (
  e: SubmitEvent,
  optimisticData:
    | null
    | ((formData: FormData) => Record<string, JSONable | undefined>),
) => {
  let form = e.currentTarget as HTMLFormElement,
    formData: FormData,
    rollback: null | (() => void);

  if (form && (preventDefault(e), !submissions.has(form))) {
    formData = new FormData(form, e.submitter);
    submissions.set(
      form,
      fetch(newURL(form.action).pathname, {
        method: form.method,
        body: formData,
      })
        .then((res) =>
          !res.ok ? (rollback?.(), Promise.reject()) : res.json(),
        )
        .then((resources) => (rollback?.(), setResources(resources)))
        .finally(() => submissions.delete(form!)),
    );

    rollback = optimisticData && setResources(optimisticData(formData));
  }
};

export const register = (root = doc.body) => {
  window.__htmaction ??= [
    subEvent(root, routeFormEvent, preventDefault),
    // subEvent(root, submit, handleSubmit),
  ];
};

export const unregister = () => {
  window.__htmaction?.map(call);
  delete window.__htmaction;
};
