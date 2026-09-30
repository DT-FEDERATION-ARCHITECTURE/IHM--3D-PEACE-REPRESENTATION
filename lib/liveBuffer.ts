/**
 * Tampon des échantillons live, VOLONTAIREMENT hors de React.
 *
 * Le flux arrive à ~248 Hz. Faire passer chaque échantillon par l'état React
 * déclenchait un rendu complet par message : c'est la cause du saccadement.
 * Ici le WebSocket écrit directement dans ce tableau, et la scène 3D le lit
 * dans sa boucle d'affichage (60 fps) sans jamais provoquer de rendu React.
 */
export interface LiveSample {
  x: number; y: number; z: number;
  /** Lacet de la tête en degrés (colonne Rz). Rx/Ry sont constants sur ce matériel. */
  rz: number;
  extruding: boolean;
  step: number;
  /** performance.now() à la réception — sert à interpoler entre deux échantillons. */
  arrivedAt: number;
}

class LiveBuffer {
  samples: LiveSample[] = [];
  push(s: LiveSample) { this.samples.push(s); }
  clear() { this.samples.length = 0; }
  get length() { return this.samples.length; }
  last(): LiveSample | undefined { return this.samples[this.samples.length - 1]; }
  extrudedCount(): number {
    let n = 0;
    for (const s of this.samples) if (s.extruding) n++;
    return n;
  }
}

export const liveBuffer = new LiveBuffer();
