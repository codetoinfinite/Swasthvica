import { originProblem, requireOrigins } from "../cors";

/* ------------------------------------------------------------------------------------------------
 * The three allow-lists that decide who may read an authenticated response.
 *
 * Medusa builds all of them with `credentials: true`, so these are not a convenience setting --
 * every entry is a party that may read a logged-in customer's or an admin's data. The two failures
 * worth testing are the ones nobody notices: an entry that quietly matches far more than it looks
 * like it does (a regex), and an entry that quietly matches nothing at all (a trailing slash).
 * ---------------------------------------------------------------------------------------------- */

/** Shorthand: is this entry acceptable, in a production-shaped deployment? */
const strict = (entry: string) => originProblem(entry, false);
/** The same entry on a laptop, where http to a local host is the normal case. */
const loose = (entry: string) => originProblem(entry, true);

describe("originProblem — what an origin has to look like", () => {
  it("accepts the origins this project actually deploys", () => {
    for (const entry of [
      "https://swasthvica.com",
      "https://www.swasthvica.com",
      "https://swasthvica.vercel.app",
      "https://admin.swasthvica.com",
      "https://api.swasthvica.com:8443",
    ]) {
      expect(strict(entry)).toBeNull();
    }
  });

  it("accepts the development origins in .env.template", () => {
    for (const entry of [
      "http://localhost:3000",
      "http://localhost:9000",
      "http://127.0.0.1:3000",
    ]) {
      expect(loose(entry)).toBeNull();
    }
  });

  it("refuses a wildcard", () => {
    expect(strict("*")).toMatch(/wildcard/);
  });

  it("refuses an empty entry, which is what a trailing comma leaves", () => {
    expect(strict("")).toMatch(/empty/);
  });
});

describe("originProblem — regular expressions", () => {
  /**
   * Each of these is compiled into a live RegExp by @medusajs/utils' buildRegexpIfValid, which
   * accepts seven different delimiters. The dangerous one is the unanchored host suffix: it reads
   * like a domain and matches every domain that ends with it.
   */
  it("refuses every delimiter Medusa would compile", () => {
    for (const entry of [
      "/swasthvica\\.com$/",
      "/.*/",
      "/^https:\\/\\/.*\\.swasthvica\\.com$/",
      "~https://swasthvica.com~",
      "@https://swasthvica.com@",
      ";https://swasthvica.com;",
      "%https://swasthvica.com%",
      "#https://swasthvica.com#",
      "'https://swasthvica.com'",
      "/swasthvica/i",
    ]) {
      expect(strict(entry)).toMatch(/regular expression/);
    }
  });

  it("does not mistake a plain origin for a pattern", () => {
    expect(strict("https://swasthvica.com")).toBeNull();
  });
});

describe("originProblem — entries that can never match", () => {
  /**
   * A browser normalises the Origin header before it sends it, and the `cors` package compares a
   * string entry with `===`. So each of these is a list of one that matches nothing, and the symptom
   * is a storefront that cannot reach its own API rather than an error anybody can read.
   */
  it("refuses a trailing slash", () => {
    expect(strict("https://swasthvica.com/")).toMatch(/no trailing slash/);
  });

  it("refuses a path, a query and a fragment", () => {
    expect(strict("https://swasthvica.com/shop")).toMatch(/browser sends/);
    expect(strict("https://swasthvica.com?x=1")).toMatch(/browser sends/);
    expect(strict("https://swasthvica.com#a")).toMatch(/browser sends/);
  });

  it("refuses upper case in the host", () => {
    expect(strict("https://Swasthvica.com")).toMatch(/lower case/);
  });

  it("refuses an embedded credential", () => {
    expect(strict("https://user:pw@swasthvica.com")).toMatch(/browser sends/);
  });

  it("refuses a default port written out, which a browser omits", () => {
    expect(strict("https://swasthvica.com:443")).toMatch(/browser sends/);
    expect(loose("http://localhost:80")).toMatch(/browser sends/);
  });

  it("keeps a non-default port, which a browser does send", () => {
    expect(strict("https://api.swasthvica.com:8443")).toBeNull();
  });

  it("refuses a bare hostname with no scheme", () => {
    expect(strict("swasthvica.com")).toMatch(/is not a URL/);
    expect(strict("//swasthvica.com")).toMatch(/regular expression|is not a URL/);
  });

  it("refuses a scheme a browser never sends", () => {
    for (const entry of ["ftp://swasthvica.com", "file:///etc/passwd"]) {
      expect(strict(entry)).toMatch(/scheme/);
    }
  });
});

describe("originProblem — plain http", () => {
  it("refuses http to a public host in production", () => {
    expect(strict("http://swasthvica.com")).toMatch(/clear text/);
  });

  it("allows http to a local host anywhere, because it never leaves the machine", () => {
    for (const entry of ["http://localhost:3000", "http://127.0.0.1:9000", "http://[::1]:3000"]) {
      expect(strict(entry)).toBeNull();
    }
  });

  it("allows http to a public host on a laptop, where NODE_ENV is not production", () => {
    expect(loose("http://staging.swasthvica.com")).toBeNull();
  });
});

describe("requireOrigins", () => {
  it("hands a good list back exactly as it was given", () => {
    const value = "http://localhost:3000,http://localhost:9000";
    expect(requireOrigins("AUTH_CORS", value, "development")).toBe(value);
  });

  it("tolerates the whitespace a hand-edited .env collects", () => {
    const value = "https://swasthvica.com, https://www.swasthvica.com";
    expect(requireOrigins("STORE_CORS", value, "production")).toBe(value);
  });

  it("refuses an unset or blank value", () => {
    expect(() => requireOrigins("STORE_CORS", undefined, "production")).toThrow(/is not set/);
    expect(() => requireOrigins("STORE_CORS", "", "production")).toThrow(/is not set/);
    expect(() => requireOrigins("STORE_CORS", "   ", "production")).toThrow(/is not set/);
  });

  it("names the variable, the position and the entry, so the fix is obvious", () => {
    expect(() =>
      requireOrigins("STORE_CORS", "https://swasthvica.com,/evil/", "production"),
    ).toThrow(/STORE_CORS\[1\] "\/evil\/"/);
  });

  it("reports every bad entry at once rather than one per restart", () => {
    let message = "";
    try {
      requireOrigins("STORE_CORS", "*,https://a.com/,ftp://b.com", "production");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/\[0\]/);
    expect(message).toMatch(/\[1\]/);
    expect(message).toMatch(/\[2\]/);
  });

  it("is strict in production and forgiving on a laptop about the same list", () => {
    const value = "http://staging.swasthvica.com";
    expect(requireOrigins("STORE_CORS", value, "development")).toBe(value);
    expect(() => requireOrigins("STORE_CORS", value, "production")).toThrow(/clear text/);
  });

  it("accepts the list the .env.template ships with", () => {
    expect(() =>
      requireOrigins("AUTH_CORS", "http://localhost:3000,http://localhost:9000", "development"),
    ).not.toThrow();
  });
});
