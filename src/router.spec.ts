import { test, expect } from "@playwright/test";
import { Application, Router } from "@oakserver/oak";
import { readFile } from "node:fs/promises";
import { build } from "tsup";

await build({});

const server = new Application();
server.use(
  new Router()
    .get("/", ({ request, response }) => {
      if (request.accepts()?.includes("text/html")) {
        response.type = "text/html";
        response.body = `
<html>
<head>
  <script type="module">
    const { register } = await import("/dist/router.js");
    register();
  </script>
</head>
<body>
Root content
<div data-route>
Hello foos!
<div data-route>
Bar
<a href="/foo/baz">
Go to baz
</a>
</div>
</div>
</body></html>
    `;
      } else {
        response.type = "text/htmax";
        response.body = `<div>Index</div>`;
      }
    })
    .get("/dist/router.js", async ({ response }) => {
      response.type = "text/javascript";
      response.body = await readFile("./dist/router.js");
    })
    .get("/foo/baz", ({ response }) => {
      response.type = "text/htmax";
      response.body = `<div data-route>Baz <a href="/fub">Go fub</a></div>`;
    })
    .get("/fub", ({ response }) => {
      response.type = "text/htmax";
      response.body = `<div data-route>Yo fubbed <a href="/">Go /</a></div>`;
    })
    .routes(),
);

test.beforeAll(() => {
  server.listen({ port: 3000 });
});

test("replaces the right route uri", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState();

  await page.getByText("Go to baz").click();
  await page.waitForLoadState();

  expect((await page.innerHTML("body")).trim()).toBe(`Root content
<div data-route="">
Hello foos!
<div data-route="">Baz <a href="/fub">Go fub</a></div>
</div>`);

  await page.getByText("Go fub").click();
  await page.waitForLoadState();

  expect((await page.innerHTML("body")).trim()).toBe(`Root content
<div data-route="">Yo fubbed <a href="/">Go /</a></div>`);

  await page.getByText("Go /").click();
  await page.waitForLoadState();

  expect((await page.innerHTML("body")).trim()).toBe(`Root content
<div data-route="">Index</div>`);
});
