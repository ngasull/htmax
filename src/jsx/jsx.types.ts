/// <reference path="./dom.types.ts" />

import type { DOMNode } from "./jsx-runtime.ts";

export const contextSymbol = Symbol("");

declare global {
  namespace JSX {
    type IntrinsicTag = Exclude<keyof IntrinsicElements, number>;

    type IntrinsicElements = {
      [K in keyof DOMElements]: {
        [P in keyof DOMElements[K]]?:
          | DOMElements[K][P]
          | JSOrResource<DOMElements[K][P]>;
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
      | JSOrResource<DOMLiteral | null | undefined>
      | Array<Children>;

    type SyncElement =
      | { kind: ElementKind.Comment; element: string }
      | { kind: ElementKind.Component; element: ComponentElement }
      | { kind: ElementKind.Intrinsic; element: IntrinsicElement }
      | { kind: ElementKind.JS; element: JSOrResource<DOMLiteral> }
      | { kind: ElementKind.Text; element: DOMLiteral }
      | { kind: ElementKind.DOM; element: DOMNode };

    interface IntrinsicElement {
      tag: IntrinsicTag;
      props: Record<
        string,
        | JSOrResource<string | number | boolean | null | undefined>
        | string
        | number
        | boolean
        | null
        | undefined
      >;
      children: Fragment;
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

    type Resource<T extends JSONable> = { uri: string; value: T };
    // Front: Map<URI, T>

    type ResourceGroup<T extends Record<string, JSONable>> = ((
      v: T,
    ) => Resource<T>) & {
      pattern: string;
      each: (values: T[]) => Resources<T>;
    };

    type Resources<T extends Record<string, JSONable>> = {
      group: ResourceGroup<T>;
      values: Resource<T>[];
    };

    type JS<R> = {
      rawJS: string;
      resources: Resource<JSONable>[]; // JS expects an array variable `_$` that contains these resources' value
      eval: () => R;
    } & symbol; // Blocks regurlar string interpolation
    // Front: Map<hash, { module: Promise, deps: hash[] }>

    type JSOrResource<R> = R & JSONable extends never
      ? JS<R>
      : JS<R> | Resource<R & JSONable>;
  }
}

export enum ElementKind {
  Comment,
  Component,
  Intrinsic,
  JS,
  Text,
  DOM,
}

export type JSONLiteral = string | number | boolean | null;

interface JSONRecord {
  [member: string]: JSONLiteral | JSONArray | JSONRecord;
}
interface JSONArray
  extends ReadonlyArray<JSONLiteral | JSONArray | JSONRecord> {}

export type JSONable = JSONLiteral | JSONRecord | JSONArray;

export type ElementProps = { [k: Exclude<string, "children">]: unknown };

export type ChildrenProp = Record<"children", JSX.Children>;
