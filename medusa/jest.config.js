/**
 * One config, three suites, selected by TEST_TYPE (see package.json's test:* scripts).
 *
 * `unit` is the only one that runs today. It covers pure logic -- the GST head split -- with no
 * database, no container and no Medusa app, which is possible because the india-gst provider was
 * built not to need any of them: the tax module hands it its rates, so it can be constructed with
 * `new` and called directly. That is worth protecting, because a test that needs a live Postgres
 * is a test nobody runs before pushing.
 *
 * @swc/jest rather than ts-jest: it is what Medusa's own scripts already depend on, and it strips
 * types instead of type-checking, which `npx tsc --noEmit` does properly anyway.
 */
module.exports = {
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      { jsc: { parser: { syntax: "typescript", decorators: true }, target: "es2021" } },
    ],
  },
  // The HTTP suite talks to a real Postgres and a real Redis, and both have to be addressed before
  // `@medusajs/test-utils` is imported. `setupFiles` is the only hook that runs that early.
  setupFiles:
    process.env.TEST_TYPE === "integration:http"
      ? ["<rootDir>/integration-tests/setup-env.ts"]
      : [],
  testMatch:
    process.env.TEST_TYPE === "integration:http"
      ? ["**/integration-tests/http/**/*.spec.[jt]s"]
      : process.env.TEST_TYPE === "integration:modules"
        ? ["**/src/modules/**/__tests__/**/*.spec.[jt]s"]
        : ["**/src/**/__tests__/**/*.unit.spec.[jt]s"],
  // Unit specs live beside the module they test, so the integration:modules pattern would sweep
  // them up as well. They are cheap, but running them under a suite that boots a database would
  // hide which half actually failed.
  testPathIgnorePatterns:
    process.env.TEST_TYPE === "integration:modules"
      ? ["/node_modules/", "\\.unit\\.spec\\.[jt]s$"]
      : ["/node_modules/"],
};
