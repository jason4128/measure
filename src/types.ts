
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

export interface AppState {
  pages: ProjectPage[];
  currentPageId: string | null;
  viewMode: '2d' | '3d';
}
