import * as THREE from 'three';
import { BoundsDto } from '@/types';

export interface SceneFit {
  scale: number;
  cx: number; cy: number; cz: number;
  /** Part size expressed in scene units (x/z horizontal, y vertical). */
  sceneSize: { x: number; y: number; z: number };
  toScene(px: number, py: number, pz: number): THREE.Vector3;
  /** In-place variant to avoid allocating in hot loops. */
  toSceneInto(px: number, py: number, pz: number, out: THREE.Vector3): THREE.Vector3;
  /** Convert a length in source units (mm) to scene units. */
  mm(v: number): number;
}

/**
 * One transform per loaded part, derived entirely from the G-code's own
 * extrude bounds. Nothing about the bed, camera framing, or bead size is a
 * per-dataset constant — load a different part and everything re-fits.
 *
 * Frame: source X/Y are horizontal, source Z is vertical. Three.js is Y-up,
 * so (x,y,z)_source maps to (x, z, y)_scene.
 */
export function computeFit(b: BoundsDto, targetSpan = 3.2): SceneFit {
  const sizeX = Math.max(1e-6, b.maxX - b.minX);
  const sizeY = Math.max(1e-6, b.maxY - b.minY);
  const sizeZ = Math.max(1e-6, b.maxZ - b.minZ);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const scale = targetSpan / Math.max(sizeX, sizeY);

  // Vertical origin sits on the bed (min Z), not the mid-height, so the part
  // rests on the plate instead of floating half-buried.
  const cz = b.minZ;

  return {
    scale, cx, cy, cz,
    sceneSize: { x: sizeX * scale, y: sizeZ * scale, z: sizeY * scale },
    toScene(px, py, pz) {
      return new THREE.Vector3((px - cx) * scale, (pz - cz) * scale, (py - cy) * scale);
    },
    toSceneInto(px, py, pz, out) {
      return out.set((px - cx) * scale, (pz - cz) * scale, (py - cy) * scale);
    },
    mm(v) { return v * scale; },
  };
}

/* ── Deviation colour ramp ─────────────────────────────────────────────────
   Green → amber → red over the configured tolerance. Thresholds are given in
   source units (mm) by the caller, not baked in here. */
const C_OK = new THREE.Color('#16a34a');
const C_WARN = new THREE.Color('#f59e0b');
const C_BAD = new THREE.Color('#dc2626');

export function deviationColor(mm: number, tolerance: number, out = new THREE.Color()): THREE.Color {
  const t = tolerance > 0 ? mm / tolerance : 0;
  if (t <= 1) return out.copy(C_OK).lerp(C_WARN, Math.max(0, t));
  return out.copy(C_WARN).lerp(C_BAD, Math.min(1, t - 1));
}

export function deviationHex(mm: number, tolerance: number): string {
  return '#' + deviationColor(mm, tolerance).getHexString();
}
