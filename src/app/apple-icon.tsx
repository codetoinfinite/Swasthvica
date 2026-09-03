import { ImageResponse } from "next/og";

/**
 * The iOS home-screen icon.
 *
 * `icon.svg` covers every browser tab, but iOS ignores SVG favicons entirely: a page saved to the
 * home screen with no apple-touch-icon gets a screenshot of the page instead, which for this site
 * is a dark square with a piece of a bottle in it. That is the one place the brand mark was
 * missing on a real device.
 *
 * 180x180 is the largest size iOS asks for (iPhone @3x); everything smaller is downscaled from it,
 * so one file is enough. It is deliberately full-bleed: iOS applies its own squircle mask, and a
 * rounded rectangle drawn here would leave a dark halo inside that mask.
 *
 * The mark is the finer Logo.tsx geometry rather than the thickened favicon, because at 180px the
 * 0.5px leaf outlines resolve to a full device pixel and the six leaves read as a sprig again. The
 * one change kept from icon.svg is the leaf fill: #4e5d3b on #10150c is 1.4:1, which disappears
 * against a busy wallpaper.
 *
 * Satori has no path renderer, so the mark arrives as an SVG data URI and resvg rasterises it. The
 * route is prerendered at build time -- nothing here runs per request.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
<path d="M 36.5 5.6 A 27 27 0 1 1 27.5 5.6" stroke="#c9a24a" stroke-width="1.8" stroke-linecap="round"/>
<circle cx="32" cy="4.5" r="2.6" fill="#c9a24a"/>
<g stroke="#7c9155" stroke-width="1.6" stroke-linecap="round" fill="#7c9155">
<path d="M32 48 V 20" fill="none"/>
<path d="M32 26 C 26 24 22 19 22 14 C 28 15 31 19 32 24 Z" stroke-width="0.5"/>
<path d="M32 26 C 38 24 42 19 42 14 C 36 15 33 19 32 24 Z" stroke-width="0.5"/>
<path d="M32 35 C 27 33.5 24 30 23.5 26 C 28.5 27 31 30.5 32 33.5 Z" stroke-width="0.5"/>
<path d="M32 35 C 37 33.5 40 30 40.5 26 C 35.5 27 33 30.5 32 33.5 Z" stroke-width="0.5"/>
<path d="M32 43 C 28 42 25.5 39.5 25 36.5 C 29 37.5 31 40 32 42 Z" stroke-width="0.5"/>
<path d="M32 43 C 36 42 38.5 39.5 39 36.5 C 35 37.5 33 40 32 42 Z" stroke-width="0.5"/>
</g></svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#10150c",
        }}
      >
        {/* 128 of 180 leaves the ~14% margin Apple's own icons keep inside the mask. */}
        <img
          width={128}
          height={128}
          src={`data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`}
          alt=""
        />
      </div>
    ),
    size
  );
}
