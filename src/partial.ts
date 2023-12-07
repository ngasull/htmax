import "./jsx/jsx.types.ts";
import { Fragment } from "./jsx/jsx-runtime.ts";
import { JSONable } from "./jsx/jsx.types.ts";

export const HydrationScript: JSX.Component<{}> = () =>
  Fragment({ children: null });

// export const For = async <
//   T extends Record<string, JSONable>,
//   U extends string,
// >(props: {
//   // each: JSX.JS<T[]>;
//   each: JSX.Resources<T, U>;
//   children: (item: JSX.JS<T> | JSX.Resource<T>) => JSX.SyncElement;
//   // key?: keyof T | true | JSX.JS<(item: T) => JSONable>;
//   insertBefore?: boolean | JSX.JS<(added: T) => T>;
// }): JSX.AsyncElement => {
//   const templateTree = await toDOMTree(props.children(mkJS<T>("_$i", [])));

//   const [hydration, templateStore] = deepHydration(templateTree);

//   // const eachArray = props.each.eval();

//   // const key =
//   //   props.key === true || !props.key
//   //     ? null
//   //     : isJS(props.key)
//   //     ? props.key
//   //     : js<(item: T) => JSONable>`v=>v[${value(props.key as string | number)}]`;
//   // const keys = key
//   //   ? eachArray.map(key.eval())
//   //   : props.key === true
//   //   ? (eachArray as JSONable[])
//   //   : null;

//   const children = props.each.values.map(props.children);
//   // const template: JSX.SyncElement | null = {
//   //   kind: ElementKind.DOM,
//   //   element: {
//   //     kind: DOMNodeKind.Tag,
//   //     node: {
//   //       tag: "template",
//   //       attributes: {},
//   //       children: templateTree,
//   //     },
//   //     effects: [
//   //       js`sub(${frozen(
//   //         `add:${props.each.group.pattern}`,
//   //       )},(_,e=node.content.cloneNode(!0))=>{node.parentElement.append(e);hy(${frozen(
//   //         hydration,
//   //       )},${frozen(templateStore)},e)},document)`,

//   //       js`((initial=${props.each.values})=>sub(_=>{let each=${
//   //         props.each.values
//   //       },e;if(each.length!=initial.length){node.parentElement.append(e=node.content.cloneNode(!0));hy(${frozen(
//   //         hydration,
//   //       )},${frozen(templateStore)},e)}}))()`,
//   //     ],
//   //   },
//   // };
//   const template: JSX.Element | null = jsx("template", {
//     ref: js`sub(${frozen(
//       `add:${props.each.group.pattern}`,
//     )},(_,e=node.content.cloneNode(!0))=>{node.parentElement.append(e);hy(${frozen(
//       hydration,
//     )},${frozen(templateStore)},e)},document);((initial=${
//       props.each.values
//     })=>sub(_=>{let each=${
//       props.each.values
//     },e;if(each.length!=initial.length){node.parentElement.append(e=node.content.cloneNode(!0));hy(${frozen(
//       hydration,
//     )},${frozen(templateStore)},e)}}))()`,

//     children: htmlNode(DOMTreeToString(templateTree)),
//   });

//   return template ? [template, ...children] : children;
// };

// export const booleanField = {
//   type: true as boolean,
//   getter: (key: string) => `has(${key})`,
// };
// export const stringField = {
//   type: "" as string,
//   getter: (key: string) => `get(${key})`,
// };
// export const numberField = {
//   type: 0 as number,
//   getter: (key: string) => `Number(get(${key}))`,
// };
// export const dateField = {
//   type: 0 as unknown as Date,
//   getter: (key: string) => `new Date(get(${key}))`,
// };
// export const stringArrayField = {
//   type: [] as string[],
//   getter: (key: string) => `getAll(${key})`,
// };
// export const numberArrayField = {
//   type: [] as number[],
//   getter: (key: string) => `getAll(${key}).map(Number)`,
// };
// export const dateArrayField = {
//   type: [] as Date[],
//   getter: (key: string) => `getAll(${key}).map(d=>new Date(d))`,
// };

// type JSable = JSX.JSOrResource<any> | JSable[] | JSRecord;
type ReactiveJSable =
  | JSX.Resource<JSONable>
  | JSX.ReactiveJSExpression<any>
  | JSX.ReactiveJSFn<any, any>
  | JSX.PureJSExpression<any>
  | JSX.PureJSFn<any, any>
  | JSX.RawJS
  | JSONable
  | ReactiveJSable[]
  | ReactiveJSRecord;

interface ReactiveJSRecord extends Record<string | number, ReactiveJSable> {}

type PureJSable =
  | JSX.PureJSExpression<any>
  | JSX.PureJSFn<any, any>
  | JSX.RawJS
  | JSONable
  | PureJSable[]
  | PureJSRecord;

interface PureJSRecord extends Record<string | number, PureJSable> {}

type JsFn = {
  <T>(
    tpl: TemplateStringsArray,
    ...exprs: PureJSable[]
  ): JSX.PureJSExpression<T>;
  <T>(
    tpl: TemplateStringsArray,
    ...exprs: ReactiveJSable[]
  ): JSX.ReactiveJSExpression<T>;
};

export const js = (<T>(
  tpl: TemplateStringsArray,
  ...exprs: ReactiveJSable[]
) => {
  let resIndex = 0;
  const resources = new Map<JSX.Resource<JSONable>, number>();
  const trackResource = (res: JSX.Resource<JSONable>) => {
    if (!resources.has(res)) {
      resources.set(res, resIndex++);
    }
  };

  const handleExpression = (expr: ReactiveJSable): string => {
    if (isReactive(expr)) {
      expr.resources.forEach(trackResource);
      return expr.rawJS;
    } else if (isResource(expr)) {
      trackResource(expr);
      return `_$[${resources.get(expr)}]`;
    } else if (isJSFn(expr)) {
      const argList = Array(expr.argsLength)
        .fill(0)
        .map((_, i) => `$${i}`)
        .join(",");
      return expr.body.expression
        ? `((${argList})=>(${expr.body.rawJS}))`
        : `((${argList})=>{${expr.body.rawJS}})`;
    } else if (isPureJS(expr)) {
      return expr.rawJS;
    } else if (Array.isArray(expr)) {
      return expr.flatMap(handleExpression).join("");
    } else if (typeof expr === "object") {
      return `{${Object.entries(expr as ReactiveJSRecord)
        .map(
          ([k, expr]) =>
            `${
              typeof k === "number" || safeRecordKeyRegExp.test(k)
                ? k
                : JSON.stringify(k)
            }:${handleExpression(expr)}`,
        )
        .join(",")}}`;
    } else {
      return JSON.stringify(expr);
    }
  };

  const rawParts = [];
  for (let i = 0; i < exprs.length; i++) {
    rawParts.push(tpl[i], handleExpression(exprs[i]));
  }

  if (tpl.length > exprs.length) rawParts.push(tpl[exprs.length]);

  const expr = {
    rawJS: rawParts.join(""),
    expression: true,
  } as JSX.PureJSExpression<T> | JSX.ReactiveJSExpression<T>;

  if (resources.size > 0) expr.resources = [...resources.keys()];

  return expr;
}) as JsFn;

export const statements = {
  js: <T>(tpl: TemplateStringsArray, ...exprs: PureJSable[]) =>
    ({
      rawJS: js(tpl, ...exprs).rawJS,
      statements: true,
    }) as JSX.PureJSStatements<T>,
};

type FnFn = {
  <Args extends unknown[], T = void>(
    cb: (
      ...args: { [I in keyof Args]: JSX.PureJSExpression<Args[I]> }
    ) => JSX.PureJSExpression<T> | JSX.PureJSStatements<T>,
  ): JSX.PureJSFn<Args, T>;

  <Args extends unknown[], T = void>(
    cb: (
      ...args: { [I in keyof Args]: JSX.PureJSExpression<Args[I]> }
    ) => JSX.ReactiveJSExpression<T> | JSX.ReactiveJSStatements<T>,
  ): JSX.ReactiveJSFn<Args, T>;
};

export const fn = (<Args extends unknown[], T = void>(
  cb: (
    ...args: {
      [I in keyof Args]:
        | JSX.ReactiveJSExpression<Args[I]>
        | JSX.PureJSExpression<Args[I]>;
    }
  ) =>
    | JSX.PureJSExpression<T>
    | JSX.PureJSStatements<T>
    | JSX.ReactiveJSExpression<T>
    | JSX.ReactiveJSStatements<T>,
) => {
  const body = cb(
    ...(Array(cb.length)
      .fill(0)
      .map((_, i) => unsafe(`$${i}`)) as {
      [I in keyof Args]: JSX.PureJSExpression<Args[I]>;
    }),
  );

  const jsfn = Object.assign(
    (
      ...args: {
        [I in keyof Args]:
          | JSX.ReactiveJSExpression<Args[I]>
          | JSX.PureJSExpression<Args[I]>
          | (Args[I] extends JSONable ? Args[I] : never)
          | (Args[I] extends (...args: infer A) => infer R
              ? JSX.PureJSFn<A, R>
              : never);
      }
    ): JSX.ReactiveJSExpression<T> => {
      const hydrationStore: Record<string, number> = {};
      let storeIndex = 0;
      const store = ({ uri }: JSX.Resource<JSONable>) => {
        hydrationStore[uri] ??= storeIndex++;
        return hydrationStore[uri];
      };

      return js`${jsfn}(${unsafe(
        args
          .map((a) =>
            a.resources?.length
              ? `((${a.resources.map((_, i) => `$${i}`).join(",")})=>(${
                  a.rawJS
                }))(${a.resources.map((r) => `$${store(r)}`)})`
              : a.rawJS,
          )
          .join(","),
      )})`;
    },
    {
      argsLength: cb.length,
      body,
    },
  ) as JSX.PureJSFn<Args, T>;

  return jsfn;
}) as FnFn;

export const unsafe = (js: string) => mkPureJS(js);

const safeRecordKeyRegExp = /^\w+$/;

const mkPureJS = (rawJS: string) => ({ rawJS }) as JSX.RawJS;

export type EvaluableJS<T> =
  | JSX.ReactiveJSExpression<T>
  | JSX.PureJSExpression<T>;

export const evalJS = <J extends EvaluableJS<any>>(
  js: J,
): J extends JSX.ReactiveJSExpression<infer T>
  ? Promise<T>
  : J extends JSX.PureJSExpression<infer T>
  ? T
  : never =>
  isReactive(js)
    ? Promise.all(js.resources.map((r) => r.value)).then((rs) =>
        new Function("_$", `return(${js.rawJS})`)(rs),
      )
    : new Function(`return(${js.rawJS})`)();

export const sync = async <J extends JSX.JSFn<any[], any>>(
  js: J,
): Promise<{ fn: J; values: JSONable[] }> => {
  return {
    fn: js,
    values:
      "resources" in js.body
        ? await Promise.all(js.body.resources.map(({ value }) => value))
        : [],
  };
};

export const isResource = <T extends JSONable>(
  v: unknown,
): v is JSX.Resource<T> => v != null && typeof v === "object" && "uri" in v;

export const isPureJS = (v: unknown): v is JSX.RawJS =>
  v != null && typeof v === "object" && "rawJS" in v;

export const isEvaluable = <T>(v: unknown): v is EvaluableJS<T> =>
  isPureJS(v) && "expression" in v;

export const isJSExpression = <T>(v: unknown): v is JSX.PureJSExpression<T> =>
  isPureJS(v) && "expression" in v && !("resources" in v);

export const isReactive = <T>(v: unknown): v is JSX.ReactiveJSExpression<T> =>
  isPureJS(v) && "expression" in v && "resources" in v;

export const isJSFn = <Args extends readonly unknown[], R>(
  v: unknown,
): v is JSX.PureJSFn<Args, R> =>
  v != null && typeof v === "function" && "body" in v;

export const resource = <T extends Record<string, JSONable>>(
  uri: string,
  fetch: () => T | Promise<T>,
) => {
  let value = null;
  return {
    uri,
    get value() {
      return (value ??= [fetch()])[0];
    },
  } as JSX.Resource<T>;
};

// const mkCached =
//   (token: string): Cached =>
//   <T extends Record<string, JSONable>>(res: JSX.Resource<T>) =>
//     mkJS(`${token}[${JSON.stringify(res.uri)}]`, []);

// type Cached = <T extends Record<string, JSONable>>(
//   res: JSX.Resource<T>,
// ) => JSX.JS<T>;

// export const update = <T extends Record<string, JSONable>>(
//   res: JSX.Resource<T>,
//   updates: { [K in keyof T]?: JSX.JS<T[K]> },
// ): ActionUpdate<T> =>
//   js<T>`Object.assign(${res},${Object.fromEntries(
//     Object.entries(updates).flatMap(
//       ([k, u]: [keyof T & string, JSX.JS<JSONable> | undefined]) =>
//         u ? [[k, u]] : [],
//     ),
//   )})`;

export const resources = <T extends Record<string, JSONable>, U extends string>(
  pattern: U,
  fetch: (params: { [k in ParamKeys<U>]: string }) => T | Promise<T>,
) => {
  const make = (params: { [k in ParamKeys<U>]: string }) => {
    let value = null;
    return {
      uri: pattern.replaceAll(/:([^/]+)/g, (_, p) =>
        String(params[p as ParamKeys<U>]),
      ),
      get value() {
        return (value ??= [fetch(params)])[0];
      },
    };
  };
  const group: JSX.ResourceGroup<T, U> = Object.assign(make, {
    pattern,
    each: (values: { [k in ParamKeys<U>]: string }[]) => ({
      group,
      values: values.map(make),
    }),
  });
  return group;
};

// type ResourceValues<Resources extends Record<string, JSX.Resource<JSONable>>> =
//   {
//     [K in keyof Resources]: Resources[K] extends JSX.Resource<infer T>
//       ? T
//       : never;
//   };

type FormHelper = {
  raw: Record<string, JSX.PureJSExpression<string | null>>;
  has: Record<string, JSX.PureJSExpression<boolean>>;
  all: Record<string, JSX.PureJSExpression<string[]>>;
};

// From Hono
// https://github.com/honojs/hono/blob/db3387353f23e0914faf8169323c06e9d9658c20/src/types.ts#L560C1-L572C19
type ParamKeyName<NameWithPattern> =
  NameWithPattern extends `${infer Name}{${infer Rest}`
    ? Rest extends `${infer _Pattern}?`
      ? `${Name}?`
      : Name
    : NameWithPattern;

type ParamKey<Component> = Component extends `:${infer NameWithPattern}`
  ? ParamKeyName<NameWithPattern>
  : never;

type ParamKeys<Path extends string> =
  Path extends `${infer Component}/${infer Rest}`
    ? ParamKey<Component> | ParamKeys<Rest>
    : ParamKey<Path>;

type ActionHandler<
  U extends string,
  Updates extends Record<string, ActionUpdate<JSONable>>,
> = ParamKeys<U> extends never
  ? (request: Request, params?: unknown) => Updates | Promise<Updates>
  : (request: Request, params: ActionParams<U>) => Updates | Promise<Updates>;

// type ActionFn = {
//   <U extends string>(
//     opts: ActionOpts<U>,
//   ): (ParamKeys<U> extends never
//     ? () => Action
//     : (params: ActionParams<U>) => Action) & {
//     pattern: U;
//     handler: ActionHandler<U>;
//   };

//   <U extends string>(
//     opts: ActionOptsOptimistic<U, Record<string, JSX.Resource<JSONable>>>,
//   ): (ParamKeys<U> extends never
//     ? () => Action
//     : (params: ActionParams<U>) => Action) & {
//     pattern: U;
//     handler: ActionHandler<U>;
//   };
// };

type ActionUpdate<T extends JSONable> =
  | JSX.Resource<T>
  | JSX.ReactiveJSExpression<JSX.Resource<T>>;

// type ActionOpts<U extends string> = {
//   url: U;
//   optimistic?: never;
//   handler: (opts: {
//     request: Request;
//     params: ActionParams<U>;
//     formData: FormData;
//   }) =>
//     | Record<string, ActionUpdate<JSONable>>
//     | Promise<Record<string, ActionUpdate<JSONable>>>;
// };

type ActionOpts<
  U extends string,
  Updates extends Record<string, ActionUpdate<JSONable>>,
> = {
  url: U;
  optimistic?: (params: ActionParams<U>) => Partial<Updates>;
  handler: (opts: {
    request: Request;
    params: ActionParams<U>;
    formData: FormData;
    // optimistic?: { [K in keyof Resources]?: Record<string, JSONable> }; // ResourceValues<Resources>;
  }) => Updates | Promise<Updates>;
};

type Action = {
  url: string;
  optimistic?: Partial<Record<string, ActionUpdate<JSONable>>>;
};

type ActionParams<U extends string> = Record<ParamKeys<U>, string>;

// type ActionParams<U extends string> = Record<ParamKeys<U>, string | number>;

// type OptimisticActionParams<U extends string> = Record<
//   ParamKeys<U>,
//   string | number | JSX.JS<string | number>
// >;

export const action = <
  U extends string,
  Updates extends Record<string, ActionUpdate<JSONable>>,
>(
  opts: ActionOpts<U, Updates>,
): (ParamKeys<U> extends never
  ? () => Action
  : (
      params: Record<
        ParamKeys<U>,
        string | number | JSX.PureJSExpression<string | number>
      >,
    ) => Action) & {
  pattern: U;
  handler: ActionHandler<U, Updates>;
} => {
  return Object.assign(
    (
      params?: Record<
        ParamKeys<U>,
        string | number | JSX.PureJSExpression<string | number>
      >,
    ): Action => {
      const evalParams =
        params &&
        (Object.fromEntries(
          Object.entries(params).map(([k, v]) => [
            k,
            String(isEvaluable(v) ? /*await*/ evalJS(v) : v),
          ]),
        ) as ActionParams<U>);
      const url = evalParams
        ? opts.url.replace(
            urlParamsRegExp,
            (_, v: string) => evalParams[v as keyof ActionParams<U>],
          )
        : opts.url;

      if (evalParams && opts.optimistic) {
        return {
          url,
          optimistic: opts.optimistic(
            evalParams,
            // form: form,
            // cached: mkCached("_$c"),
          ),
        };
      } else {
        return { url };
      }
    },
    {
      pattern: opts.url,
      handler: ((request: Request, params: ActionParams<U>) =>
        request.formData().then((formData) => {
          // if (opts.optimistic) {
          //   return opts.handler({
          //     request,
          //     params,
          //     formData,
          //     optimistic: Object.fromEntries(
          //       Object.entries(opts.optimistic({ params, form: form })),
          //     ),
          //   });
          // } else {
          return opts.handler({
            request,
            params,
            formData,
          });
          // }
        })) as ActionHandler<U, Updates>,
    },
  );
};

export const form = ((): FormHelper => {
  const source = unsafe("form.data");
  return {
    raw: new Proxy({}, { get: (_, key: string) => js`${source}.get(${key})` }),
    has: new Proxy({}, { get: (_, key: string) => js`${source}.has(${key})` }),
    all: new Proxy(
      {},
      { get: (_, key: string) => js`${source}.getAll(${key})` },
    ),
  };
})();

const urlParamsRegExp = /:([^/]+)/g;

// export const Form = async ({
//   action,
//   children,
// }: {
//   action: Action | (() => Action);
//   children: JSX.Children;
// }): JSX.AsyncElement => {
//   if (typeof action === "function") action = action();

//   //   {
//   //   kind: ElementKind.DOM,
//   //   element: Object.assign(
//   //     (
//   //       await toDOMTree(
//   //         jsx("form", {
//   //           method: "post",
//   //           action: action.url,
//   //           children,
//   //         }),
//   //       )
//   //     )[0],
//   //     {
//   //       effects: [
//   //         js`listen("submit",e=>submit(e,${
//   //           action.optimistic
//   //             ? js`f=>(${Object.fromEntries(
//   //                 await Promise.all(
//   //                   Object.values(action.optimistic)
//   //                     .flatMap((res) =>
//   //                       res ? (isJS(res) ? res.resources : [res]) : [],
//   //                     )
//   //                     .map(async (res) => [res.uri, frozen(await res.value)]),
//   //                 ),
//   //               )})`
//   //             : frozen(null)
//   //         }))`,
//   //       ],
//   //     },
//   //   ),
//   // }
//   const optimistic = action.optimistic
//     ? js`f=>(${Object.fromEntries(
//         await Promise.all(
//           Object.values(action.optimistic)
//             .flatMap((res) => (res ? (isJS(res) ? res.resources : [res]) : []))
//             .map(async (res) => [res.uri, frozen(await res.value)]),
//         ),
//       )})`
//     : frozen(null);

//   return jsx("form", {
//     method: "post",
//     action: action.url,
//     children,
//     ref: js`listen(node,"submit",e=>submit(e,${optimistic}))`,
//   });
// };
