import * as THREE from "three";

/**
 * `alphaMap` samples the GREEN channel — three's alphamap_fragment is
 * `diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;`. A canvas fill is unpremultiplied,
 * so a blurred/feathered shape puts its ramp in ALPHA while green stays a flat 255 across the
 * whole footprint: the map comes out binary and no amount of blur softens the edge, it only
 * grows the shape. The ramp has to be in RGB, and the sheet has to be opaque — where alpha is
 * low the browser's un-premultiply on upload throws the RGB precision away, which is a second
 * way to lose the same ramp.
 *
 * Both fall out for free if the shape is drawn onto an OPAQUE BLACK canvas instead of a
 * transparent one, because source-over of white at coverage a over black is exactly 255*a in
 * every channel with alpha left at 255 — bit-identical to what the old readback wrote, without
 * a getImageData/six-million-texel-loop/putImageData round trip per sheet. Callers fill black
 * BEFORE setting ctx.filter, or the blur feathers the backdrop at the canvas border too.
 *
 * The dropped +/-1 jitter was guarding against a wide ramp terracing over a couple of
 * quantisation levels. The blur sigmas here are 0.55-3.4 texels, so the widest ramp on the sheet
 * spans ~10 texels across the full 0-255 range — 25 levels a step, nowhere near a terrace.
 */
export function rampTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Push the shape's own colour outward into the transparent margin.
 *
 * Painting the margin a flat field colour keeps black out of the edges, which is what it was for,
 * but it substitutes a different lie: the field is ONE colour and the leaf is a gradient, so every
 * edge texel that a mipmap or a bilinear tap straddles comes back as a blend of leaf and field.
 * For the fronds the field is sRGB (58, 82, 34) -- luma 73 -- while a shaded frond in the near
 * undergrowth measures luma 40. That is 1.8x, and it arrives as a pale dashed line tracking the
 * inside of every leaf outline in the frame. At the 3x crop it is the single most repeated
 * artificial mark in the picture: several thousand leaves, each drawn round with a light pencil.
 *
 * Dilating instead means an edge texel blends leaf with leaf. Three passes covers the widest tap
 * an 8x anisotropic sample takes at the depths these cards are used at, and the field colour still
 * does its old job at the coarse mip levels, where a whole card averages down to a few texels and
 * something has to be there.
 *
 * Written as a frontier walk rather than four full sweeps. The result is identical -- each pass
 * still rebuilds exactly the ring of texels that touch the current solid set, from that set's
 * colours only -- but a sweep re-tests every texel on the sheet four times and copies 320 kB of
 * pixels and mask per pass to keep this pass's writes out of this pass's reads. Neither is needed:
 * the only texels that can change are the ones adjacent to something solid, and reads and writes
 * are disjoint by construction, because a pass writes only non-solid texels and reads only solid
 * ones. Profiled at ~118 ms of the mount stall across the eleven cutout sheets.
 */
function dilate(px: Uint8ClampedArray, size: number, passes = 4) {
  // FULLY covered, not merely non-transparent. The first pass of this rebuilt only the texels the
  // mask had left at alpha zero, and the halo survived -- because the contaminated texels are the
  // PARTIALLY covered ones. Canvas composites the shape over the field with antialiasing, so a
  // texel at 60% coverage already holds mix(leaf, field, 0.6) in its RGB, and alphaTest at 0.42
  // keeps it. Anything short of solid has field in it and has to be rebuilt from solid neighbours.
  //
  // Shapes thinner than two texels -- a grass blade, a vein -- have no solid texel at all. They
  // fall out through the n == 0 guard below and keep the colour they were drawn with, which is the
  // right answer: there is nothing cleaner to copy.
  const n = size * size;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = px[i * 4 + 3] > 250 ? 1 : 0;

  // The frontier: every non-solid texel touching the solid set. Seeded by one walk of the solid
  // texels' neighbourhoods, then rebuilt each pass from the neighbours of whatever that pass
  // filled, so it shrinks with the ring instead of restarting at the whole sheet.
  const queued = new Uint8Array(n);
  let frontier: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!solid[i]) continue;
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y < size - 1 ? y + 1 : size - 1;
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x < size - 1 ? x + 1 : size - 1;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const j = yy * size + xx;
          if (solid[j] || queued[j]) continue;
          queued[j] = 1;
          frontier.push(j);
        }
      }
    }
  }

  for (let pass = 0; pass < passes && frontier.length > 0; pass++) {
    const filled: number[] = [];
    for (let k = 0; k < frontier.length; k++) {
      const i = frontier[k];
      const x = i % size;
      const y = (i / size) | 0;
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y < size - 1 ? y + 1 : size - 1;
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x < size - 1 ? x + 1 : size - 1;
      let r = 0;
      let g = 0;
      let b = 0;
      let c = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * size;
        for (let xx = x0; xx <= x1; xx++) {
          const j = row + xx;
          if (!solid[j]) continue;
          r += px[j * 4];
          g += px[j * 4 + 1];
          b += px[j * 4 + 2];
          c++;
        }
      }
      if (!c) continue;
      px[i * 4] = r / c;
      px[i * 4 + 1] = g / c;
      px[i * 4 + 2] = b / c;
      filled.push(i);
    }
    // alpha is left alone: this moves colour, never coverage. A rebuilt texel joins the solid set
    // only once the whole pass is over, so the colour walks outward one ring at a time -- that
    // deferral is what the copy of the mask used to buy.
    for (let k = 0; k < filled.length; k++) solid[filled[k]] = 1;

    const next: number[] = [];
    // Anything the pass could not fill -- no solid neighbour yet -- stays on the list; a ring it
    // touches may go solid next pass. It is still marked queued, so it is not re-added below.
    for (let k = 0; k < frontier.length; k++) if (!solid[frontier[k]]) next.push(frontier[k]);
    for (let k = 0; k < filled.length; k++) {
      const i = filled[k];
      const x = i % size;
      const y = (i / size) | 0;
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y < size - 1 ? y + 1 : size - 1;
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x < size - 1 ? x + 1 : size - 1;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const j = yy * size + xx;
          if (solid[j] || queued[j]) continue;
          queued[j] = 1;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
}

/**
 * The alphaTest the cutout callers use: 0.42 in Undergrowth, 0.45 in Jungle and Vines. One number
 * covers all three -- the coverage match below is a fraction-of-texels count, not a per-texel
 * decision, so three hundredths of a threshold moves it by well under a texel.
 */
const CUT = 0.44 * 255;

/**
 * sRGB byte -> linear, and linear -> sRGB byte.
 *
 * A mip chain has to be averaged in linear light. The GPU's own generateMipmap does exactly that --
 * an SRGB8_ALPHA8 texture decodes before it filters and re-encodes after -- and averaging the
 * encoded bytes instead lifts every partly covered texel by a few percent, which is the same pale
 * rim arriving by a third route. Forward is a 256-entry table because it is the hot direction: four
 * taps per output texel at every level.
 */
const S2L = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

function l2s(v: number) {
  return (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
}

/** Fraction of texels that would survive alphaTest with alpha unscaled. */
function coverage(px: Uint8ClampedArray) {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] >= CUT) n++;
  return n / (px.length >> 2);
}

/**
 * The smallest alpha scale that holds `target` coverage — solved, not searched.
 *
 * Alpha is a byte, so `px[i] * s >= CUT` is `px[i] >= CUT / s`: the scale only ever selects an
 * integer threshold, and there are 255 of them. One histogram gives the survivor count at every
 * threshold at once, and the answer is CUT over the largest threshold that still clears the
 * target. That is the exact infimum the old twelve-round bisection was converging on, for one
 * pass over the level instead of twelve.
 */
function coverageScale(px: Uint8ClampedArray, target: number) {
  const total = px.length >> 2;
  const want = target * total;
  if (want <= 0) return 1;
  const hist = new Int32Array(256);
  for (let i = 3; i < px.length; i += 4) hist[px[i]]++;
  let cum = 0;
  for (let t = 255; t >= 1; t--) {
    cum += hist[t];
    // cum is #{alpha >= t}, and it only grows as t falls, so the first t that clears the target
    // is the largest one that does.
    if (cum >= want) return Math.min(4, CUT / t);
  }
  // Not even alpha 1 has enough survivors: open the scale to the bound the search ran to.
  return 4;
}

/**
 * The mip chain, built by hand.
 *
 * dilate() cleans the base level and only the base level. Four passes is four texels at 256, which
 * is half a texel by mip 3, so at the levels these cards are actually sampled at the edge texels
 * were again an average of leaf and transparent FIELD colour -- measurable as an isolated one-pixel
 * spike of about 1.4x the local leaf luma at the same hue, tracing the silhouette of every bright
 * leaf in the frame. Several thousand leaves, each outlined with a light pencil.
 *
 * Two fixes, one per channel. Colour is averaged WEIGHTED BY ALPHA, so a texel that is a tenth
 * covered casts a tenth of a vote and the transparent margin cannot tint the shape however coarse
 * the level gets. Alpha is averaged plainly and then rescaled to hold coverage constant, because a
 * plain average thins a cutout at every halving and eight halvings eats a grass blade's tip long
 * before it is far enough away for anyone to accept losing it.
 *
 * Each level is derived from the previous level's UNSCALED alpha; the coverage scale goes only into
 * the copy that gets uploaded. Chaining off the scaled one compounds the correction eight times.
 *
 * Levels come back as ImageData, not canvases. three uploads a manual mip with texImage2D /
 * texSubImage2D and reads only `.width`/`.height` off it beforehand (WebGLTextures.js,
 * getDimensions), and ImageData is a TexImageSource like any other -- so the canvas element and
 * the putImageData that used to wrap every level were paying a document round trip per level, 88
 * of them across the eleven sheets, to hand the driver bytes it already had.
 */
function buildMips(base: Uint8ClampedArray, size: number) {
  const target = coverage(base);
  const out: ImageData[] = [];
  let src = base;
  let w = size;
  while (w > 1) {
    const hw = w >> 1;
    const dst = new Uint8ClampedArray(hw * hw * 4);
    for (let y = 0; y < hw; y++) {
      for (let x = 0; x < hw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let fr = 0;
        let fg = 0;
        let fb = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const j = ((y * 2 + dy) * w + x * 2 + dx) * 4;
            const k = src[j + 3] / 255;
            r += S2L[src[j]] * k;
            g += S2L[src[j + 1]] * k;
            b += S2L[src[j + 2]] * k;
            // The unweighted sum is the fallback for a 2x2 that is entirely transparent, where the
            // weighted one is 0/0. Those texels never pass alphaTest, but they still get sampled by
            // a bilinear tap from a neighbour that does, so they have to carry the dilated colour
            // outward rather than collapse to black.
            fr += S2L[src[j]];
            fg += S2L[src[j + 1]];
            fb += S2L[src[j + 2]];
            a += k;
          }
        }
        const i = (y * hw + x) * 4;
        const k = a > 0 ? 1 / a : 0;
        dst[i] = a > 0 ? l2s(r * k) : l2s(fr * 0.25);
        dst[i + 1] = a > 0 ? l2s(g * k) : l2s(fg * 0.25);
        dst[i + 2] = a > 0 ? l2s(b * k) : l2s(fb * 0.25);
        dst[i + 3] = a * 0.25 * 255;
      }
    }
    const s = coverageScale(dst, target);
    const lvl = dst.slice();
    if (Math.abs(s - 1) > 0.02) for (let i = 3; i < lvl.length; i += 4) lvl[i] = lvl[i] * s;
    out.push(new ImageData(lvl, hw, hw));
    src = dst;
    w = hw;
  }
  return out;
}

/**
 * A cutout leaf sheet. The shape is rasterised twice — once as a mask, once as colour on an
 * opaque field — and recombined, because a canvas with transparent margins gives back black RGB
 * where alpha is 0, and bilinear filtering then drags that black into every leaf edge. Painting
 * the colour edge-to-edge and taking only the alpha from the mask keeps the bleed clean, which
 * is what lets these run as alphaTest cutouts instead of sorted transparency.
 */
export function cutoutTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, mode: "mask" | "color") => void,
  field: string
) {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return [c, c.getContext("2d")!] as const;
  };
  const [, mctx] = mk();
  mctx.clearRect(0, 0, size, size);
  draw(mctx, "mask");
  const [cc, cctx] = mk();
  cctx.fillStyle = field;
  cctx.fillRect(0, 0, size, size);
  draw(cctx, "color");

  const m = mctx.getImageData(0, 0, size, size).data;
  const out = cctx.getImageData(0, 0, size, size);
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = m[i];
  dilate(out.data, size);
  cctx.putImageData(out, 0, 0);

  const tex = new THREE.CanvasTexture(cc);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // Hand the chain over rather than letting the driver build it. three takes manual mipmaps for a
  // regular canvas texture -- getMipLevels reads mipmaps.length, and each level is uploaded with
  // texSubImage2D at its own level index instead of generateMipmap (WebGLTextures.js).
  // The cast is three's TS defs being narrower than three's runtime: `mipmaps` is typed as one
  // homogeneous array of canvases OR of compressed levels, while the uploader above takes any
  // TexImageSource per level and reads width/height off level 0. Verified against
  // WebGLTextures.js, not assumed.
  tex.mipmaps = [cc, ...buildMips(out.data, size)] as unknown as THREE.Texture["mipmaps"];
  tex.generateMipmaps = false;
  return tex;
}
