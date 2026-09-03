import ReactDOM from "react-dom";
import { ENV_FILES } from "@/components/canvas/envMap";

/**
 * Asks for the environment plate from the document head instead of from inside the scene module.
 *
 * The plate is the last dependent hop in the load: nothing requests /hdr/env-sdr.webp until the
 * stage chunk has been fetched, parsed and executed, so on a 4x-throttled phone it started at
 * 544 ms -- measured with .qa/wf.mjs -- against a first draw at 537 ms. Three files totalling
 * 24 KB, waiting on a chain of two round trips before they are even asked for.
 *
 * `as: "fetch"` with `crossOrigin: "anonymous"` is not decoration; it is the pair that makes the
 * preload match the real request. drei's useEnvironment hands .webp to GainMapLoader, which loads
 * all three files through THREE.FileLoader (an XMLHttpRequest, withCredentials left false) -- see
 * @monogrid/gainmap-js/dist/decode.js. That request has mode "cors" and credentials "same-origin".
 * A preload link with no crossorigin attribute is "no-cors"/"include" instead, which the browser
 * treats as a different resource: the file downloads twice and the console warns that the preload
 * went unused. Anonymous is what lines the two up.
 *
 * Rendered only from the two routes that mount a canvas. The eleven DOM-only policy pages have no
 * scene and would be paying 24 KB for a plate they never decode.
 */
export default function PreloadEnv() {
  for (const href of ENV_FILES) ReactDOM.preload(href, { as: "fetch", crossOrigin: "anonymous" });
  return null;
}
