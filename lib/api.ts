import {
  GcodeListResponse, GcodeToolpathDto, TraceListResponse,
  InclusionStepMessage,
} from '@/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
const WS = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
  isNetwork() { return this.status === 0; }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    const r = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new ApiError(body.error || body.message || `HTTP ${r.status}`, r.status);
    }
    return r.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      e instanceof Error ? e.message : 'Réseau indisponible',
      0,
    );
  }
}

async function upload(path: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`${API}${path}`, { method: 'POST', body: fd });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new ApiError(body.error || 'Échec de l\u2019upload', r.status);
  }
  return r.json();
}

export const api = {
  // ── G-code ──
  listGcode: () => req<GcodeListResponse>('/gcode/list'),
  uploadGcode: (f: File) => upload('/gcode/upload', f) as Promise<{ filename: string }>,
  getToolpath: (name: string) => req<GcodeToolpathDto>(`/gcode/${encodeURIComponent(name)}/toolpath`),

  // ── Traces ──
  listTraces: () => req<TraceListResponse>('/trace/list'),
  uploadTrace: (f: File) => upload('/trace/upload', f) as Promise<{ filename: string }>,

  // ── Replay (trace streaming, no automaton required) ──
  /**
   * Démarre un rejeu.
   *
   * @param speed secondes de trace jouées par seconde réelle.
   *   1 = temps réel · 30 = trente fois plus vite · 0 = sans attente.
   *
   * On n'envoie plus `periodMs` (un délai fixe entre deux lignes). Ce délai ne
   * pouvait pas convenir à plusieurs fichiers : la trace Module2 est
   * échantillonnée à 4 ms, la trace OMEGA à 504 ms en médiane. « 4 ms » voulait
   * donc dire « temps réel » sur la première et « 124 fois trop vite » sur la
   * seconde. Le serveur cadence maintenant sur les horodatages du fichier.
   *
   * `traceDurationSec` et `estimatedReplaySec` sont purement indicatifs et
   * valent 0 si le serveur n'a pas pu mesurer la trace. Rien dans l'interface
   * ne doit en dépendre pour fonctionner.
   */
  startReplay: (traceFile: string, speed: number) =>
    req<{
      sessionId: string;
      speed?: number;
      traceDurationSec?: number;
      estimatedReplaySec?: number;
    }>('/replay/start', {
      method: 'POST',
      body: JSON.stringify({ traceFile, speed }),
    }),
  replayStatus: (id: string) => req<any>(`/replay/${id}/status`),
  stopReplay: (id: string) => req<void>(`/replay/${id}/stop`, { method: 'POST' }),

  // ── WebSocket ──
  connectWs(
    sessionId: string,
    onMessage: (m: InclusionStepMessage) => void,
    onClose?: () => void,
  ): WebSocket {
    const ws = new WebSocket(`${WS}/ws/inclusion/${sessionId}`);
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { /* ignore malformed frame */ }
    };
    ws.onclose = () => onClose?.();
    return ws;
  },
};