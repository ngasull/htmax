Minimal layers helping you build interactive applications around web standards.

## Installation ( for now (: )

```sh
mkdir hello-world
cd hello-world
git clone https://github.com/ngasull/htmax
```

## Usage with Hono

```jsx
/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "./htmax/src/jsx/jsx-runtime.ts"

import { Hono } from "https://deno.land/x/hono@v3.8.0-rc.2/mod.ts";
import { compress, serveStatic } from "https://deno.land/x/hono@v3.8.0-rc.2/middleware.ts";
import { setupRoutes } from "./htmax/src/hono.ts";

const app = new Hono()
app.use("*", compress());
app.use("/public/htmax.js", serveStatic({ path: "./htmax/dist/register.js" }));
app.use("/public/*", serveStatic({ root: "./" }));

setupRoutes(app, {
  layout: {
    "": ({ children }) => (
      <html lang="en">
        <head>
          <title>World builder</title>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <script src="/public/htmax.js"></script>
        </head>
        <body>
          {children}
        </body>
      </html>
    ),
  },
  index: {
    "": () => (
      <>
        <h1>My website</h1>
        <p>Yo <a href="/world">world</a> ✌️</p>
      </>
    ),
    "/world": () => (
      <>
        <h1>World</h1>
        <p>Time to build some world 🌍</p>
      </>
    ),
  }
});

Deno.serve({ port: 3000 }, app.fetch);
```

```sh
deno run --watch -A server.tsx
```

## `tsconfig`/`deno.json` without `@jsx*` pragma

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "./htmax/src/jsx"
  }
}
```
