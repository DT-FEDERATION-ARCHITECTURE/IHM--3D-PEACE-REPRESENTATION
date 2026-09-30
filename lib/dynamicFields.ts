/**
 * The live `measurement` map's schema varies between trace files (lowercase
 * x/y/z in the older egm.csv, uppercase X/Y/Z in the newer logEgm.csv —
 * both confirmed against real files). Resolve by scanning the keys that are
 * actually present rather than assuming any fixed name or casing.
 */

export interface XYZ { x: number; y: number; z: number; }

export function resolveXYZ(m: Record<string, any> | null | undefined): XYZ | null {
  if (!m) return null;
  const keys = Object.keys(m);
  const find = (n: string) => keys.find(k => k.toLowerCase() === n);
  const kx = find('x'), ky = find('y'), kz = find('z');
  if (kx === undefined || ky === undefined || kz === undefined) return null;
  const x = Number(m[kx]), y = Number(m[ky]), z = Number(m[kz]);
  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return null;
  return { x, y, z };
}

/**
 * Any key containing "extrud" is treated as the extrusion-rate signal,
 * whatever the file calls it ("Vitesse Extrudeur" in both real samples).
 * Falls back to "always extruding" when the schema has no such field —
 * honest degradation rather than a guess presented as fact.
 */
export function resolveExtruding(m: Record<string, any> | null | undefined): boolean {
  if (!m) return true;
  const k = Object.keys(m).find(key => key.toLowerCase().includes('extrud'));
  if (k === undefined) return true;
  const v = Number(m[k]);
  return Number.isNaN(v) ? true : v > 0;
}

/** Pretty-print an arbitrary measurement value for the inspector table. */
export function formatValue(v: any): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return String(v);
}
