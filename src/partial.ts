import "./jsx/jsx.types.ts";
import {
  deepHydration,
  DOMNodeKind,
  Fragment,
  jsx,
  toDOMTree,
} from "./jsx/jsx-runtime.ts";
import { ElementKind, JSONable } from "./jsx/jsx.types.ts";

export const HydrationScript: JSX.Component<{}> = () =>
  Fragment({ children: null });

export const For = async <T extends Record<string, JSONable>>(props: {
  // each: JSX.JS<T[]>;
  each: JSX.Resources<T>;
  children: (item: JSX.JS<T> | JSX.Resource<T>) => JSX.SyncElement;
  // key?: keyof T | true | JSX.JS<(item: T) => JSONable>;
  insertBefore?: boolean | JSX.JS<(added: T) => T>;
}): JSX.AsyncElement => {
  const templateTree = await toDOMTree(props.children(mkJS<T>("_$i", [])));

  const [hydration, templateStore] = deepHydration(templateTree);

  // const eachArray = props.each.eval();

  // const key =
  //   props.key === true || !props.key
  //     ? null
  //     : isJS(props.key)
  //     ? props.key
  //     : js<(item: T) => JSONable>`v=>v[${value(props.key as string | number)}]`;
  // const keys = key
  //   ? eachArray.map(key.eval())
  //   : props.key === true
  //   ? (eachArray as JSONable[])
  //   : null;

  const children = props.each.values.map(props.children);
  const template: JSX.SyncElement | null = {
    kind: ElementKind.DOM,
    element: {
      kind: DOMNodeKind.Tag,
      node: {
        tag: "template",
        attributes: {},
        children: templateTree,
      },
      effects: [
        js`((initial=${props.each.values})=>sub(_=>{let each=${
          props.each.values
        },e;if(each.length!=initial.length){node.parentElement.append(e=node.content.cloneNode(!0));hy(${frozen(
          hydration,
        )},${frozen(templateStore)},e)}}))()`,
      ],
    },
  };

  return template ? [template, ...children] : children;
};

export const booleanField = {
  type: true as boolean,
  getter: (key: string) => `has(${key})`,
};
export const stringField = {
  type: "" as string,
  getter: (key: string) => `get(${key})`,
};
export const numberField = {
  type: 0 as number,
  getter: (key: string) => `Number(get(${key}))`,
};
export const dateField = {
  type: 0 as unknown as Date,
  getter: (key: string) => `new Date(get(${key}))`,
};
export const stringArrayField = {
  type: [] as string[],
  getter: (key: string) => `getAll(${key})`,
};
export const numberArrayField = {
  type: [] as number[],
  getter: (key: string) => `getAll(${key}).map(Number)`,
};
export const dateArrayField = {
  type: [] as Date[],
  getter: (key: string) => `getAll(${key}).map(d=>new Date(d))`,
};

// type Form<K extends string> = { [k in K]: FieldType<unknown> };

// type FieldType<T> = {
//   type: T;
//   getter(key: string): string;
// };

type JSable = JSX.JSOrResource<any> | JSable[] | JSRecord;

interface JSRecord extends Record<string | number, JSable> {}

export const js = <T>(tpl: TemplateStringsArray, ...exprs: JSable[]) => {
  let resIndex = 0;
  const resources = new Map<JSX.Resource<JSONable>, number>();
  const trackResource = (res: JSX.Resource<JSONable>) => {
    if (!resources.has(res)) {
      resources.set(res, resIndex++);
    }
  };

  const handleExpression = (expr: JSable): string => {
    if (isJS(expr)) {
      expr.resources.forEach(trackResource);
      return expr.rawJS;
    } else if (isResource(expr)) {
      trackResource(expr);
      return `_$[${resources.get(expr)}]`;
    } else if (Array.isArray(expr)) {
      return expr.flatMap(handleExpression).join("");
    } else {
      return `{${Object.entries(expr as JSRecord)
        .map(
          ([k, expr]) =>
            `${
              typeof k === "number" || safeRecordKeyRegExp.test(k)
                ? k
                : JSON.stringify(k)
            }:${handleExpression(expr)}`,
        )
        .join(",")}}`;
    }
  };

  const rawParts = [];
  for (let i = 0; i < exprs.length; i++) {
    rawParts.push(tpl[i], handleExpression(exprs[i]));
  }

  if (tpl.length > exprs.length) rawParts.push(tpl[exprs.length]);

  return mkJS<T>(rawParts.join(""), [...resources.keys()]);
};

export const unsafe = (js: string) => mkJS(js, []);

const safeRecordKeyRegExp = /^\w+$/;

const mkJS = <T>(rawJS: string, resources: JSX.Resource<JSONable>[]) => {
  const exec = new Function("_$", `return ${rawJS}`);
  return {
    rawJS,
    resources,
    eval: () => exec(resources.map(({ value }) => value)),
  } as JSX.JS<T>;
};

const mkJSStub = <T>(value: T) =>
  ({
    rawJS: "",
    resources: [] as JSX.Resource<JSONable>[],
    eval: () => value,
  }) as JSX.JS<T>;

type ValueFn = {
  <T extends JSONable>(value: T): JSX.JS<T>;
  <T>(value: T, toJS: (value: T) => string): JSX.JS<T>;
};

export const frozen: ValueFn = <T>(
  value: T,
  toJS: (value: T) => string = (v) => JSON.stringify(v),
) => mkJS<T>(toJS(value), []);

export const isResource = <T extends JSONable>(
  v: unknown,
): v is JSX.Resource<T> => v != null && typeof v === "object" && "uri" in v;

export const isJS = <T>(v: unknown): v is JSX.JS<T> =>
  v != null && typeof v === "object" && "rawJS" in v;

export const resource = <T extends JSONable>(uri: string, value: T) =>
  ({ uri, value }) as JSX.Resource<T>;

export const resources = <T extends Record<string, JSONable>>(
  pattern: string,
) => {
  const make = (value: T) => ({
    uri: pattern.replaceAll(/:([^/]+)/g, (_, p) => String(value[p])),
    value,
  });
  const group: JSX.ResourceGroup<T> = Object.assign(make, {
    pattern,
    each: (values: T[]) => ({
      group,
      values: values.map(make),
    }),
  });
  return group;
};

type ResourceValues<Resources extends Record<string, JSX.Resource<JSONable>>> =
  {
    [K in keyof Resources]: Resources[K] extends JSX.Resource<infer T>
      ? T
      : never;
  };

type FormHelper = {
  raw: Record<string, JSX.JS<string | null>>;
  has: Record<string, JSX.JS<boolean>>;
  all: Record<string, JSX.JS<string[]>>;
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

type ActionHandler<U extends string> = ParamKeys<U> extends never
  ? (
      request: Request,
      params?: unknown,
    ) => Record<string, JSONable> | Promise<Record<string, JSONable>>
  : (
      request: Request,
      params: ActionParams<U>,
    ) => Record<string, JSONable> | Promise<Record<string, JSONable>>;

type ActionFn = {
  <U extends string>(
    opts: ActionOpts<U>,
  ): (ParamKeys<U> extends never
    ? () => Action
    : (params: ActionParams<U>) => Action) & {
    pattern: U;
    handler: ActionHandler<U>;
  };

  <U extends string>(
    opts: ActionOptsOptimistic<U, Record<string, JSX.Resource<JSONable>>>,
  ): (ParamKeys<U> extends never
    ? () => Action
    : (params: ActionParams<U>) => Action) & {
    pattern: U;
    handler: ActionHandler<U>;
  };
};

type ActionOpts<U extends string> = {
  url: U;
  optimistic?: never;
  handler: (opts: {
    request: Request;
    params: ActionParams<U>;
    formData: FormData;
  }) => Record<string, JSONable> | Promise<Record<string, JSONable>>;
};

type ActionOptsOptimistic<
  U extends string,
  Resources extends Record<string, JSX.Resource<JSONable>>,
> = {
  url: U;
  optimistic: (opts: { params: ActionParams<U>; form: FormHelper }) => {
    [K in keyof Resources]?:
      | JSX.Resource<ResourceValues<Resources>[K]>
      | JSX.JS<ResourceValues<Resources>[K]>;
  };
  handler: (opts: {
    request: Request;
    params: ActionParams<U>;
    formData: FormData;
    optimistic: { [K in keyof Resources]: Record<string, JSONable> }; // ResourceValues<Resources>;
  }) =>
    | { [K in keyof Resources]: Record<string, JSONable> }
    | Promise<{ [K in keyof Resources]: Record<string, JSONable> }>;
};

type Action = {
  url: string;
  optimistic?: Record<string, JSX.Resource<JSONable> | JSX.JS<JSONable>>;
};

type ActionParams<U extends string> = Record<
  ParamKeys<U>,
  string | number | JSX.JS<string | number>
>;

export const action: ActionFn = <U extends string>(
  opts:
    | ActionOpts<U>
    | ActionOptsOptimistic<U, Record<string, JSX.Resource<JSONable>>>,
) => {
  return Object.assign(
    (params?: ActionParams<U>): Action => {
      const url = params
        ? opts.url.replace(urlParamsRegExp, (_, v: string) => {
            const param = params[v as keyof ActionParams<U>];
            return String(isJS(param) ? param.eval() : param);
          })
        : opts.url;

      if (params && opts.optimistic) {
        return {
          url,
          optimistic: opts.optimistic({
            params,
            form: formHelper,
          }),
        };
      } else {
        return { url };
      }
    },
    {
      pattern: opts.url,
      handler: (request: Request, params: ActionParams<U>) =>
        request.formData().then((formData) => {
          if (opts.optimistic) {
            return opts.handler({
              request,
              params,
              formData,
              optimistic: Object.fromEntries(
                Object.entries(
                  opts.optimistic({ params, form: formHelper }),
                ).map(([k, v]) => [
                  k,
                  (isResource(v) ? v.value : v?.eval()) as Record<
                    string,
                    JSONable
                  >,
                ]),
              ),
            });
          } else {
            return opts.handler({
              request,
              params,
              formData,
            });
          }
        }),
    },
  );
};

const formHelper = ((): FormHelper => {
  const source = unsafe("form.data");
  return {
    raw: new Proxy(
      {},
      { get: (_, key: string) => js`${source}.get(${frozen(key)})` },
    ),
    has: new Proxy(
      {},
      { get: (_, key: string) => js`${source}.has(${frozen(key)})` },
    ),
    all: new Proxy(
      {},
      { get: (_, key: string) => js`${source}.getAll(${frozen(key)})` },
    ),
  };
})();

const urlParamsRegExp = /:([^/]+)/g;

export const Form = async ({
  action,
  children,
}: {
  action: Action | (() => Action);
  children: JSX.Children;
}): JSX.AsyncElement => {
  if (typeof action === "function") action = action();

  return {
    kind: ElementKind.DOM,
    element: Object.assign(
      (
        await toDOMTree(
          jsx("form", {
            method: "post",
            action: action.url,
            children,
          }),
        )
      )[0],
      {
        effects: [
          js`listen("submit",e=>submit(e,${
            action.optimistic ?? frozen(null)
          }))`,
        ],
      },
    ),
  };
};
