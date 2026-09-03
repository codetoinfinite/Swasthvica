import * as THREE from "three";

const CREAM = "#f2ead8";
const BRASS = "#c9a24a";

function letterspaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  tracking: number
) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1);
  let x = cx - total / 2;
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + tracking;
  });
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.34, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.34, 0, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.restore();
}

/** Sprig: central stem + paired leaves, gold line art. */
function sprig(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  ctx.save();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + h * 0.06, y - h * 0.5, x, y - h);
  ctx.stroke();
  const pairs = 4;
  for (let i = 0; i < pairs; i++) {
    const t = 0.18 + (i / pairs) * 0.72;
    const py = y - h * t;
    const len = h * 0.3 * (1 - t * 0.4);
    leaf(ctx, x, py, len, -Math.PI * 0.38);
    leaf(ctx, x, py, len, Math.PI - Math.PI * 0.62);
  }
  ctx.restore();
}

/**
 * `res` is the bitmap size; everything below is written in a fixed 1024 design space and scaled
 * into it. The label wraps a cylinder 1.1 world units tall, so a 1024 bake is 931 px per world
 * unit -- fine at the page's own framing (484 device px/unit at dpr 2) and not fine under the
 * hover loupe, which magnifies 3x and asks for 1453. 2048 answers with 1862.
 */
export async function bakeLabelTexture(
  caps = "SHAMPOO",
  sizeLine = "HERBAL \u00b7 250 ML",
  res = 1024,
): Promise<THREE.CanvasTexture> {
  const style = getComputedStyle(document.body);
  const playfair = style.getPropertyValue("--font-playfair").trim() || "Georgia, serif";
  const inter = style.getPropertyValue("--font-inter").trim() || "system-ui, sans-serif";
  await document.fonts.ready;
  try {
    await Promise.all([
      document.fonts.load(`500 88px ${playfair}`),
      document.fonts.load(`400 30px ${inter}`),
    ]);
  } catch {
    /* fallback stacks still render */
  }

  const c = document.createElement("canvas");
  c.width = res;
  c.height = res;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, res, res);
  // One scale here instead of a factor threaded through forty coordinates: every position, font
  // size and line width below stays quoted in the 1024 space this artwork was drawn in, and the
  // hairlines thicken with the bitmap rather than thinning away to nothing at 2048.
  ctx.scale(res / 1024, res / 1024);
  const cx = 512;

  // top sprig
  sprig(ctx, cx, 190, 130);

  // wordmark
  ctx.fillStyle = CREAM;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 92px ${playfair}`;
  ctx.fillText("Swasthvica", cx, 320);

  // gold rule with leaf glyph
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 200, 372);
  ctx.lineTo(cx - 36, 372);
  ctx.moveTo(cx + 36, 372);
  ctx.lineTo(cx + 200, 372);
  ctx.stroke();
  leaf(ctx, cx - 20, 372, 40, 0);

  // category caps
  ctx.fillStyle = BRASS;
  ctx.textAlign = "left";
  ctx.font = `400 44px ${inter}`;
  letterspaced(ctx, caps, cx, 448, 26);

  // supporting caps line
  ctx.font = `400 22px ${inter}`;
  ctx.fillStyle = "rgba(242,234,216,0.75)";
  letterspaced(ctx, sizeLine, cx, 500, 8);

  // lower botanical line art — arcs of stems + leaves
  ctx.strokeStyle = "rgba(201,162,74,0.9)";
  ctx.lineWidth = 2.5;
  for (let s = -1; s <= 1; s += 2) {
    ctx.beginPath();
    ctx.moveTo(cx, 940);
    ctx.quadraticCurveTo(cx + s * 190, 840, cx + s * 240, 660);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const t = 0.25 + i * 0.17;
      const px = cx + s * 190 * (t * t * 1.35);
      const py = 940 - 260 * t;
      leaf(ctx, px, py, 46 - i * 4, s > 0 ? -0.9 + i * 0.16 : Math.PI + 0.9 - i * 0.16);
    }
  }
  sprig(ctx, cx, 950, 210);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
