import * as THREE from 'three';

/**
 * Builds a real deposited-bead mesh along a polyline.
 *
 * Why not TubeGeometry: a printed FDM/pellet bead is not a circular tube --
 * it is *wider than it is tall* (deposition width vs layer height), with a
 * rounded profile where it meets the layer below. A circular tube reads as
 * "wireframe path"; an elliptical cross-section reads as "printed material".
 * This also avoids CatmullRom resampling, so it is O(n) over raw points and
 * cheap enough to rebuild live.
 *
 * Frames are built from the tangent + world-up rather than a rotation-minimising
 * transport, which is correct and stable for near-planar layer deposition
 * (the case here: the toolchain's normals are 0,0,-1 throughout).
 */

export interface BeadParams {
  /** Half of the deposition width, in scene units. */
  halfWidth: number;
  /** Half of the layer height, in scene units. */
  halfHeight: number;
  /** Cross-section resolution. 8 is plenty; 6 is fine for the ghost. */
  radialSegments?: number;
}

const _T = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

export function buildBeadGeometry(
  points: THREE.Vector3[],
  params: BeadParams,
  colors?: THREE.Color[],
): THREE.BufferGeometry | null {
  const n = points.length;
  if (n < 2) return null;

  const { halfWidth, halfHeight, radialSegments = 8 } = params;
  const rs = radialSegments;

  const positions = new Float32Array(n * rs * 3);
  const normals = new Float32Array(n * rs * 3);
  const colorArr = colors ? new Float32Array(n * rs * 3) : null;

  // Precompute the unit cross-section so the inner loop is pure arithmetic.
  const cosT = new Float32Array(rs);
  const sinT = new Float32Array(rs);
  for (let j = 0; j < rs; j++) {
    const theta = (j / rs) * Math.PI * 2;
    cosT[j] = Math.cos(theta);
    sinT[j] = Math.sin(theta);
  }

  for (let i = 0; i < n; i++) {
    // Central-difference tangent gives smoother frames than forward-difference.
    if (i === 0) _T.subVectors(points[1], points[0]);
    else if (i === n - 1) _T.subVectors(points[n - 1], points[n - 2]);
    else _T.subVectors(points[i + 1], points[i - 1]);

    if (_T.lengthSq() < 1e-14) _T.set(1, 0, 0);
    _T.normalize();

    _side.crossVectors(_T, _worldUp);
    // Vertical travel move: tangent parallel to up, pick any stable side vector.
    if (_side.lengthSq() < 1e-10) _side.set(1, 0, 0);
    _side.normalize();
    _up.crossVectors(_side, _T).normalize();

    const px = points[i].x, py = points[i].y, pz = points[i].z;
    const cr = colors ? colors[i].r : 0;
    const cg = colors ? colors[i].g : 0;
    const cb = colors ? colors[i].b : 0;

    for (let j = 0; j < rs; j++) {
      const c = cosT[j], s = sinT[j];
      const idx = (i * rs + j) * 3;

      positions[idx]     = px + _side.x * c * halfWidth + _up.x * s * halfHeight;
      positions[idx + 1] = py + _side.y * c * halfWidth + _up.y * s * halfHeight;
      positions[idx + 2] = pz + _side.z * c * halfWidth + _up.z * s * halfHeight;

      // True ellipse normal is (cos/a, sin/b), not the position offset.
      let nx = _side.x * (c / halfWidth) + _up.x * (s / halfHeight);
      let ny = _side.y * (c / halfWidth) + _up.y * (s / halfHeight);
      let nz = _side.z * (c / halfWidth) + _up.z * (s / halfHeight);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normals[idx] = nx / len;
      normals[idx + 1] = ny / len;
      normals[idx + 2] = nz / len;

      if (colorArr) {
        colorArr[idx] = cr;
        colorArr[idx + 1] = cg;
        colorArr[idx + 2] = cb;
      }
    }
  }

  // Index buffer: quad strip between consecutive cross-sections.
  const quadCount = (n - 1) * rs;
  const indices = quadCount * 4 > 65535
    ? new Uint32Array(quadCount * 6)
    : new Uint16Array(quadCount * 6);

  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    const base = i * rs;
    const next = (i + 1) * rs;
    for (let j = 0; j < rs; j++) {
      const jn = (j + 1) % rs;
      const a = base + j, b = base + jn, c = next + jn, d = next + j;
      indices[k++] = a; indices[k++] = b; indices[k++] = d;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (colorArr) geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Splits a point list into contiguous extruding runs, so travel moves never
 * draw a bead through empty space. Returns index ranges into the original array.
 */
export function extrudeRuns<T extends { extruding: boolean }>(points: T[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i].extruding) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start > 1) runs.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0 && points.length - start > 1) runs.push([start, points.length]);
  return runs;
}

/**
 * Distance-based decimation. The live EGM stream runs at ~248 Hz, which means
 * huge numbers of near-identical points; keeping them all would balloon the
 * geometry for no visible gain. Dropping points closer than a fraction of the
 * bead width is visually lossless.
 */
export function decimate<T extends { x: number; y: number; z: number }>(pts: T[], minDist: number): T[] {
  if (pts.length < 3) return pts;
  const min2 = minDist * minDist;
  const out: T[] = [pts[0]];
  let last = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dx = p.x - last.x, dy = p.y - last.y, dz = p.z - last.z;
    if (dx * dx + dy * dy + dz * dz >= min2) {
      out.push(p);
      last = p;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
