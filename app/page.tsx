'use client';

import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { AlertCircle, MousePointer2 } from 'lucide-react';
import { useTwin } from '@/store/twinStore';
import { liveBuffer } from '@/lib/liveBuffer';
import ControlBar from '@/components/ControlBar';
import InspectorPanel from '@/components/InspectorPanel';

/* three.js touches window/WebGL on import, so the viewport is client-only. */
const Viewport = dynamic(() => import('@/components/Viewport'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-[12.5px] text-slate-400">
      Initialisation du rendu 3D…
    </div>
  ),
});

export default function Page() {
  const init = useTwin(s => s.init);
  const toolpath = useTwin(s => s.toolpath);
  const liveCount = useTwin(s => s.liveCount);
  const loadingToolpath = useTwin(s => s.loadingToolpath);
  const serverOk = useTwin(s => s.serverOk);
  const phase = useTwin(s => s.phase);

  useEffect(() => { init(); }, [init]);

  /* Progress is geometric — extruded points received against the target's own
     extrude-point count — rather than a step count against an assumed trace
     length. It stays meaningful when a trace and a G-code don't match 1:1. */
  const progress = useMemo(() => {
    if (!toolpath) return 0;
    const target = toolpath.points.filter(p => p.moveType === 'EXTRUDE').length;
    if (!target) return 0;
    const done = liveBuffer.extrudedCount();
    return Math.min(100, Math.round((done / target) * 100));
  }, [toolpath, liveCount]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <ControlBar progress={progress} />

      <main className="flex-1 flex min-h-0">
        <div className="flex-1 relative min-w-0">
          <Viewport />

          {/* Legend */}
          <div className="absolute top-3 left-3 rounded-xl bg-white/85 backdrop-blur border border-slate-200 px-3 py-2.5 pointer-events-none shadow-sm">
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span className="w-3.5 h-[5px] rounded-full bg-indigo-400 opacity-45 inline-block" />
              Pièce désirée — G-code
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-600 mt-1.5">
              <span className="w-3.5 h-[5px] rounded-full bg-orange-500 inline-block" />
              Impression en cours — trace
            </div>
          </div>

          {/* Orbit hint */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10.5px] text-slate-400 pointer-events-none">
            <MousePointer2 size={11} />
            glisser · orbiter — molette · zoomer — clic droit · déplacer
          </div>

          {/* Empty / loading / offline states */}
          {serverOk === false && (
            <Overlay icon>
              Serveur injoignable. Démarrez <code className="font-mono text-slate-700">gemini3d-server</code> sur
              le port 8080, puis rechargez.
            </Overlay>
          )}
          {serverOk !== false && loadingToolpath && <Overlay>Parsing du G-code…</Overlay>}
          {serverOk !== false && !loadingToolpath && !toolpath && (
            <Overlay>Choisissez un G-code pour afficher la pièce désirée.</Overlay>
          )}
          {serverOk !== false && toolpath && phase === 'idle' && liveCount === 0 && (
            <Overlay>Choisissez une trace, puis démarrez le rejeu.</Overlay>
          )}
        </div>

        <InspectorPanel />
      </main>
    </div>
  );
}

function Overlay({ children, icon }: { children: React.ReactNode; icon?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
      <div className="flex items-center gap-2.5 rounded-xl bg-white/92 backdrop-blur border border-slate-200 px-4 py-3 shadow-sm max-w-md">
        {icon && <AlertCircle size={16} className="text-amber-500 shrink-0" />}
        <p className="text-[12.5px] text-slate-600 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
