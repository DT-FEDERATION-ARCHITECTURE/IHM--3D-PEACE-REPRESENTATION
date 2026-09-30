'use client';

import * as THREE from 'three';
import { useMemo, useEffect } from 'react';
import { ToolpathPointDto } from '@/types';
import { SceneFit } from '@/lib/sceneFit';
import { buildBeadGeometry, extrudeRuns } from '@/lib/beadGeometry';

/* The desired piece is a fixed reference: built once per toolpath, never
   per-frame. A translucent solid alone goes muddy where beads overlap, so a
   subtle height gradient is baked into vertex colours — it keeps the layer
   structure legible even at 20% opacity. */

const C_LOW = new THREE.Color('#38bdf8');
const C_HIGH = new THREE.Color('#6366f1');

export function GhostPiece({
  points, fit, opacity, showTravel, layerClip, beadWidthMm, layerHeightMm,
}: {
  points: ToolpathPointDto[];
  fit: SceneFit;
  opacity: number;
  showTravel: boolean;
  layerClip: number | null;
  beadWidthMm: number;
  layerHeightMm: number;
}) {
  const visible = useMemo(
    () => (layerClip == null ? points : points.filter(p => p.layer <= layerClip)),
    [points, layerClip],
  );

  const { geometries, travelGeo } = useMemo(() => {
    const flagged = visible.map(p => ({ ...p, extruding: p.moveType === 'EXTRUDE' }));
    const runs = extrudeRuns(flagged);

    let minZ = Infinity, maxZ = -Infinity;
    for (const p of visible) { if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z; }
    const span = Math.max(1e-6, maxZ - minZ);

    const geos: THREE.BufferGeometry[] = [];
    for (const [s, e] of runs) {
      const pts: THREE.Vector3[] = [];
      const cols: THREE.Color[] = [];
      for (let i = s; i < e; i++) {
        const p = visible[i];
        pts.push(fit.toScene(p.x, p.y, p.z));
        cols.push(new THREE.Color().copy(C_LOW).lerp(C_HIGH, (p.z - minZ) / span));
      }
      const g = buildBeadGeometry(
        pts,
        { halfWidth: fit.mm(beadWidthMm) / 2, halfHeight: fit.mm(layerHeightMm) / 2, radialSegments: 6 },
        cols,
      );
      if (g) geos.push(g);
    }

    // Travel moves as thin dashed-looking lines — off by default, useful when
    // diagnosing why the head went somewhere unexpected.
    let tGeo: THREE.BufferGeometry | null = null;
    if (showTravel) {
      const seg: number[] = [];
      for (let i = 1; i < visible.length; i++) {
        if (visible[i].moveType !== 'TRAVEL') continue;
        const a = fit.toScene(visible[i - 1].x, visible[i - 1].y, visible[i - 1].z);
        const b = fit.toScene(visible[i].x, visible[i].y, visible[i].z);
        seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      if (seg.length) {
        tGeo = new THREE.BufferGeometry();
        tGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      }
    }

    return { geometries: geos, travelGeo: tGeo };
  }, [visible, fit, showTravel, beadWidthMm, layerHeightMm]);

  // Geometries are created imperatively, so dispose them when they're replaced.
  useEffect(() => () => {
    geometries.forEach(g => g.dispose());
    travelGeo?.dispose();
  }, [geometries, travelGeo]);

  return (
    <group>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial
            vertexColors
            transparent
            opacity={opacity}
            depthWrite={false}
            roughness={0.65}
            metalness={0.0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {travelGeo && (
        <lineSegments geometry={travelGeo}>
          <lineBasicMaterial color="#94a3b8" transparent opacity={0.35} />
        </lineSegments>
      )}
    </group>
  );
}

export default GhostPiece;
