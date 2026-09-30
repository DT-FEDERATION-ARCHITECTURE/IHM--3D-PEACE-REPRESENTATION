'use client';

import { useMemo } from 'react';
import { useTwin } from '@/store/twinStore';
import { Section, Stat, Slider, Toggle, cx } from './ui';
import { formatValue } from '@/lib/dynamicFields';
import { NearestGrid } from '@/lib/spatialIndex';
import { deviationHex } from '@/lib/sceneFit';
import { liveBuffer } from '@/lib/liveBuffer';

export function InspectorPanel() {
  const s = useTwin();
  const tp = s.toolpath;

  /* Deviation statistics. This mirrors what the 3D view colours, but computed
     over a bounded sample so the panel stays responsive on long traces. */
  const dev = useMemo(() => {
    if (!tp || s.liveCount === 0) return null;
    const cloud = tp.points.filter(p => p.moveType === 'EXTRUDE').map(p => ({ x: p.x, y: p.y, z: p.z }));
    if (!cloud.length) return null;
    const grid = new NearestGrid(cloud);

    const extruded = liveBuffer.samples.filter(p => p.extruding);
    if (!extruded.length) return null;

    const stride = Math.max(1, Math.floor(extruded.length / 2000));
    const vals: number[] = [];
    for (let i = 0; i < extruded.length; i += stride) {
      const p = extruded[i];
      vals.push(grid.nearest(p.x, p.y, p.z));
    }
    vals.sort((a, b) => a - b);
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      avg: sum / vals.length,
      max: vals[vals.length - 1],
      p95: vals[Math.floor(vals.length * 0.95)],
      samples: vals,
    };
  }, [tp, s.liveCount, s.tolerance]);

  const histogram = useMemo(() => {
    if (!dev) return null;
    const bins = new Array(24).fill(0);
    const top = Math.max(dev.max, s.tolerance * 2);
    for (const v of dev.samples) {
      const i = Math.min(bins.length - 1, Math.floor((v / top) * bins.length));
      bins[i]++;
    }
    const peak = Math.max(...bins, 1);
    return { bins, peak, top };
  }, [dev, s.tolerance]);

  const sensors = Object.entries(s.measurement || {});

  return (
    <aside className="w-[300px] shrink-0 border-l border-brand/80 bg-brand text-white overflow-y-auto">
      <Section title="Affichage">
        <div className="flex flex-col gap-2.5">
          <Toggle label="Pièce désirée (fantôme)" checked={s.showGhost} onChange={v => s.set('showGhost', v)} />
          {/* <Toggle label="Déplacements sans dépôt" checked={s.showTravel} onChange={v => s.set('showTravel', v)} /> */}

          {s.showGhost && (
            <Slider
              label="Opacité du fantôme"
              value={Math.round(s.ghostOpacity * 100)}
              min={5} max={70} step={1}
              display={`${Math.round(s.ghostOpacity * 100)} %`}
              onChange={v => s.set('ghostOpacity', v / 100)}
            />
          )}

          <div className="flex flex-col gap-1.5 pt-1">
            <span className="text-[11px] text-white/80">Couleur de la pièce imprimée</span>
            <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
              {(['deviation', 'material'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => s.set('colorMode', mode)}
                  className={cx(
                    'flex-1 h-7 rounded-[6px] text-[11.5px] font-medium transition-colors',
                    s.colorMode === mode ? 'bg-white text-brand shadow-sm' : 'text-white/75 hover:text-white',
                  )}
                >
                  {mode === 'deviation' ? 'Écart' : 'Matière'}
                </button>
              ))}
            </div>
          </div>

          {/* {s.colorMode === 'deviation' && (
            <>
              <Slider
                label="Tolérance"
                value={s.tolerance}
                min={0.5} max={20} step={0.5}
                display={`${s.tolerance} mm`}
                onChange={v => s.set('tolerance', v)}
              />
              <div className="flex items-center gap-1.5">
                <div
                  className="h-2 flex-1 rounded-full"
                  style={{ background: 'linear-gradient(90deg,#16a34a,#f59e0b,#dc2626)' }}
                />
              </div>
              <div className="flex justify-between text-[9.5px] text-white/70 font-mono -mt-1">
                <span>0</span><span>{s.tolerance} mm</span><span>{s.tolerance * 2}+</span>
              </div>
            </>
          )} */}

          {tp && tp.layerCount > 1 && (
            <Slider
              label="Couches affichées"
              value={s.layerClip ?? tp.layerCount}
              min={1} max={tp.layerCount} step={1}
              display={s.layerClip == null ? `toutes (${tp.layerCount})` : `1–${s.layerClip}`}
              onChange={v => s.set('layerClip', v >= tp.layerCount ? null : v)}
            />
          )}
        </div>
      </Section>

      <Section title="Pièce désirée">
        {tp ? (
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Points" value={tp.pointCount} />
            <Stat label="Couches" value={tp.layerCount} />
            <Stat label="Longueur" value={`${(tp.totalExtrudeLength / 1000).toFixed(2)} m`} />
            <Stat
              label="Emprise"
              value={`${Math.round(tp.extrudeBounds.maxX - tp.extrudeBounds.minX)}×${Math.round(tp.extrudeBounds.maxY - tp.extrudeBounds.minY)}`}
            />
          </div>
        ) : (
          <p className="text-[11.5px] text-white/70 italic">Aucun G-code chargé.</p>
        )}
        {tp && Object.keys(tp.unsupportedCommands).length > 0 && (
          <p className="mt-2 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            Commandes non interprétées : {Object.entries(tp.unsupportedCommands).map(([k, v]) => `${k}×${v}`).join(', ')}
          </p>
        )}
      </Section>

      <Section title="Impression en cours">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Étape" value={s.step || '—'} />
          <Stat label="Temps trace" value={s.tSeconds ? `${s.tSeconds.toFixed(1)} s` : '—'} />
          <Stat label="Points reçus" value={s.liveCount || '—'} />
          <Stat label="État" value={
            s.phase === 'running' ? 'en cours'
            : s.phase === 'finished' ? 'terminée'
            : s.phase === 'error' ? 'erreur' : 'au repos'
          } mono={false} />
        </div>
      </Section>

      <Section title="Écart réel / désiré">
        {dev ? (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              <Stat label="Moyen" value={<span style={{ color: deviationHex(dev.avg, s.tolerance) }}>{dev.avg.toFixed(2)}</span>} />
              <Stat label="P95" value={<span style={{ color: deviationHex(dev.p95, s.tolerance) }}>{dev.p95.toFixed(2)}</span>} />
              <Stat label="Max" value={<span style={{ color: deviationHex(dev.max, s.tolerance) }}>{dev.max.toFixed(2)}</span>} />
            </div>
            {histogram && (
              <div className="mt-3">
                <div className="flex items-end gap-[1.5px] h-12">
                  {histogram.bins.map((b, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-[2px]"
                      style={{
                        height: `${Math.max(2, (b / histogram.peak) * 100)}%`,
                        background: deviationHex((i / histogram.bins.length) * histogram.top, s.tolerance),
                        opacity: b === 0 ? 0.15 : 1,
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[9.5px] text-white/70 font-mono mt-1">
                  <span>0 mm</span><span>distribution</span><span>{histogram.top.toFixed(1)} mm</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-[11.5px] text-white/70 italic">
            Disponible dès qu&apos;une trace est rejouée sur un G-code chargé.
          </p>
        )}
      </Section>

      <Section title={`Capteurs live${sensors.length ? ` (${sensors.length})` : ''}`}>
        {sensors.length ? (
          <div className="flex flex-col max-h-[280px] overflow-y-auto -mx-1 px-1">
            {sensors.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-[3px] border-b border-dashed border-white/20 last:border-0">
                <span className="text-[10.5px] font-mono text-white/70 truncate max-w-[150px]" title={k}>{k}</span>
                <span className="text-[10.5px] font-mono font-medium text-white tabular-nums">{formatValue(v)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11.5px] text-white/70 italic">En attente de données…</p>
        )}
      </Section>
    </aside>
  );
}

export default InspectorPanel;