'use client';

import { useRef } from 'react';
import { Play, Square, RotateCcw, Upload, Boxes, Waves, Gauge } from 'lucide-react';
import { useTwin, SPEEDS, speedLabel, formatDuration } from '@/store/twinStore';
import { Button, Select, cx } from './ui';

export function ControlBar({ progress }: { progress: number }) {
  const s = useTwin();
  const gcodeInput = useRef<HTMLInputElement>(null);
  const traceInput = useRef<HTMLInputElement>(null);

  const running = s.phase === 'running';
  const canStart = !!s.selectedTrace && !!s.toolpath && !running;

  // Durée réelle de la trace, connue après un premier démarrage. Tant qu'elle
  // est inconnue le menu fonctionne exactement pareil : seule l'estimation de
  // durée manque. Rien ici ne pilote la vitesse.
  const traceDur = s.selectedTrace ? s.traceDurations[s.selectedTrace] ?? 0 : 0;

  const verdictStyle =
    s.verdict === 'ALLOW' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : s.verdict === 'UNKNOWN' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : s.verdict === 'FAIL' ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-slate-50 text-slate-400 border-slate-200';

  return (
    <header className="shrink-0 bg-brand border-b border-brand/80 text-white">
      <div className="flex items-center gap-2.5 px-4 py-2.5 flex-wrap">
        <div className="flex items-center gap-2 mr-1">
          <div className="w-28 h-9 flex items-center justify-center">
            <img src="/logo-white.png" alt="GEMINI3D" className="max-h-8 w-auto object-contain" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-white">GEMINI3D</div>
            <div className="text-[10px] text-white/75">Jumeau numérique · impression 3D</div>
          </div>
        </div>

        <div className="h-6 w-px bg-white/30 mx-1" />

        {/* Desired piece */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/80 hidden lg:inline">Pièce désirée</span>
          <Select
            value={s.selectedGcode ?? ''}
            onChange={e => e.target.value && s.selectGcode(e.target.value)}
          >
            <option value="">G-code…</option>
            {s.gcodeFiles.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
          </Select>
          <input
            ref={gcodeInput} type="file" accept=".gcode,.nc" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) s.uploadGcode(f); e.target.value = ''; }}
          />
          <Button onClick={() => gcodeInput.current?.click()} title="Importer un G-code">
            <Upload size={13} />
          </Button>
        </div>

        {/* Actual print */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/80 hidden lg:inline">Trace</span>
          <Select
            value={s.selectedTrace ?? ''}
            onChange={e => e.target.value && s.selectTrace(e.target.value)}
          >
            <option value="">Trace EGM…</option>
            {s.traces.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </Select>
          <input
            ref={traceInput} type="file" accept=".csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) s.uploadTrace(f); e.target.value = ''; }}
          />
          <Button onClick={() => traceInput.current?.click()} title="Importer une trace">
            <Upload size={13} />
          </Button>
        </div>

        <div className="h-6 w-px bg-white/30 mx-1" />

        {/* Vitesse de rejeu — appliquée au démarrage */}
        <div
          className="flex items-center gap-1.5"
          title="Vitesse de rejeu : secondes de trace jouées par seconde réelle (appliquée au démarrage)"
        >
          <Gauge size={13} className="text-white/80" />
          <Select
            value={s.speed}
            disabled={running}
            onChange={e => s.setSpeed(Number(e.target.value))}
          >
            {SPEEDS.map(v => {
              const est = traceDur > 0 && v > 0 ? formatDuration(traceDur / v) : '';
              return (
                <option key={v} value={v}>
                  {speedLabel(v)}{est ? ` — ${est}` : ''}
                </option>
              );
            })}
          </Select>
          {traceDur > 0 && (
            <span className="text-[10.5px] leading-tight text-white/75 whitespace-nowrap">
              trace {formatDuration(traceDur)}
            </span>
          )}
        </div>

        {/* Transport */}
        <div className="flex items-center gap-1.5">
          {running ? (
            <Button variant="danger" onClick={s.stop}><Square size={12} /> Arrêter</Button>
          ) : (
            <Button variant="primary" disabled={!canStart} onClick={s.start}>
              <Play size={12} /> Démarrer
            </Button>
          )}
          <Button variant="ghost" onClick={s.reset} title="Réinitialiser"><RotateCcw size={12} /></Button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 flex-1 min-w-[120px] max-w-[260px]">
          <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-white/85 tabular-nums w-9 text-right">
            {progress}%
          </span>
        </div>

        {/* Verdict */}
        <div className={cx(
          'ml-auto flex items-center gap-1.5 px-2.5 h-7 rounded-full border text-[11px] font-mono',
          verdictStyle,
        )}>
          <Waves size={11} />
          {s.verdict ?? '—'}
        </div>
      </div>

      {s.error && (
        <div className="px-4 py-1.5 bg-red-50 border-t border-red-100 text-[11.5px] text-red-700 font-mono flex justify-between">
          <span>{s.error}</span>
          <button onClick={s.dismissError} className="underline hover:no-underline">masquer</button>
        </div>
      )}
    </header>
  );
}

export default ControlBar;