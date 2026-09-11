import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/* ------------------------------------------------------------------------------------------------
 * The storefront's test runner.
 *
 * Separate from medusa/jest.config.js on purpose: that package is CommonJS with a Postgres and a
 * Redis behind it, and its integration suite boots a real Medusa. Nothing here touches a database.
 * These are the pure decisions the storefront makes on its own -- what a status means in English,
 * what shape a reference has, what the API route does with a body it does not like -- and they run
 * in under a second with no services running.
 *
 * `node` rather than a DOM environment because none of it renders. The React components are covered
 * by the Playwright-shaped work in docs/, not by simulating a browser in a unit test.
 * ---------------------------------------------------------------------------------------------- */

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // tsconfig's `@/*` path, spelled again for the runner. A dedicated plugin would read it from
      // tsconfig.json, but one alias is not worth a dependency.
      "@": src,
      // `server-only` throws on import outside a React Server Component so that a client bundle
      // cannot pull a secret in. The package ships `empty.js` for exactly this -- it is what the
      // `react-server` export condition resolves to -- so a test can import a server module
      // directly. The protection it provides is a build-time one and is unaffected.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A test that hangs on a real socket is a test that never tells you anything.
    testTimeout: 5000,
  },
});
