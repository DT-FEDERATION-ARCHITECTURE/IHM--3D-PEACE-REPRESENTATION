'use client';

import * as THREE from 'three';
import { useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { useTwin } from '@/store/twinStore';
import { computeFit } from '@/lib/sceneFit';
import { NearestGrid } from '@/lib/spatialIndex';
import BuildPlate from './scene/BuildPlate';
import GhostPiece from './scene/GhostPiece';
import LivePiece from './scene/LivePiece';
import RobotHead from './scene/RobotHead';

/* Re-frames the camera whenever a different part is loaded, so every job
   arrives properly composed instead of at whatever angle suited the last one. */
function AutoFrame({ span, height, token }: { span: number; height: number; token: string }) {
  const { camera } = useThree();
  const controls = useThree(s => s.controls) as any;
  useEffect(() => {
    const d = Math.max(span * 1.5, 1.5);
    camera.position.set(d * 0.75, Math.max(height * 1.6, d * 0.55), d * 0.85);
    camera.lookAt(0, height * 0.35, 0);
    if (controls) {
      controls.target.set(0, height * 0.35, 0);
      controls.update();
    }
  }, [token, span, height, camera, controls]);
  return null;
}

function Lighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cbd5e1', 0.85]} />
      <ambientLight intensity={0.28} />
      {/* Key */}
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
      />
      {/* Fill, cool, from the opposite side */}
      <directionalLight position={[-5, 3, -4]} intensity={0.45} color="#dbeafe" />
      {/* Rim, warm, low and behind — separates the part from the background */}
      <directionalLight position={[0, 1.5, -6]} intensity={0.55} color="#fed7aa" />
    </>
  );
}

function Scene() {
  const toolpath = useTwin(s => s.toolpath);
  const sessionId = useTwin(s => s.sessionId);
  const liveCount = useTwin(s => s.liveCount);
  const phase = useTwin(s => s.phase);
  const showGhost = useTwin(s => s.showGhost);
  const ghostOpacity = useTwin(s => s.ghostOpacity);
  const showTravel = useTwin(s => s.showTravel);
  const colorMode = useTwin(s => s.colorMode);
  const tolerance = useTwin(s => s.tolerance);
  const layerClip = useTwin(s => s.layerClip);

  const fit = useMemo(() => (toolpath ? computeFit(toolpath.extrudeBounds) : null), [toolpath]);

  /* Bead dimensions are derived from the part itself: layer height comes from
     the toolpath's own Z range over its layer count, and the deposition width
     is estimated from that. The team's slicer does emit exact values in the
     G-code header comments, but the server doesn't surface them yet — when it
     does, these two lines are the only thing that needs to change. */
  const { beadWidthMm, layerHeightMm } = useMemo(() => {
    if (!toolpath) return { beadWidthMm: 1, layerHeightMm: 1 };
    const zSpan = toolpath.extrudeBounds.maxZ - toolpath.extrudeBounds.minZ;
    const lh = toolpath.layerCount > 0 ? Math.max(zSpan / toolpath.layerCount, 1e-3) : 1;
    return { beadWidthMm: lh * 2.6, layerHeightMm: lh };
  }, [toolpath]);

  const grid = useMemo(() => {
    if (!toolpath) return null;
    const cloud = toolpath.points
      .filter(p => p.moveType === 'EXTRUDE')
      .map(p => ({ x: p.x, y: p.y, z: p.z }));
    return cloud.length ? new NearestGrid(cloud) : null;
  }, [toolpath]);

  const span = fit ? Math.max(fit.sceneSize.x, fit.sceneSize.z) : 3.2;

  return (
    <>
      <color attach="background" args={['#f1f5f9']} />
      <fog attach="fog" args={['#f1f5f9', span * 3, span * 9]} />
      <Lighting />

      <BuildPlate fit={fit} />

      {toolpath && fit && showGhost && (
        <GhostPiece
          points={toolpath.points}
          fit={fit}
          opacity={ghostOpacity}
          showTravel={showTravel}
          layerClip={layerClip}
          beadWidthMm={beadWidthMm}
          layerHeightMm={layerHeightMm}
        />
      )}

      {fit && (
        <LivePiece
          fit={fit}
          grid={grid}
          colorMode={colorMode}
          tolerance={tolerance}
          beadWidthMm={beadWidthMm}
          layerHeightMm={layerHeightMm}
          resetToken={`${toolpath?.filename ?? 'none'}|${sessionId ?? 'none'}`}
        />
      )}

      {fit && (
        <RobotHead
          fit={fit}
          printing={phase === 'running'}
          visible={liveCount > 0}
          resetToken={`${toolpath?.filename ?? 'none'}|${sessionId ?? 'none'}`}
        />
      )}

      <ContactShadows
        position={[0, 0.002, 0]}
        opacity={0.32}
        scale={span * 2.2}
        blur={2.4}
        far={span}
        resolution={1024}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}
        minDistance={0.4}
        maxDistance={span * 8}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />

      <AutoFrame
        span={span}
        height={fit ? fit.sceneSize.y : 0.5}
        token={toolpath?.filename ?? 'none'}
      />
    </>
  );
}

export function Viewport() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 40, near: 0.01, far: 200, position: [3, 2.2, 3] }}
    >
      <Scene />
    </Canvas>
  );
}

export default Viewport;