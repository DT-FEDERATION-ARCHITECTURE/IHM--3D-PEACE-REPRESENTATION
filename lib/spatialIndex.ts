/**
 * Uniform-grid nearest-neighbour index over the target (G-code) point cloud.
 *
 * The naive version is a full scan per live point: fine for a 92-point demo
 * file, quadratic and unusable once a real multi-module job has 100k+ points
 * and the trace has 79k. This keeps deviation computation interactive.
 */
export interface Pt3 { x: number; y: number; z: number; }

export class NearestGrid {
  private cell: number;
  private buckets = new Map<string, number[]>();
  private pts: Pt3[];

  constructor(points: Pt3[], cellSize?: number) {
    this.pts = points;
    // Heuristic cell size: aim for a handful of points per occupied cell.
    this.cell = cellSize ?? NearestGrid.suggestCell(points);
    for (let i = 0; i < points.length; i++) {
      const k = this.key(points[i].x, points[i].y, points[i].z);
      let b = this.buckets.get(k);
      if (!b) { b = []; this.buckets.set(k, b); }
      b.push(i);
    }
  }

  private static suggestCell(points: Pt3[]): number {
    if (points.length === 0) return 1;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const target = Math.cbrt(Math.max(1, points.length));
    return Math.max(span / Math.max(4, target), 1e-6);
  }

  private key(x: number, y: number, z: number): string {
    const c = this.cell;
    return `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`;
  }

  /** Euclidean distance from (x,y,z) to the closest indexed point. */
  nearest(x: number, y: number, z: number): number {
    if (this.pts.length === 0) return 0;
    const c = this.cell;
    const gx = Math.floor(x / c), gy = Math.floor(y / c), gz = Math.floor(z / c);

    let best = Infinity;
    // Expand the search ring until we've found something AND the ring's inner
    // radius exceeds the best distance found (so no closer point can hide).
    for (let r = 0; r < 24; r++) {
      let examined = false;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            // Only the shell of the ring, not its interior (already covered).
            if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            const b = this.buckets.get(`${gx + dx},${gy + dy},${gz + dz}`);
            if (!b) continue;
            examined = true;
            for (const i of b) {
              const p = this.pts[i];
              const ex = x - p.x, ey = y - p.y, ez = z - p.z;
              const d2 = ex * ex + ey * ey + ez * ez;
              if (d2 < best) best = d2;
            }
          }
        }
      }
      if (best < Infinity && Math.sqrt(best) <= r * c) break;
      if (!examined && r > 12 && best < Infinity) break;
    }
    return best === Infinity ? 0 : Math.sqrt(best);
  }
}
