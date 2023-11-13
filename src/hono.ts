import type { Context, Env, Hono, Schema } from "hono";
import { Fragment, jsx, renderToString } from "./jsx/jsx-runtime.ts";

export type Routes = Record<string, JSX.Component | undefined>;

export const setupRoutes = <
  E extends Env,
  S extends Schema,
  BasePath extends string,
>(
  app: Hono<E, S, BasePath>,
  opts: {
    layout: Routes;
    index: Routes;
  },
) => {
  const layoutRoutes = opts.layout;
  const indexRoutes = opts.index;
  const handleRoute =
    (
      routePath: keyof typeof indexRoutes | keyof typeof layoutRoutes,
      Layout?: JSX.Component | null,
      Index?: JSX.Component | null,
      status = 200,
    ) =>
    async (c: Context) => {
      const isLayout = c.req.query("_layout") != null;
      const isIndex = c.req.query("_index") != null;

      const element = isLayout
        ? Layout
          ? jsx("div", {
              "data-route": "/" + routePath.split("/").pop(),
              children: jsx(Layout, null),
            })
          : jsx("progress", { "data-route": "" })
        : Index &&
          (isIndex
            ? jsx("div", { "data-route": "/", children: jsx(Index, null) })
            : (() => {
                const segments = routePath.split("/");
                const layoutPaths = segments.map((_, i) =>
                  segments.slice(0, i + 1).join("/"),
                );
                const layoutComponents: JSX.Component[] = layoutPaths.map(
                  (path) =>
                    layoutRoutes[path] ||
                    (({ children }) => Fragment({ children })),
                );

                return layoutComponents.reduceRight(
                  (prev, SegmentLayout, i) =>
                    jsx(SegmentLayout, {
                      children: jsx("div", {
                        "data-route": "/" + (segments[i + 1] || ""),
                        children: prev,
                      }),
                    }),
                  jsx(Index, null),
                );
              })());

      c.status(status);

      return element
        ? c.html(await renderToString(element))
        : c.text("Not found", 404);
    };

  for (const [path, Index] of Object.entries(indexRoutes)) {
    app.get(
      path,
      handleRoute(path as keyof typeof indexRoutes, layoutRoutes[path], Index),
    );
  }

  for (const [path, Layout] of Object.entries(layoutRoutes)) {
    app.get(path, handleRoute(path, Layout, null));
  }

  app.get(
    "*",
    handleRoute("", null, () => Fragment({ children: "Not found" }), 404),
  );
};

export const HTMLRoot = ({
  lang,
  title,
  dev,
}: {
  lang?: string;
  title?: string;
  dev?: boolean;
}) => {
  return jsx("html", {
    lang,
    children: [
      jsx("head", {
        children: [
          title ? jsx("title", { children: title }) : null,
          jsx("meta", { charset: "utf-8" }),
          jsx("meta", {
            name: "viewport",
            content: "width=device-width, initial-scale=1",
          }),
          dev ? jsx("script", { src: "/public/htmax.js" }) : null,
        ],
      }),
      jsx("body", { children: [] }),
    ],
  });
};
