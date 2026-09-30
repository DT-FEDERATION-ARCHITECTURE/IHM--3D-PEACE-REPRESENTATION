'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SceneFit } from '@/lib/sceneFit';
import { liveBuffer } from '@/lib/liveBuffer';

const GLB_URL = '/robot.glb';
const HEAD_NODE = 'TETE_EXTRUSION';

useGLTF.preload(GLB_URL);

/**
 * Détecte la buse automatiquement dans la géométrie CAO.
 *
 * Principe : la buse est la seule extrémité FINE de l'assemblage. On teste les
 * six faces de la boîte englobante et on mesure la section transversale d'une
 * tranche prise au bord ; celle dont la section est la plus petite est la buse.
 * Sur la tête fournie, cette face fait 18 x 18 mm contre 58 a 110 mm pour
 * toutes les autres — l'identification est sans ambiguïté.
 *
 * C'est ce qui remplace l'ancien calage manuel : rien n'est deviné, et si la
 * CAO change, la détection suit.
 */
function findNozzle(root: THREE.Object3D): { tip: THREE.Vector3; axis: THREE.Vector3 } | null {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const pts: number[] = [];
  root.traverse((o: any) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      pts.push(v.x, v.y, v.z);
    }
  });
  const n = pts.length / 3;
  if (n < 8) return null;

  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++)
    for (let a = 0; a < 3; a++) {
      const val = pts[i * 3 + a];
      if (val < mn[a]) mn[a] = val;
      if (val > mx[a]) mx[a] = val;
    }
  const span = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  const bandT = span * 0.03;

  let best: { area: number; tip: THREE.Vector3; axis: THREE.Vector3 } | null = null;

  for (let a = 0; a < 3; a++) {
    for (const sign of [1, -1]) {
      const edge = sign > 0 ? mx[a] : mn[a];
      const o1 = (a + 1) % 3, o2 = (a + 2) % 3;
      let c1 = 0, c2 = 0, cnt = 0;
      let l1 = Infinity, h1 = -Infinity, l2 = Infinity, h2 = -Infinity;
      for (let i = 0; i < n; i++) {
        if (Math.abs(pts[i * 3 + a] - edge) > bandT) continue;
        const v1 = pts[i * 3 + o1], v2 = pts[i * 3 + o2];
        c1 += v1; c2 += v2; cnt++;
        if (v1 < l1) l1 = v1; if (v1 > h1) h1 = v1;
        if (v2 < l2) l2 = v2; if (v2 > h2) h2 = v2;
      }
      if (cnt < 20) continue;
      const area = (h1 - l1) * (h2 - l2);
      if (!best || area < best.area) {
        const tip = new THREE.Vector3();
        tip.setComponent(a, edge);
        tip.setComponent(o1, c1 / cnt);
        tip.setComponent(o2, c2 / cnt);
        const axis = new THREE.Vector3();
        axis.setComponent(a, sign); // direction sortante de la buse
        best = { area, tip, axis };
      }
    }
  }
  return best ? { tip: best.tip, axis: best.axis } : null;
}

/**
 * La vraie tête d'extrusion, calée automatiquement.
 *
 * Position : la POINTE DE BUSE est placée exactement sur le TCP. L'ancienne
 * version centrait la boîte englobante, ce qui décalait la tête de 359 mm —
 * d'où la tête d'un côté et le cordon de l'autre.
 *
 * Orientation : l'axe de la buse est aligné sur la verticale descendante
 * (confirmé par les données : l'axe Z outil pointe vers le bas, produit
 * scalaire +1.000), puis le lacet est piloté par Rz, qui suit la direction
 * du chemin à 0,13° près.
 *
 * ── Deux corrections ────────────────────────────────────────────────────────
 *
 * 1. LA TÊTE RESTAIT FIGÉE DÈS LE DEUXIÈME REJEU.
 *    `consumed` compte les échantillons déjà lus, et il n'était jamais remis
 *    à zéro. Or `start()` vide liveBuffer. Au rejeu suivant, la condition
 *    `consumed < samples.length` restait donc fausse jusqu'à ce que le flux
 *    ait regénéré autant d'échantillons que le rejeu précédent.
 *
 *    OMEGA fait exactement 7 925 lignes : rejoué une deuxième fois, la tête
 *    ne bougeait pas une seule fois de tout le rejeu, pendant que le cordon —
 *    qui, lui, est remis à zéro par `resetToken` dans LivePiece — se dessinait
 *    normalement. C'est le « bras fixe pendant que le dessin marche ».
 *    `resetToken` aligne maintenant la tête sur le cordon.
 *
 * 2. LA TÊTE POURSUIVAIT UNE CIBLE AU LIEU D'ÊTRE DESSUS.
 *    L'interpolation reposait sur une moyenne glissante des délais d'arrivée.
 *    Sur OMEGA, l'écart entre deux mesures varie de 4 ms à 1609 ms : la
 *    moyenne est fausse presque partout. Trop courte, la tête atteignait sa
 *    cible puis s'immobilisait jusqu'à la suivante ; trop longue, elle
 *    traînait derrière le cordon.
 *
 *    La tête est désormais posée exactement sur le dernier point reçu, qui est
 *    aussi le dernier point dessiné : buse et cordon ne peuvent plus se
 *    désynchroniser, quelle que soit la cadence. La fluidité vient du réglage
 *    de vitesse, qui décide du nombre de points reçus par image.
 */
export function RobotHead({
  fit, printing, visible = true, resetToken,
}: {
  fit: SceneFit;
  printing: boolean;
  visible?: boolean;
  /** Change à chaque nouvelle session : remet le curseur de lecture à zéro. */
  resetToken: string;
}) {
  const { scene } = useGLTF(GLB_URL) as any;
  const group = useRef<THREE.Group>(null);
  const consumed = useRef(0);
  const yaw = useRef(0);
  const yawInit = useRef(false);

  const head = useMemo(() => {
    const src: THREE.Object3D | undefined = scene?.getObjectByName(HEAD_NODE);
    if (!src) return null;

    const node = src.clone(true);
    node.position.set(0, 0, 0);
    node.quaternion.identity();
    node.scale.set(1, 1, 1);

    const holder = new THREE.Group();
    holder.add(node);

    const nz = findNozzle(node);
    if (nz) {
      // Aligne l'axe sortant de la buse sur la verticale descendante.
      const q = new THREE.Quaternion().setFromUnitVectors(nz.axis.clone().normalize(), new THREE.Vector3(0, -1, 0));
      node.quaternion.copy(q);
      // Puis translate pour amener la pointe exactement à l'origine du groupe.
      node.position.copy(nz.tip).applyQuaternion(q).negate();
    }

    holder.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    return holder;
  }, [scene]);

  // Nouvelle session : liveBuffer est vidé, le curseur doit repartir de zéro.
  useEffect(() => {
    consumed.current = 0;
    yawInit.current = false;
  }, [resetToken]);

  useFrame(() => {
    const g = group.current;
    if (!g || !head) return;
    const samples = liveBuffer.samples;

    // Rien de nouveau : on ne touche à rien, la tête reste où elle est.
    if (consumed.current >= samples.length) return;

    // Le cordon consomme lui aussi tous les points reçus depuis l'image
    // précédente. Se placer sur le dernier, c'est se placer exactement au bout
    // du cordon.
    const s = samples[samples.length - 1];
    consumed.current = samples.length;

    fit.toSceneInto(s.x, s.y, s.z, g.position);

    // (x,y,z)source -> (x,z,y)scène inverse le sens de rotation, d'où le signe.
    const raw = -THREE.MathUtils.degToRad(s.rz);
    if (!yawInit.current) {
      yaw.current = raw;
      yawInit.current = true;
    } else {
      // Déroulé : +179° puis -179° font 2° de rotation, pas 358°.
      const twoPi = Math.PI * 2;
      let d = (raw - yaw.current) % twoPi;
      if (d > Math.PI) d -= twoPi;
      if (d < -Math.PI) d += twoPi;
      yaw.current += d;
    }
    g.rotation.y = yaw.current;
  });

  if (!head) return null;
  const s = fit.mm(1000); // le GLB est en mètres

  return (
    <group ref={group} visible={visible}>
      <group scale={[s, s, s]}>
        <primitive object={head} />
      </group>
      {printing && (
        <pointLight position={[0, fit.mm(15), 0]} color="#ff7722" intensity={2.2} distance={fit.mm(300)} />
      )}
    </group>
  );
}

export default RobotHead;