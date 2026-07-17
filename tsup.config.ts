import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugins/index": "src/plugins/index.ts",
  },
  format: ["esm", "cjs"],
  dts: false,
  platform: "node",
  target: "esnext",
  sourcemap: true,
  clean: true,
  splitting: true,
  skipNodeModulesBundle: true,
});
