import { Hydration, HydrationResource } from "../lifecycle.ts";
import { isJS, isResource, js, frozen } from "../partial.ts";
import {
  ChildrenProp,
  contextSymbol,
  ElementKind,
  ElementProps,
  JSONable,
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

const escapeTextNode = (text: string) =>
  escapeEscapes(text).replaceAll("<", "&lt;") || " "; // Empty would not be parsed as a text node

const commentEscapeRegExp = /--(#|>)/g;

const escapeComment = (comment: string) =>
  comment.replaceAll(commentEscapeRegExp, "--#$1");

export const escapeScriptContent = (node: JSX.DOMLiteral) =>
  String(node).replaceAll("</script", "</scr\\ipt");

export const renderToString = async (root: JSX.Element) => {
  const acc: string[] = [];
  writeDOMTree(await toDOMTree(root), (chunk) => acc.push(chunk));
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
  const store = ({ uri, value }: JSX.Resource<JSONable>) => {
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
  store: (resource: JSX.Resource<JSONable>) => number,
) => {
  const hydration: Hydration = [];

  for (let i = 0; i < dom.length; i++) {
    const { kind, node, effects } = dom[i];
    if (effects) {
      for (const effect of effects) {
        hydration.push([i, effect.rawJS, effect.resources.map(store)]);
      }
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
      const { tag, props, children } = syncRoot.element;

      const attributes: Record<string, string | number | boolean> = {};
      const reactiveAttributes: [
        string,
        JSX.JSOrResource<string | number | boolean | null | undefined>,
      ][] = [];

      const propEntries = Object.entries(props);
      let entry;
      while ((entry = propEntries.shift())) {
        const [name, value] = entry;
        (function recordAttr(
          name: string,
          value:
            | string
            | number
            | boolean
            | null
            | undefined
            | JSX.JSOrResource<string | number | boolean | null | undefined>,
        ) {
          if (value != null) {
            if (isJS(value)) {
              recordAttr(name, value.eval());
              reactiveAttributes.push([name, value]);
            } else if (isResource(value)) {
              recordAttr(name, value.value);
              reactiveAttributes.push([name, value]);
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
          effects: reactiveAttributes.map(
            ([name, jsValue]) =>
              js`sub(_=>{let k=${frozen(
                name,
              )},v=${jsValue};!v&&v!=""?node.removeAttribute(k):node.setAttribute(k,v===!0?"":String(v))})`,
          ),
        },
      ];
    }

    case ElementKind.JS: {
      return [
        {
          kind: DOMNodeKind.Text,
          node: {
            text: String(
              isResource(syncRoot.element)
                ? syncRoot.element.value
                : syncRoot.element.eval(),
            ),
          },
          effects: [js`sub(_=>node.textContent=${syncRoot.element})`],
        },
      ];
    }

    case ElementKind.Text: {
      return [
        { kind: DOMNodeKind.Text, node: { text: String(syncRoot.element) } },
      ];
    }

    case ElementKind.DOM: {
      return [syncRoot.element];
    }
  }

  throw Error(`Can't handle JSX node ${syncRoot}`);
};

export enum DOMNodeKind {
  Tag,
  Text,
  Comment,
}

export type DOMNode = { effects?: JSX.JS<void>[] } & (
  | { kind: DOMNodeKind.Tag; node: DOMNodeTag }
  | { kind: DOMNodeKind.Text; node: DOMNodeText }
  | { kind: DOMNodeKind.Comment; node: string }
);

export type DOMNodeTag = {
  tag: string;
  attributes: Record<string, string | number | boolean>;
  children: DOMNode[];
};

type DOMNodeText = {
  text: string;
};

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
        isJS<JSX.DOMLiteral>(child) || isResource<JSX.DOMLiteral>(child)
          ? { kind: ElementKind.JS, element: child }
          : typeof child === "object"
          ? (child as JSX.Element)
          : { kind: ElementKind.Text, element: child as string | number },
      );
    }
  }

  return fragment;
};

export { Fragment, jsx, jsx as jsxDev, jsx as jsxs };

// const conditionMatchedContext = createContext<boolean>();

// const render = async (
//   root: JSX.Element,
//   write: (chunk: string) => void,
//   opts: { handleHydration?(hydration: Hydration): void } = {},
// ) => {
//   const hydrationStore: Record<string, [number, JSONable]> = {};
//   let storeIndex = 0;
//   const hydrationResIndex = ([uri, value]: JSX.Resource<JSONable>) => {
//     hydrationStore[uri] ??= [storeIndex++, value];
//     return hydrationStore[uri][0];
//   };

//   const hydrationStack: [Hydration, number][] = [[[], 0]];
//   let wroteHydration = false;
//   const writeHydration = () => {
//     const [[hydration]] = hydrationStack;
//     if (!wroteHydration) {
//       if (opts.handleHydration) {
//         opts.handleHydration(hydration);
//       } else if (hydration.length) {
//         write(
//           `<script>hydrate(${escapeScriptContent(
//             JSON.stringify(hydration),
//           )})</script>`,
//         );
//       }
//       wroteHydration = true;
//     }
//   };

//   const writeAttr = (name: string, value?: JSX.DOMLiteral | boolean | null) => {
//     write(" ");
//     write(escapeTag(name));

//     if (value === true) {
//       write('=""');
//     } else if (value) {
//       write("=");
//       const escapedValue = escapeEscapes(String(value)).replaceAll(
//         "'",
//         "&#39;",
//       );
//       if (/[\s>"]/.test(escapedValue)) {
//         write("'");
//         write(escapedValue);
//         write("'");
//       } else {
//         write(escapedValue);
//       }
//     }
//   };

//   const renderChild = async (
//     {
//       tag: tagParam,
//       Component,
//       props,
//       children,
//       node,
//       comment,
//     }: JSX.SyncElement,
//     parentContext: ContextData,
//   ) => {
//     const parentCtx = contextAPI(parentContext);
//     let writeCurrent = () => {};

//     const nodeHydrations: HydrationInfo[] = [];

//     if (Component) {
//       const contextData = [If, ElseIf, Else].includes(Component)
//         ? parentContext
//         : subContext(parentContext);
//       writeCurrent = await renderChild(
//         await Component(props, contextAPI(contextData)),
//         contextData,
//       );
//     } else if (node) {
//       const nodeValue = isJS<JSX.DOMLiteral>(node)
//         ? node.value
//         : (node as JSX.DOMNode | JSX.SyncElement);

//       writeCurrent = await (isJSXElement(nodeValue)
//         ? // Inline nodes => current context
//           renderChild(nodeValue, parentContext)
//         : () => {
//             const text = parentCtx.getOrNull(scriptContext)
//               ? escapeScriptContent(nodeValue)
//               : escapeTextNode(nodeValue);

//             if (isJS(node) || text) {
//               write(text || " "); // Empty would not be parsed as a text node
//               hydrationStack[0][1]++;

//               if (isJS(node)) {
//                 nodeHydrations.push([
//                   HydrationType.Text,
//                   node.rawJS,
//                   node.resources.map(hydrationResIndex),
//                 ]);
//               }
//             }
//           });
//     } else if (children) {
//       const contextData = subContext(parentContext);

//       // Parallelize calculations, but write sequentially
//       const childrenWrites = await Promise.all(
//         children.map((child) =>
//           renderChild(
//             child,
//             tagParam === "script"
//               ? subContext(parentContext, [
//                   [scriptContext[contextSymbol], true],
//                 ])
//               : contextData,
//           ),
//         ),
//       );
//       writeCurrent = () => {
//         for (const writeChild of childrenWrites) writeChild();
//       };
//     } else if (comment != null) {
//       writeCurrent = () => {
//         write(`<!--`);
//         write(escapeComment(comment));
//         write(`-->`);
//       };
//     }

//     if (tagParam) {
//       const tag = escapeTag(tagParam);

//       switch (tag) {
//         case "js-if":
//           if (isJS(props.test)) {
//             parentCtx.set(conditionMatchedContext, !!props.test.value);
//             if (props.test.value) return writeCurrent;
//             else return () => {};
//           }
//           break;
//         case "js-elseif":
//           if (parentCtx.has(conditionMatchedContext) && isJS(props.test)) {
//             if (
//               !parentCtx.getOrNull(conditionMatchedContext) &&
//               props.test.value
//             ) {
//               parentCtx.set(conditionMatchedContext, true);
//               return writeCurrent;
//             } else return () => {};
//           }
//           break;
//         case "js-else":
//           if (parentCtx.has(conditionMatchedContext)) {
//             if (!parentCtx.getOrNull(conditionMatchedContext)) {
//               parentCtx.set(conditionMatchedContext, true);
//               return writeCurrent;
//             } else return () => {};
//           }
//           break;
//         default:
//           parentCtx.delete(conditionMatchedContext);
//       }

//       const attrWrites: (() => void)[] = [];
//       const propEntries = Object.entries(props);
//       let entry;
//       while ((entry = propEntries.shift())) {
//         const [name, value] = entry;

//         if (value != null) {
//           switch (typeof value) {
//             case "boolean":
//               if (value) attrWrites.push(() => writeAttr(name));
//               break;
//             case "number":
//               attrWrites.push(() => writeAttr(name, String(value)));
//               break;
//             case "string":
//               attrWrites.push(() => writeAttr(name, value));
//               break;
//             default: {
//               attrWrites.push(() => {
//                 writeAttr(name, value.value);
//                 nodeHydrations.push([
//                   HydrationType.Attr,
//                   value.rawJS,
//                   value.resources.map(hydrationResIndex),
//                   name,
//                 ]);
//               });
//               // for (const customEntry of renderAttribute(name, value)) {
//               //   const [customName, customValue] = customEntry;
//               //   attrWrites.push(() => writeAttr(customName, customValue));
//               // }
//             }
//           }
//         }
//       }

//       const writeChildren = writeCurrent;
//       writeCurrent = () => {
//         const hydrationCtx = hydrationStack[0];
//         const [hydration, nodeIndex] = hydrationCtx;
//         write("<");
//         write(tag);

//         for (const attrWrite of attrWrites) {
//           attrWrite();
//         }

//         write(">");

//         if (!(tag in voidElements)) {
//           hydrationStack.unshift([[], 0]);

//           writeChildren();

//           const [childrenHydration, childrenLength] = hydrationStack.shift()!;
//           if (childrenLength > 0) {
//             hydration.push([
//               nodeIndex,
//               [HydrationType.Parent, childrenHydration],
//             ]);
//           }
//           hydrationCtx[1]++;

//           if (tag === "body") writeHydration();

//           write("</");
//           write(tag);
//           write(">");
//         }
//       };
//     }

//     return writeCurrent;
//   };

//   (await renderChild(await root, subContext()))();
//   writeHydration();
// };
