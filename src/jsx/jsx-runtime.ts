import { Hydration, HydrationResource } from "../lifecycle.ts";
import { isResource, isReactive, fn, js, evalJS, sync } from "../partial.ts";
import {
  ChildrenProp,
  contextSymbol,
  DOMNodeKind,
  DOMNode,
  ElementKind,
  ElementProps,
  JSONable,
  SubStore,
} from "./jsx.types.ts";

const id = <T>(v: T) => v;

const voidElements = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true,
};

// Only escape when necessary ; avoids inline JS like "a && b" to become "a &amp;&amp; b"
const escapesRegex = /&(#\d{2,4}|[A-z][A-z\d]+);/g;
const escapeEscapes = (value: string) =>
  value.replaceAll(escapesRegex, (_, code) => `&amp;${code};`);

const escapeTag = (tag: string) => tag.replaceAll(/[<>"'&]/g, "");

const zeroWidthSpaceHTML = "&#8203;";

const escapeTextNode = (text: string) =>
  escapeEscapes(text).replaceAll("<", "&lt;") || zeroWidthSpaceHTML; // Empty would not be parsed as a text node

const commentEscapeRegExp = /--(#|>)/g;

const escapeComment = (comment: string) =>
  comment.replaceAll(commentEscapeRegExp, "--#$1");

export const escapeScriptContent = (node: JSX.DOMLiteral) =>
  String(node).replaceAll("</script", "</scr\\ipt");

export const renderToString = async (root: JSX.Element) =>
  DOMTreeToString(await toDOMTree(root));

export const DOMTreeToString = (tree: DOMNode[]) => {
  const acc: string[] = [];
  writeDOMTree(tree, (chunk) => acc.push(chunk));
  return acc.join("");
};

export const renderToStream = (root: JSX.Element) =>
  new ReadableStream<string>({
    async start(controller) {
      writeDOMTree(await toDOMTree(root), controller.enqueue);
      controller.close();
    },
  });

type ContextData = Map<symbol, unknown>;

export const createContext = <T>() =>
  ({ [contextSymbol]: Symbol() }) as JSX.Context<T>;

const subContext = (
  parent?: ContextData,
  added: [symbol, unknown][] = [],
): ContextData => {
  const contexts = new Map(parent);
  for (const [c, v] of added) {
    contexts.set(c as unknown as symbol, v);
  }
  return contexts;
};

const contextAPI = (data: ContextData) => {
  const ctx: JSX.ContextAPI = {
    get: <T>(context: JSX.Context<T>) => {
      if (!data.has(context[contextSymbol])) {
        throw new Error(`Looking up unset context`);
      }
      return data.get(context[contextSymbol]) as T;
    },
    getOrNull: <T>(context: JSX.Context<T>) =>
      data.get(context[contextSymbol]) as T | null,
    has: (context) => data.has(context[contextSymbol]),
    set: <T>(context: JSX.Context<T>, value: T) => (
      data.set(context[contextSymbol], value), ctx
    ),
    delete: <T>(context: JSX.Context<T>) => (
      data.delete(context[contextSymbol]), ctx
    ),
  };
  return ctx;
};

const writeHydrationScript = (
  write: (chunk: string) => void,
  children: DOMNode[],
) => {
  const [hydration, store] = deepHydration(children);
  if (hydration.length) {
    write("<script>hy(");
    write(escapeScriptContent(JSON.stringify(hydration)));
    write(",");
    write(escapeScriptContent(JSON.stringify(store)));
    write(")</script>");
  }
};

export const deepHydration = (
  root: DOMNode[],
): [Hydration, HydrationResource[]] => {
  const hydrationStore: Record<string, [number, JSONable]> = {};
  let storeIndex = 0;
  const store = ({ uri }: JSX.Resource<JSONable>, value: JSONable) => {
    hydrationStore[uri] ??= [storeIndex++, value];
    return hydrationStore[uri][0];
  };
  return [
    domHydration(root, store),
    Object.entries(hydrationStore).map(([uri, [, value]]) => [uri, value]),
  ];
};

const domHydration = (
  dom: DOMNode[],
  store: (resource: JSX.Resource<JSONable>, value: JSONable) => number,
) => {
  const hydration: Hydration = [];

  for (let i = 0; i < dom.length; i++) {
    const { kind, node, refs = [] } = dom[i];
    for (const ref of refs) {
      hydration.push([
        i,
        ref.fn.body.rawJS,
        ref.fn.body.expression ? 1 : 0,
        ...(ref.fn.body.resources?.map((r, i) => store(r, ref.values[i])) ??
          []),
      ]);
    }
    if (kind === DOMNodeKind.Tag) {
      hydration.push([i, domHydration(node.children, store)]);
    }
  }

  return hydration;
};

export const writeDOMTree = (
  root: DOMNode[],
  write: (chunk: string) => void,
) => {
  for (const { kind, node } of root) {
    switch (kind) {
      case DOMNodeKind.Comment: {
        write(`<!--`);
        write(escapeComment(node));
        write(`-->`);
        break;
      }

      case DOMNodeKind.Tag: {
        write("<");
        write(escapeTag(node.tag));

        for (let [name, value] of Object.entries(node.attributes)) {
          if (value === false) continue;
          const valueStr = value === true ? "" : String(value);

          write(" ");
          write(escapeTag(name));
          write("=");
          const escapedValue = escapeEscapes(valueStr).replaceAll("'", "&#39;");
          if (!escapedValue || /[\s>"]/.test(escapedValue)) {
            write("'");
            write(escapedValue);
            write("'");
          } else {
            write(escapedValue);
          }
        }

        write(">");

        if (!(node.tag in voidElements)) {
          if (node.tag === "script") {
            for (const c of node.children) {
              if (c.kind === DOMNodeKind.Text) {
                write(escapeScriptContent(c.node.text));
              } else {
                console.warn(`<script> received non-text child: ${c}`);
              }
            }
          } else {
            writeDOMTree(node.children, write);
            if (node.tag === "body") {
              writeHydrationScript(write, node.children);
            }
          }

          write("</");
          write(node.tag);
          write(">");
        }
        break;
      }

      case DOMNodeKind.Text: {
        write(escapeTextNode(node.text));
        break;
      }

      case DOMNodeKind.HTMLNode: {
        write(node.html);
        break;
      }
    }
  }
};

export const toDOMTree = async (root: JSX.Element): Promise<DOMNode[]> =>
  nodeToDOMTree(root, subContext());

const nodeToDOMTree = async (
  root: JSX.Element,
  ctxData: ContextData,
): Promise<DOMNode[]> => {
  const syncRoot = await root;

  if (Array.isArray(syncRoot)) {
    return Promise.all(
      syncRoot.map((child) => nodeToDOMTree(child, ctxData)),
    ).then((children) => children.flatMap(id));
  }

  switch (syncRoot.kind) {
    case ElementKind.Component: {
      const { Component, props } = syncRoot.element;
      const subCtxData = subContext(ctxData);
      return nodeToDOMTree(
        Component(props, contextAPI(subCtxData)),
        subCtxData,
      );
    }

    case ElementKind.Comment: {
      return [{ kind: DOMNodeKind.Comment, node: syncRoot.element }];
    }

    case ElementKind.Intrinsic: {
      const {
        tag,
        props: { ref, ...props },
        children,
      } = syncRoot.element;

      const attributes: Record<string, string | number | boolean> = {};
      const reactiveAttributes: [
        string,
        JSX.ReactiveJSExpression<string | number | boolean | null>,
      ][] = [];

      const propEntries = Object.entries(props);
      let entry;
      while ((entry = propEntries.shift())) {
        const [name, value] = entry;
        await (async function recordAttr(
          name: string,
          value:
            | string
            | number
            | boolean
            | null
            | undefined
            | JSX.ReactiveJSExpression<string | number | boolean | null>,
        ) {
          if (value != null) {
            if (isReactive<string | number | boolean | null>(value)) {
              await recordAttr(name, await evalJS(value));
              reactiveAttributes.push([name, value]);
              // } else if (isResource(value)) {
              //   await recordAttr(name, await value.value);
              //   reactiveAttributes.push([name, value]);
            } else {
              attributes[name] = value;
            }
          }
        })(name, value);
      }

      return [
        {
          kind: DOMNodeKind.Tag,
          node: {
            tag: tag,
            attributes,
            children: await nodeToDOMTree(children, ctxData),
            // hydration,
          },
          refs: [
            ...(await Promise.all(
              reactiveAttributes.map(([name, reactive]) =>
                sync(
                  fn<[Element, SubStore], () => void>(
                    (node, sub) =>
                      js`${sub}(_=>let k=${name},v=${reactive};!v&&v!==""?${node}.removeAttribute(k):${node}.setAttribute(k,v===true?"":String(v)))`,
                  ),
                ),
              ),
            )),
            ...(ref ? [await sync(ref as unknown as JSX.Ref<Element>)] : []),
          ],
        },
      ];
    }

    case ElementKind.JS: {
      return [
        {
          kind: DOMNodeKind.Text,
          node: {
            text: String(await evalJS(syncRoot.element)),
          },
          refs: [
            await sync(
              fn<[Text, SubStore], () => void>(
                (node, sub) =>
                  js`${sub}(_=>${node}.textContent=${syncRoot.element})`,
              ),
            ),
          ],
        },
      ];
    }

    case ElementKind.Text: {
      return [
        {
          kind: DOMNodeKind.Text,
          node: { text: String(syncRoot.element.text) },
          refs: syncRoot.element.ref
            ? [
                await sync(
                  fn<[Text, SubStore]>(
                    (node, sub) => js`${syncRoot.element.ref!(node, sub)}`,
                  ),
                ),
              ]
            : [],
        },
      ];
    }

    case ElementKind.HTMLNode: {
      return [
        {
          kind: DOMNodeKind.HTMLNode,
          node: { html: syncRoot.element.html },
          refs: syncRoot.element.ref
            ? [
                await sync(
                  fn<[Node, SubStore]>(
                    (node, sub) => js`${syncRoot.element.ref!(node, sub)}`,
                  ),
                ),
              ]
            : [],
        },
      ];
    }
  }

  throw Error(`Can't handle JSX node ${syncRoot}`);
};

export const htmlNode = (html: string, ref?: JSX.Ref<Node>): JSX.Element => ({
  kind: ElementKind.HTMLNode,
  element: { html, ref },
});

export const text = (text: string, ref?: JSX.Ref<Text>): JSX.Element => ({
  kind: ElementKind.Text,
  element: { text, ref },
});

type CreateElement = {
  <Tag extends JSX.IntrinsicTag>(
    tag: Tag,
    props: JSX.IntrinsicElements[Tag],
  ): JSX.Element;

  <Tag extends JSX.IntrinsicTag>(
    tag: Tag,
    props: JSX.IntrinsicElements[Tag],
    ...children: JSX.Children[]
  ): JSX.Element;

  <O extends ElementProps>(
    tag: JSX.Component<O>,
    props: O & Partial<ChildrenProp>,
  ): JSX.Element;

  <O extends ElementProps>(
    tag: JSX.Component<O>,
    props: O | null | undefined,
    ...children: JSX.Children[]
  ): JSX.Element;
};

const jsx: CreateElement = (
  tag: JSX.IntrinsicTag | JSX.GenericComponent<ElementProps>,
  props: (ElementProps & Partial<ChildrenProp>) | null,
  ...children: JSX.Children[]
): JSX.Element => {
  props ??= {};
  children = flatten(children.length ? children : props.children ?? []);
  delete props.children;
  return typeof tag === "string"
    ? {
        kind: ElementKind.Intrinsic,
        element: {
          tag,
          props: props as JSX.IntrinsicElement["props"],
          children: children as JSX.Fragment,
        } satisfies JSX.IntrinsicElement,
      }
    : {
        kind: ElementKind.Component,
        element: {
          Component: tag,
          props: ((props.children = children), props),
        },
      };
};

const Fragment = ({ children }: { children: JSX.Children }): JSX.Fragment =>
  flatten(children);

const flatten = (children: JSX.Children): JSX.Fragment => {
  if (!Array.isArray(children)) children = [children];

  const fragment: JSX.Fragment = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      fragment.push(...flatten(child));
    } else if (child != null) {
      fragment.push(
        isResource<JSX.DOMLiteral>(child)
          ? { kind: ElementKind.JS, element: js`${child}` }
          : isReactive<JSX.DOMLiteral>(child)
          ? { kind: ElementKind.JS, element: child }
          : typeof child === "object"
          ? (child as JSX.Element)
          : {
              kind: ElementKind.Text,
              element: { text: child as string | number },
            },
      );
    }
  }

  return fragment;
};

export { Fragment, jsx, jsx as jsxDev, jsx as jsxs };
