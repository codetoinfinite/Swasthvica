import { errorHandler } from "@medusajs/framework/http";
import type { MedusaErrorHandlerFunction } from "@medusajs/framework/http";
import { redact, scrubError } from "./redact";

/* ------------------------------------------------------------------------------------------------
 * The last middleware on every request.
 *
 * It scrubs the error and then hands it to the framework's own handler, rather than replacing that
 * handler. `defineMiddlewares({ errorHandler })` *substitutes* -- router.js:120 is
 * `app.use(sourceErrorHandler ?? errorHandler())` -- so anything written here that is not a
 * delegation is a second copy of the MedusaError-to-status map, and a copy of a map is a map that
 * drifts. The status a customer gets for a duplicate e-mail should change when Medusa changes it,
 * not when someone remembers to update this file.
 *
 * So the only thing this adds is the scrub, and the scrub happens first because both leaks are
 * downstream of it: `formatException` reads `err.detail` to build the 422 body, and `logger.error`
 * writes the whole object. See src/lib/redact.ts for what each of those carries.
 *
 * The one other thing it adds is a guard against a thrown non-object, which the framework handler
 * does not survive -- see `toError`.
 * ---------------------------------------------------------------------------------------------- */

const delegate = errorHandler();

/**
 * Anything at all, turned into something the framework handler can read.
 *
 * `formatException` opens with `switch (err.code)` and the handler later asks `"issues" in err`.
 * Both throw on a thrown primitive: `throw null` gives "Cannot read properties of null (reading
 * 'code')" and a rejected string gives "Cannot use 'in' operator to search for 'issues' in ...".
 * A throw inside the error handler is the worst kind, because there is no handler after it -- the
 * request falls through to Express's default, which answers with an HTML stack trace in
 * development and leaves the connection to time out under some proxies.
 *
 * Nobody writes `throw null` on purpose, but `Promise.reject("timed out")` is ordinary in a
 * third-party SDK, and a rejected promise inside a route reaches here exactly the same way.
 *
 * Only primitives are wrapped. A thrown plain object is left alone, because that is what a `pg`
 * error can look like after it has crossed a serialisation boundary and `formatException` reads it
 * correctly.
 */
function toError(error: unknown): unknown {
  if (error !== null && typeof error === "object") return error;
  const described =
    typeof error === "string" && error.trim().length > 0
      ? redact(error)
      : `A ${error === null ? "null" : typeof error} value was thrown.`;
  return new Error(described);
}

/**
 * Four declared parameters, and that is load-bearing: Express decides a function is an error
 * handler by its `length`, so dropping the unused `next` would register this as ordinary
 * middleware and every error would fall through to Express's own HTML error page.
 */
export const scrubbingErrorHandler: MedusaErrorHandlerFunction = (error, req, res, next) => {
  return delegate(scrubError(toError(error)), req, res, next);
};
