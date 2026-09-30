import { create } from 'zustand';
import { api } from '@/lib/api';
import {
  GcodeFileInfo, GcodeToolpathDto, TraceInfo, MonitorStatus,
} from '@/types';
import { resolveXYZ, resolveExtruding } from '@/lib/dynamicFields';
import { liveBuffer } from '@/lib/liveBuffer';

/**
 * Live points arrive far faster than React should re-render (the real EGM log
 * is ~248 Hz). They're accumulated in this module-level buffer and committed
 * to the store on a fixed cadence, so the scene updates smoothly at a sane
 * frame rate instead of thrashing on every frame.
 */
let flushTimer: ReturnType<typeof setInterval> | null = null;
let latest: any = null;
/** Cadence de rafraîchissement des COMPTEURS TEXTE uniquement.
 *  La 3D ne passe plus par React : elle lit liveBuffer à 60 fps. */
const UI_REFRESH_MS = 100;

export type Phase = 'idle' | 'running' | 'finished' | 'error';
export type ColorMode = 'material' | 'deviation';

/**
 * Vitesses proposées : secondes de trace jouées par seconde réelle.
 *
 * ── Pourquoi un multiplicateur et non une cadence en millisecondes ──────────
 *
 * L'ancien menu réglait `periodMs`, le délai que le serveur observait entre
 * deux lignes. Ça ne peut pas convenir à deux fichiers différents :
 *
 *   Module2/logEgm   79 288 lignes    5,3 min   cadence 4,03 ms, très régulière
 *   OMEGA OUTILLAGE   7 925 lignes   66,4 min   cadence médiane 504 ms,
 *                                               variant de 4 ms à 1609 ms
 *
 * « Temps réel (~4 ms) » était juste sur Module2 par coïncidence — c'est
 * exactement sa cadence réelle — et rejouait OMEGA 124 fois trop vite (66 min
 * compressées en 32 s). Et « Ralenti ×25 » (100 ms) ne ralentissait pas OMEGA :
 * il l'accélérait encore 5 fois.
 *
 * Le serveur cadence maintenant sur les horodatages du fichier lui-même. ×30
 * veut donc dire « trente fois plus vite que la réalité » sur n'importe quelle
 * trace, y compris une trace dont la cadence varie d'un facteur 400 en cours
 * de route.
 *
 * Durées obtenues sur les deux fichiers de référence :
 *
 *   Temps réel   Module2  5,3 min      OMEGA  66,4 min
 *   ×5           Module2  1,1 min      OMEGA  13,3 min
 *   ×15          Module2   21 s        OMEGA   4,4 min
 *   ×30          Module2   11 s        OMEGA   2,2 min   <- défaut
 *   ×60          Module2    5 s        OMEGA   1,1 min
 *   ×150         Module2    2 s        OMEGA    27 s
 *
 * Pour la démonstration OMEGA, ×30 donne le meilleur compromis. Sur Module2,
 * ×5 reste le plus lisible.
 */
export const SPEEDS = [1, 5, 15, 30, 60, 150, 0] as const;

/** Libellé d'une vitesse. 0 = le serveur n'attend pas entre deux lignes. */
export function speedLabel(v: number): string {
  if (v === 1) return 'Temps réel';
  if (v <= 0) return 'Sans attente';
  return `×${v}`;
}

/** « 2 min 13 s » / « 47 s ». Chaîne vide si la durée est inconnue. */
export function formatDuration(sec: number): string {
  if (!(sec > 0)) return '';
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

interface TwinState {
  // ── Connection ──
  serverOk: boolean | null;
  error: string | null;

  // ── G-code (desired piece) ──
  gcodeFiles: GcodeFileInfo[];
  selectedGcode: string | null;
  toolpath: GcodeToolpathDto | null;
  loadingToolpath: boolean;

  // ── Trace (actual print) ──
  traces: TraceInfo[];
  selectedTrace: string | null;

  // ── Session ──
  sessionId: string | null;
  phase: Phase;
  step: number;
  tSeconds: number;
  measurement: Record<string, any> | null;
  verdict: MonitorStatus | null;
  /** Nombre d'échantillons reçus. Les points vivent dans liveBuffer, hors React. */
  liveCount: number;
  ws: WebSocket | null;

  // ── Replay speed ──
  /** Secondes de trace jouées par seconde réelle. Voir SPEEDS. */
  speed: number;
  /**
   * Durée réelle des traces déjà démarrées au moins une fois, mesurée par le
   * serveur, en secondes.
   *
   * Sert UNIQUEMENT à afficher la durée de rejeu attendue en face de chaque
   * vitesse. Aucune vitesse n'en dépend : si le serveur ne la renvoie pas, le
   * menu fonctionne à l'identique, simplement sans l'estimation.
   */
  traceDurations: Record<string, number>;


  // ── View settings ──
  showGhost: boolean;
  ghostOpacity: number;
  showTravel: boolean;
  colorMode: ColorMode;
  tolerance: number;      // mm, drives the deviation ramp
  layerClip: number | null; // show only layers <= this (null = all)

  // ── Actions ──
  init: () => Promise<void>;
  refreshGcode: () => Promise<void>;
  refreshTraces: () => Promise<void>;
  selectGcode: (name: string) => Promise<void>;
  selectTrace: (name: string) => void;
  uploadGcode: (f: File) => Promise<void>;
  uploadTrace: (f: File) => Promise<void>;
  setSpeed: (v: number) => void;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  set: <K extends keyof TwinState>(k: K, v: TwinState[K]) => void;
  dismissError: () => void;
}

export const useTwin = create<TwinState>((setState, get) => ({
  serverOk: null,
  error: null,

  gcodeFiles: [],
  selectedGcode: null,
  toolpath: null,
  loadingToolpath: false,

  traces: [],
  selectedTrace: null,

  sessionId: null,
  phase: 'idle',
  step: 0,
  tSeconds: 0,
  measurement: null,
  verdict: null,
  liveCount: 0,
  ws: null,

  speed: 30,
  traceDurations: {},

  showGhost: true,
  ghostOpacity: 0.22,
  showTravel: false,
  colorMode: 'deviation',
  tolerance: 3,
  layerClip: null,

  set: (k, v) => setState({ [k]: v } as any),
  dismissError: () => setState({ error: null }),

  init: async () => {
    try {
      await Promise.all([get().refreshGcode(), get().refreshTraces()]);
      setState({ serverOk: true });
    } catch (e: any) {
      setState({ serverOk: false, error: e.message || 'Serveur injoignable' });
    }
  },

  refreshGcode: async () => {
    const res = await api.listGcode();
    setState({ gcodeFiles: res.files });
  },

  refreshTraces: async () => {
    const res = await api.listTraces();
    setState({ traces: res.traces });
  },

  selectGcode: async (name) => {
    setState({ selectedGcode: name, loadingToolpath: true, toolpath: null, error: null });
    try {
      const tp = await api.getToolpath(name);
      setState({ toolpath: tp, loadingToolpath: false, layerClip: null });
    } catch (e: any) {
      setState({ loadingToolpath: false, error: e.message || 'Échec du parsing G-code' });
    }
  },

  selectTrace: (name) => setState({ selectedTrace: name }),

  uploadGcode: async (f) => {
    try {
      const res = await api.uploadGcode(f);
      await get().refreshGcode();
      await get().selectGcode(res.filename);
    } catch (e: any) {
      setState({ error: e.message || 'Échec de l\u2019upload G-code' });
    }
  },

  uploadTrace: async (f) => {
    try {
      const res = await api.uploadTrace(f);
      await get().refreshTraces();
      setState({ selectedTrace: res.filename });
    } catch (e: any) {
      setState({ error: e.message || 'Échec de l\u2019upload trace' });
    }
  },

  /** S'applique au prochain rejeu : la vitesse est passée au démarrage. */
  setSpeed: (v) => setState({ speed: v }),

  start: async () => {
    const { selectedTrace, ws: old } = get();
    if (!selectedTrace) return;
    if (old) old.close();

    liveBuffer.clear();
    latest = null;
    setState({
      phase: 'running', liveCount: 0, step: 0, tSeconds: 0,
      measurement: null, verdict: null, error: null,
    });

    try {
      const res = await api.startReplay(selectedTrace, get().speed);
      const { sessionId } = res;
      setState({ sessionId });

      // Mémorise la durée mesurée pour afficher l'estimation la prochaine
      // fois. Purement informatif : une valeur absente ne change rien au
      // déroulement du rejeu.
      const dur = Number(res.traceDurationSec);
      if (Number.isFinite(dur) && dur > 0) {
        setState({ traceDurations: { ...get().traceDurations, [selectedTrace]: dur } });
      }

      const ws = api.connectWs(
        sessionId,
        (msg) => {
          if (msg.type === 'error') {
            setState({ phase: 'error', error: msg.reason || 'Erreur de session' });
            return;
          }
          if (msg.type === 'finished') {
            setState({ phase: 'finished' });
            return;
          }
          const xyz = resolveXYZ(msg.measurement);
          if (xyz) {
            const m = msg.measurement || {};
            const rzKey = Object.keys(m).find(k => k.toLowerCase() === 'rz');
            liveBuffer.push({
              ...xyz,
              rz: rzKey !== undefined ? (Number(m[rzKey]) || 0) : 0,
              extruding: resolveExtruding(m),
              step: msg.step,
              arrivedAt: performance.now(),
            });
          }
          // Aucun setState par message : la 3D lit liveBuffer, et les compteurs
          // texte sont rafraîchis par le timer ci-dessous.
          latest = msg;
        },
        () => {
          if (get().phase === 'running') setState({ phase: 'finished' });
        },
      );
      setState({ ws });

      if (flushTimer) clearInterval(flushTimer);
      flushTimer = setInterval(() => {
        if (!latest) return;
        setState({
          step: latest.step,
          tSeconds: latest.tSeconds ?? 0,
          measurement: latest.measurement,
          verdict: latest.globalPropertyStatus ?? null,
          liveCount: liveBuffer.length,
        });
      }, UI_REFRESH_MS);
    } catch (e: any) {
      setState({ phase: 'error', error: e.message || 'Échec du démarrage' });
    }
  },

  stop: () => {
    const { sessionId, ws } = get();
    if (ws) ws.close();
    if (sessionId) api.stopReplay(sessionId).catch(() => {});
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    setState({ phase: 'idle', ws: null, liveCount: liveBuffer.length });
  },

  reset: () => {
    const { ws } = get();
    if (ws) ws.close();
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    liveBuffer.clear();
    latest = null;
    setState({
      sessionId: null, phase: 'idle', step: 0, tSeconds: 0,
      measurement: null, verdict: null, liveCount: 0, ws: null, error: null,
    });
  },
}));