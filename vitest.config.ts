import { defineConfig } from "vitest/config";

/**
 * Standalone config (not merged with vite.config.ts) — the app's Vite config loads the Tailwind
 * and React plugins, neither of which these Node-environment tests need; esbuild already handles
 * the JSX in src/lib/quotes.tsx via tsconfig's `jsx: "react-jsx"`.
 *
 * The generous hook timeout covers tests/api/'s MongoMemoryServer startup: the FIRST ever run on a
 * machine (or an un-cached CI runner) downloads a real mongod binary (~100 MB) before it can start.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
