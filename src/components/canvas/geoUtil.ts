import * as THREE from "three";

/**
 * Geometry helpers that exist for one reason: this scene builds roughly 200k triangles of
 * procedural trunk and stone on the main thread the moment the canvas mounts, and every millisecond
 * of that is a millisecond the page cannot scroll. Profiled on a 4x-throttled phone emulation, the
 * three helpers three ships for this work -- `mergeVertices`, `BufferAttribute` accessors and
 * `computeVertexNormals` -- accounted for the largest single block of that stall, entirely in call
 * overhead rather than in arithmetic. These do the same maths straight over the typed arrays.
 */

/**
 * Weld a position-only geometry, keyed on a packed integer instead of a string.
 *
 * `mergeVertices` builds a comma-joined STRING per vertex and looks it up in a plain object, and
 * re-fetches the attribute inside the per-component loop while it does. Same 1e-4 tolerance and the
 * same `~~(v * 1e4 + 0.5)` quantisation, one numeric `Map` key: three components offset into
 * [0, 32768) pack into a double exactly, because 32768^3 = 3.5e13 is well under 2^53.
 *
 * Position only. Anything else on the source is dropped, which is all this scene ever asks for --
 * both callers delete uv and normal first so the seam can weld at all.
 */
export function weldPositions(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = src.getAttribute("position") as THREE.BufferAttribute;
  const p = pos.array as Float32Array;
  const srcIdx = src.getIndex();
  const n = srcIdx ? srcIdx.count : pos.count;
  const si = srcIdx ? (srcIdx.array as ArrayLike<number>) : null;

  const map = new Map<number, number>();
  const out = new Float32Array(pos.count * 3);
  const idx = new Uint32Array(n);
  let next = 0;

  for (let i = 0; i < n; i++) {
    const v = si ? si[i] : i;
    const x = p[v * 3];
    const y = p[v * 3 + 1];
    const z = p[v * 3 + 2];
    const key =
      ((~~(x * 1e4 + 0.5) + 16384) * 32768 + (~~(y * 1e4 + 0.5) + 16384)) * 32768 +
      (~~(z * 1e4 + 0.5) + 16384);
    let hit = map.get(key);
    if (hit === undefined) {
      hit = next++;
      map.set(key, hit);
      out[hit * 3] = x;
      out[hit * 3 + 1] = y;
      out[hit * 3 + 2] = z;
    }
    idx[i] = hit;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(out.slice(0, next * 3), 3));
  g.setIndex(
    new THREE.BufferAttribute(next > 65535 ? idx : new Uint16Array(idx), 1)
  );
  return g;
}

/**
 * `computeVertexNormals` for an indexed geometry, over the typed arrays.
 *
 * Identical maths to three's: the face cross product is left UNNORMALISED so it carries twice the
 * triangle area, which is what makes the accumulation area-weighted, and the sum is normalised per
 * vertex at the end. three's version pays three `getX` calls and two `Vector3` temporaries per
 * triangle corner to say the same thing.
 */
export function fastNormals(geom: THREE.BufferGeometry) {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  const index = geom.getIndex();
  if (!index) throw new Error("fastNormals: indexed geometry only");
  const p = pos.array as Float32Array;
  const ix = index.array as ArrayLike<number>;

  let nrm = geom.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (!nrm || nrm.count !== pos.count) {
    nrm = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geom.setAttribute("normal", nrm);
  }
  const nA = nrm.array as Float32Array;
  nA.fill(0);

  for (let i = 0, il = index.count; i < il; i += 3) {
    const a = ix[i] * 3;
    const b = ix[i + 1] * 3;
    const c = ix[i + 2] * 3;
    const bx = p[b];
    const by = p[b + 1];
    const bz = p[b + 2];
    const cbx = p[c] - bx;
    const cby = p[c + 1] - by;
    const cbz = p[c + 2] - bz;
    const abx = p[a] - bx;
    const aby = p[a + 1] - by;
    const abz = p[a + 2] - bz;
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    nA[a] += nx;
    nA[a + 1] += ny;
    nA[a + 2] += nz;
    nA[b] += nx;
    nA[b + 1] += ny;
    nA[b + 2] += nz;
    nA[c] += nx;
    nA[c + 1] += ny;
    nA[c + 2] += nz;
  }

  for (let i = 0, il = nA.length; i < il; i += 3) {
    const x = nA[i];
    const y = nA[i + 1];
    const z = nA[i + 2];
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l > 0) {
      const k = 1 / l;
      nA[i] = x * k;
      nA[i + 1] = y * k;
      nA[i + 2] = z * k;
    }
  }
  nrm.needsUpdate = true;
}
