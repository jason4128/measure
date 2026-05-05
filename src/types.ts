
export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  points: Point[]; // Using points array for consistency with measurements
  thickness: number;
  height: number;
  color?: string;
  label?: string;
}

export interface Door {
  id: string;
  points: Point[];
  width: number;
  label?: string;
}

export interface Scale {
  pixelDistance: number;
  realDistance: number;
  unit: string;
}

export interface Measurement {
  id: string;
  type: 'length' | 'area';
  points: Point[];
  value: number;
  unit: string;
  label: string;
  color: string;
  perimeter?: number;
  height?: number;
  wallArea?: number;
  isRect?: boolean;
}

export interface ProjectPage {
  id: string;
  name: string;
  imageSrc: string;
  scale: Scale | null;
  measurements: Measurement[];
  walls: Wall[];
  doors: Door[];
  stageScale: number;
  stagePos: Point;
}

export type Tool = 'select' | 'scale' | 'length' | 'area' | 'rect' | 'wall' | 'door';

export type AppMode = 'measure' | 'cad';

export interface CADLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface CADShape {
  id: string;
  type: 'line' | 'rect' | 'circle' | 'text' | 'door_swing' | 'door_sliding' | 'window' | 'dimension';
  points: Point[]; // For line: [start, end]. For rect: [topLeft, bottomRight]. For circle: [center, radiusPoint]
  color: string;
  strokeWidth: number;
  text?: string;
  value?: number;
  unit?: string;
  flipX?: boolean;
  flipY?: boolean;
  layerId?: string;
}

export interface CADPage {
  id: string;
  name: string;
  shapes: CADShape[];
  stageScale: number;
  stagePos: Point;
  gridSize: number;
  scale?: Scale | null;
  layers?: CADLayer[];
  activeLayerId?: string;
}

export interface AppState {
  appMode: AppMode;
  pages: ProjectPage[];
  cadPages: CADPage[];
  currentPageId: string | null;
  currentCadPageId: string | null;
  viewMode: '2d' | '3d';
}
