/// <reference path="./dom.types.ts" />

import type { ParamKeys } from "hono/types";

export const contextSymbol = Symbol("");

declare global {
  namespace JSX {
    type IntrinsicTag = Exclude<keyof IntrinsicElements, number>;

    type IntrinsicElements = {
      [K in keyof DOMElements]: {
        [P in keyof DOMElements[K]]?:
          | DOMElements[K][P]
          | ReactiveJSExpression<DOMElements[K][P]>;
      };
    };

    type Element = SyncElement | AsyncElement | Fragment;

    type AsyncElement = Promise<SyncElement | Fragment>;

    type Fragment = Array<Element>;

    type Children =
      | Element
      | DOMLiteral
      | null
      | undefined
      | ReactiveJSExpression<DOMLiteral | null | undefined>
      | Array<Children>;

    type SyncElement =
      | { kind: ElementKind.Comment; element: string }
      | { kind: ElementKind.Component; element: ComponentElement }
      | { kind: ElementKind.Intrinsic; element: IntrinsicElement }
      | { kind: ElementKind.JS; element: ReactiveJSExpression<DOMLiteral> }
      | { kind: ElementKind.Text; element: TextElement }
      | { kind: ElementKind.HTMLNode; element: HTMLNodeElement };

    interface IntrinsicElement {
      tag: IntrinsicTag;
      props: Record<
        string,
        | ReactiveJSExpression<string | number | boolean | null>
        | string
        | number
        | boolean
        | null
        | undefined
      >;
      children: Fragment;
    }

    interface TextElement {
      text: DOMLiteral;
      ref?: Ref<Text>;
    }

    interface HTMLNodeElement {
      html: string;
      ref?: Ref<Node>;
    }

    interface ComponentElement<
      O extends Record<string, unknown> = Record<string, unknown>,
    > {
      Component: Component<O>;
      props: O;
    }

    type Component<
      O extends ElementProps = ElementProps & Partial<ChildrenProp>,
    > = GenericComponent<O>;

    type ParentComponent<O extends ElementProps = ElementProps> =
      GenericComponent<O & ChildrenProp>;

    type GenericComponent<O extends ElementProps> = (
      props: O,
      ctx: ContextAPI,
    ) => Element;

    type Context<T> = Record<typeof contextSymbol, symbol> & Record<symbol, T>;

    type ContextAPI = {
      get<T>(context: Context<T>): T;
      getOrNull<T>(context: Context<T>): T | null;
      has<T>(context: Context<T>): boolean;
      set<T>(context: Context<T>, value: T): ContextAPI;
      delete<T>(context: Context<T>): ContextAPI;
    };

    type DOMLiteral = string | number;

    type Resource<T extends JSONable> = {
      uri: string;
      value: T | Promise<T>;
    };
    // Front: Map<URI, T>

    type JSFn<Args extends readonly unknown[], R> =
      | PureJSFn<Args, R>
      | ReactiveJSFn<Args, R>;

    type PureJSFn<Args extends readonly unknown[], R> = ((
      ...args: {
        [I in keyof Args]:
          | PureJSExpression<Args[I]>
          | (Args[I] extends JSONable ? Args[I] : never)
          | (Args[I] extends (...args: infer A) => infer R
              ? JSX.PureJSFn<A, R>
              : never);
      }
    ) => PureJSExpression<R>) & {
      _args: Args;
      argsLength: number;
      body: JS<R>;
      // eval: (...args: Args) => R;
    } & symbol; // Blocks regurlar string interpolation

    type RawJS = { rawJS: string; resources: never } & symbol; // Blocks regurlar string interpolation
    // Front: Map<hash, { module: Promise, deps: hash[] }>

    type JS<T> = PureJSExpression<T> | PureJSStatements<T>;

    type PureJSExpression<T> = RawJS & {
      _type: T;
      expression: true;
      statements?: never;
    };

    type PureJSStatements<R> = RawJS & {
      _type: R;
      expression?: never;
      statements: true;
    };

    type ReactiveJS<T> = ReactiveJSExpression<T> | ReactiveJSStatements<T>;

    type ReactiveJSExpression<T> = Omit<PureJSExpression<T>, "resources"> & {
      resources: Resource<JSONable>[]; // JSReactive expects an array variable `_$` that contains these resources' value
    };

    type ReactiveJSStatements<R> = Omit<PureJSStatements<R>, "resources"> & {
      resources: Resource<JSONable>[];
    };

    type ReactiveJSFn<Args extends readonly unknown[], R> = ((
      ...args: {
        [I in keyof Args]:
          | ReactiveJSExpression<Args[I]>
          | PureJSExpression<Args[I]>
          | (Args[I] extends JSONable ? Args[I] : never)
          | (Args[I] extends (...args: infer A) => infer R
              ? JSX.PureJSFn<A, R>
              : never);
      }
    ) => ReactiveJSExpression<R>) & {
      _args: Args;
      argsLength: number;
      body: ReactiveJS<R>;
      // eval: (...args: Args) => Promise<R extends Promise<infer RR> ? RR : R>;
    } & symbol;

    type ResourceGroup<
      T extends Record<string, JSONable>,
      U extends string,
    > = ((v: ParamKeys<U>) => Resource<T>) & {
      pattern: U;
      each: (values: ParamKeys<U>[]) => Resources<T, U>;
    };

    type Resources<T extends Record<string, JSONable>, U extends string> = {
      group: ResourceGroup<T, U>;
      values: Resource<T>[];
    };

    type Ref<N> =
      | PureJSFn<[N, SubStore], (() => void) | void>
      | ReactiveJSFn<[N, SubStore], (() => void) | void>;
  }
}

export type SubStore = (cb: () => void) => () => void;

// export type SyncResource<T extends JSONable> = {
//   uri: string;
//   value: T;
// };

// export type SyncJS<T> =
//   | JSX.JS<T>
//   | (Omit<JSX.ReactiveJS<T>, "resources"> & {
//       resources: SyncResource<JSONable>[];
//     });

// export type SyncJSFn<Args extends readonly unknown[], R> = Omit<
//   JSX.JSFn<Args, R>,
//   "body"
// > & {
//   body: SyncJS<R>;
// };

export type SyncRef<N> = {
  fn:
    | JSX.PureJSFn<[N, SubStore], (() => void) | void>
    | JSX.ReactiveJSFn<[N, SubStore], (() => void) | void>;
  values: JSONable[];
};

// export type SyncJSReactive<T> = {
//   fn: JSX.JSFn<[T | undefined, ...JSONable[]], T>;
//   resources: SyncResource<JSONable>[];
// };

export enum ElementKind {
  Comment,
  Component,
  Intrinsic,
  JS,
  Text,
  HTMLNode,
}

export enum DOMNodeKind {
  Tag,
  Text,
  HTMLNode,
  Comment,
}

// export type DOMNode = { effects?: SyncJS<void>[] } & (
export type DOMNode =
  | {
      kind: DOMNodeKind.Tag;
      node: {
        tag: string;
        attributes: Record<string, string | number | boolean>;
        children: DOMNode[];
      };
      refs?: SyncRef<Element>[];
    }
  | {
      kind: DOMNodeKind.Text;
      node: {
        text: string;
      };
      refs?: SyncRef<Text>[];
    }
  | {
      kind: DOMNodeKind.HTMLNode;
      node: {
        html: string;
      };
      refs?: SyncRef<Node>[];
    }
  | {
      kind: DOMNodeKind.Comment;
      node: string;
      refs?: SyncRef<Comment>[];
    };

export type JSONLiteral = string | number | boolean | null;

export interface JSONRecord {
  [member: string]: JSONLiteral | JSONArray | JSONRecord;
}
export interface JSONArray
  extends ReadonlyArray<JSONLiteral | JSONArray | JSONRecord> {}

export type JSONable = JSONLiteral | JSONRecord | JSONArray;

export type ElementProps = { [k: Exclude<string, "children">]: unknown };

export type ChildrenProp = Record<"children", JSX.Children>;
