/* Mirrors the server DTOs exactly — see gemini3d.trace.gcode.* and
   gemini3d.server.controller.{GcodeController,InclusionController}. */

export type MoveType = 'TRAVEL' | 'EXTRUDE';

export interface ToolpathPointDto {
  lineNumber: number;
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  e: number; f: number;
  moveType: MoveType;
  layer: number;
  cumulativeLength: number;
}

export interface BoundsDto {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export interface GcodeToolpathDto {
  filename: string;
  pointCount: number;
  layerCount: number;
  totalExtrudeLength: number;
  fullBounds: BoundsDto;
  extrudeBounds: BoundsDto;
  unsupportedCommands: Record<string, number>;
  points: ToolpathPointDto[];
}

export interface GcodeFileInfo { name: string; size: number; cached: boolean; }
export interface GcodeListResponse { files: GcodeFileInfo[]; count: number; directory: string; }

export interface TraceInfo { name: string; size?: number; [k: string]: any; }
export interface TraceListResponse { traces: TraceInfo[]; }

export type MonitorStatus = 'ALLOW' | 'UNKNOWN' | 'FAIL';

export interface InclusionStepMessage {
  type: 'step' | 'finished' | 'error';
  step: number;
  tSeconds: number;
  measurement: Record<string, any>;
  verdict: string;
  reason: string | null;
  globalPropertyStatus: MonitorStatus | null;
  [k: string]: any;
}

/** A resolved live point, in source units (mm). */
export interface LivePoint { x: number; y: number; z: number; extruding: boolean; step: number; }
