/* ------------------------------------------------------------------------------------------------
 * Checking the CORS allow-lists before the server accepts them.
 *
 * `#createCorsOptions` in @medusajs/framework/dist/http/router.js builds every one of the three
 * lists with `credentials: true`. That single flag is what makes this file worth having: an origin
 * on one of these lists can read authenticated responses, so the list *is* the session boundary.
 *
 * Two ways a deployment gets that wrong, and both are silent:
 *
 *   1. A regex. `parseCorsOrigins` runs each comma-separated entry through `buildRegexpIfValid`,
 *      which turns anything wrapped in / ~ @ ; % # or ' into a live RegExp. So `/swasthvica\.com$/`
 *      looks like a hostname and is in fact a pattern that `https://evil-swasthvica.com` satisfies,
 *      and `/.*\/` allows the entire internet to read logged-in responses. Nothing here needs a
 *      pattern -- this shop has a storefront domain, a preview domain and an admin domain -- so the
 *      whole class is refused rather than audited.
 *
 *   2. A near-miss that matches nothing. The `cors` package compares a string entry to the browser's
 *      `Origin` header with `===`, and a browser never sends a trailing slash, a path, a port it was
 *      not served on, or upper case. `https://swasthvica.com/` is not a stricter version of
 *      `https://swasthvica.com`; it is an entry that can never match, and the first anyone hears of
 *      it is a storefront that cannot reach its own API.
 *
 * Both are boot failures. A CORS list is read once at start-up, so the only moment this can be
 * checked without costing a request is now, and a server that refuses to start is a five-minute
 * problem where a server that starts with an open list is an incident.
 * ---------------------------------------------------------------------------------------------- */

/** The delimiters `buildRegexpIfValid` accepts. An entry wrapped in any of them becomes a RegExp. */
const REGEX_DELIMITERS = "/~@;%#'";

/** Hosts that may be reached over plain http, because they never leave the machine. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * One entry, checked.
 *
 * Returns the reason it is unacceptable, or `null` when it is fine. Split out from the loop so the
 * unit tests can name each rule rather than asserting on a concatenated message.
 */
export function originProblem(entry: string, allowInsecure: boolean): string | null {
  if (entry.length === 0) {
    return "is empty (a stray comma, or a trailing one)";
  }

  if (entry === "*") {
    return 'is "*". With credentials enabled there is no such thing as a safe wildcard; list the origins.';
  }

  const first = entry[0];
  if (REGEX_DELIMITERS.includes(first) && entry.length > 1 && entry.lastIndexOf(first) > 0) {
    return `looks like a regular expression. Medusa compiles entries wrapped in ${REGEX_DELIMITERS.split("").join(" ")} into patterns, and an unanchored one matches hostnames you did not intend. List the origins in full.`;
  }

  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return "is not a URL. An origin looks like https://shop.example.com -- scheme, host, and a port only if it is not the default.";
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return `uses the ${url.protocol.replace(":", "")} scheme. A browser only ever sends http or https in an Origin header.`;
  }

  // `url.origin` drops the path, the query, the fragment, any credentials, a default port and the
  // case of the host -- which is exactly the normalisation a browser applies before it sends the
  // header. So anything the round trip changes is something the `===` comparison would never match.
  if (url.origin !== entry) {
    return `is not in the form a browser sends. It would have to be written "${url.origin}" -- no trailing slash, no path, no credentials, lower case.`;
  }

  if (url.protocol === "http:" && !allowInsecure && !LOCAL_HOSTS.has(url.hostname)) {
    return "is http. Session cookies are sent to it in clear text; use https, or run the server with NODE_ENV=development.";
  }

  return null;
}

/**
 * A comma-separated allow-list, checked and handed back unchanged.
 *
 * Unchanged rather than normalised on purpose: the value the server actually uses is the raw string
 * out of the environment, parsed later by Medusa's own `parseCorsOrigins`. Returning a cleaned-up
 * version here would mean two different lists existed and only one of them was checked.
 */
export function requireOrigins(name: string, value: string | undefined, nodeEnv: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is not set. Copy .env.template to .env and fill it in.`);
  }

  const allowInsecure = nodeEnv !== "production";
  const problems = value
    .split(",")
    .map((entry) => entry.trim())
    .map((entry, index) => {
      const problem = originProblem(entry, allowInsecure);
      return problem ? `  ${name}[${index}] "${entry}" ${problem}` : null;
    })
    .filter((line): line is string => line !== null);

  if (problems.length > 0) {
    throw new Error(
      `${name} is not a safe list of origins. Every entry is allowed to read authenticated responses, so:\n${problems.join("\n")}`,
    );
  }

  return value;
}
