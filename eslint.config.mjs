import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not ours to lint. `.qa` holds bundle dumps written by the performance scripts, and
    // medusa/ is a separate npm project with its own generated types -- both are build output
    // that happens to live inside this directory tree.
    ".qa/**",
    "medusa/**",
  ]),
]);

export default eslintConfig;
