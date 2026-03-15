import { defineConfig } from "tsup";

export default defineConfig([
  // Library / CLI build (unchanged)
  {
    entry: ["src/index.ts", "src/cli/main.ts"],
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
  },
  // Self-contained single-file bot bundle (all deps inlined, CJS for dotenv compatibility)
  {
    name: "bot",
    entry: { bot: "src/decision-maker/bot.ts" },
    format: ["cjs"],
    outDir: "dist/bot",
    splitting: false,
    sourcemap: true,
    clean: false, // don't wipe the library build
    noExternal: [/.*/], // bundle everything – no node_modules needed on server
  },
]);
