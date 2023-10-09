import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/router.ts"],
  format: "esm",
  env: {
    DEV: "true",
  },
});
