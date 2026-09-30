'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SceneFit, deviationColor } from '@/lib/sceneFit';
import { NearestGrid } from '@/lib/spatialIndex';
import { LiveBeadBuilder } from '@/lib/liveBead';
import { liveBuffer } from '@/lib/liveBuffer';
import { ColorMode } from '@/store/twinStore';

const C_MATERIAL = new THREE.Color('#ea7317');

/**
 * Le cordon réellement déposé.
 *
 * Rien ne passe par React : à chaque image on ajoute les échantillons arrivés
 * depuis la dernière, dans une géométrie pré-allouée, puis on fait UN SEUL
 * envoi GPU via flush(). Le coût par point est constant.
 */
export function LivePiece({
  fit, grid, colorMode, tolerance, beadWidthMm, layerHeightMm, resetToken,
}: {
  fit: SceneFit;
  grid: NearestGrid | null;
  colorMode: ColorMode;
  tolerance: number;
  beadWidthMm: number;
  layerHeightMm: number;
  resetToken: string;
}) {
  const builder = useMemo(() => new LiveBeadBuilder(60000, 6), []);
  const consumed = useRef(0);
  const inRun = useRef(false);
  /** Premier point d'un cordon, gardé en attente : il faut le point suivant
   *  pour connaître la direction, sinon le premier anneau est mal orienté. */
  const pending = useRef<THREE.Vector3 | null>(null);
  const pendingColor = useRef(new THREE.Color());
  const lastKept = useRef(new THREE.Vector3());
  const hasKept = useRef(false);
  const _p = useRef(new THREE.Vector3()).current;
  const _c = useRef(new THREE.Color()).current;

  useEffect(() => {
    builder.reset();
    consumed.current = 0;
    inRun.current = false;
    pending.current = null;
    hasKept.current = false;
  }, [resetToken, builder]);

  useEffect(() => () => builder.dispose(), [builder]);

  useFrame(() => {
    const samples = liveBuffer.samples;
    if (consumed.current >= samples.length) return;

    const halfW = fit.mm(beadWidthMm) / 2;
    const halfH = fit.mm(layerHeightMm) / 2;
    const minStep = fit.mm(beadWidthMm / 3);
    const minStep2 = minStep * minStep;

    const closeRun = () => {
      if (inRun.current && builder.started) {
        builder.append(builder.lastPoint, _c.copy(C_MATERIAL), halfW, halfH, 0);
      }
      inRun.current = false;
      pending.current = null;
    };

    while (consumed.current < samples.length) {
      const s = samples[consumed.current++];

      if (!s.extruding) { closeRun(); continue; }

      fit.toSceneInto(s.x, s.y, s.z, _p);

      // Couleur du point courant
      if (colorMode === 'deviation' && grid) {
        deviationColor(grid.nearest(s.x, s.y, s.z), tolerance, _c);
      } else {
        _c.copy(C_MATERIAL);
      }

      // Début de cordon : on met le premier point en attente.
      if (!inRun.current) {
        pending.current = _p.clone();
        pendingColor.current.copy(_c);
        inRun.current = true;
        continue;
      }

      // Deuxième point : la direction est connue, on peut écrire les deux.
      if (pending.current) {
        if (_p.distanceToSquared(pending.current) < minStep2) continue;
        builder.primeTangent(pending.current, _p);
        builder.append(pending.current, pendingColor.current, halfW, halfH, 0);
        builder.append(pending.current, pendingColor.current, halfW, halfH, 1);
        lastKept.current.copy(pending.current);
        hasKept.current = true;
        pending.current = null;
      } else if (hasKept.current && _p.distanceToSquared(lastKept.current) < minStep2) {
        continue;
      }

      builder.append(_p, _c, halfW, halfH, 1);
      lastKept.current.copy(_p);
      hasKept.current = true;
    }

    // UN SEUL envoi GPU pour toute l'image.
    builder.flush();
  });

  return (
    <mesh geometry={builder.geometry} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={0.42} metalness={0.06} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default LivePiece;