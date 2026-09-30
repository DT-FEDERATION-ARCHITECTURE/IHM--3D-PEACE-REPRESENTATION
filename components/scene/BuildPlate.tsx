'use client';

import * as THREE from 'three';
import { useMemo } from 'react';
import { Grid } from '@react-three/drei';
import { SceneFit } from '@/lib/sceneFit';

/**
 * The build plate. Its footprint follows the fitted part, so a long thin
 * module and a tall compact one both sit on a sensibly-proportioned bed.
 */
export function BuildPlate({ fit }: { fit: SceneFit | null }) {
  const { w, d } = useMemo(() => {
    if (!fit) return { w: 4, d: 4 };
    return {
      w: Math.max(1.2, fit.sceneSize.x * 1.45),
      d: Math.max(1.2, fit.sceneSize.z * 1.45),
    };
  }, [fit]);

  return (
    <group>
      {/* Infinite technical grid — reads as a drafting surface rather than a floor */}
      <Grid
        position={[0, -0.006, 0]}
        args={[10, 10]}
        cellSize={Math.max(w, d) / 24}
        cellThickness={0.6}
        cellColor="#cbd5e1"
        sectionSize={Math.max(w, d) / 6}
        sectionThickness={1.1}
        sectionColor="#94a3b8"
        fadeDistance={Math.max(w, d) * 4.5}
        fadeStrength={1.2}
        infiniteGrid
        followCamera={false}
      />

      {/* Plate slab */}
      <mesh position={[0, -0.028, 0]} receiveShadow>
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial color="#e7e5e4" roughness={0.78} metalness={0.08} />
      </mesh>

      {/* Darker rim just under the slab, gives the plate visible thickness */}
      <mesh position={[0, -0.062, 0]}>
        <boxGeometry args={[w * 1.02, 0.025, d * 1.02]} />
        <meshStandardMaterial color="#a8a29e" roughness={0.6} metalness={0.25} />
      </mesh>

      {/* Print-area outline on the plate surface */}
      {fit && (
        <lineSegments position={[0, 0.001, 0]}>
          <edgesGeometry
            args={[new THREE.PlaneGeometry(fit.sceneSize.x, fit.sceneSize.z).rotateX(-Math.PI / 2)]}
          />
          <lineBasicMaterial color="#64748b" transparent opacity={0.5} />
        </lineSegments>
      )}
    </group>
  );
}

export default BuildPlate;
