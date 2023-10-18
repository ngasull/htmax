import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/register.ts",
  format: "iife",
  output: {
    dir: "dist",
    format: "esm",
  },
  plugins: [typescript(), terser()],
};
