/**
 * The environment plate, as the three files drei's GainMapLoader wants: an SDR webp, the gain map
 * that lifts it back to high range, and the metadata that says by how much.
 *
 * It is a module constant rather than an array literal in the JSX because `useEnvironment` keys
 * its loader cache on the value it is handed. A fresh array every render is a fresh key every
 * render, which re-decodes the plate and re-runs PMREM on every commit.
 */
export const ENV_FILES = ["/hdr/env-sdr.webp", "/hdr/env-gain.webp", "/hdr/env.json"];
