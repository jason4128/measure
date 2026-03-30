/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Tool = 'select' | 'scale' | 'length' | 'area' | 'rect';

export interface Point {
  x: number;
  y: number;
}

export interface Measurement {
  id: string;
  type: 'length' | 'area';
  points: Point[];
  value: number; // Real-world value
  unit: string;
  label: string;
  color: string;
  isRect?: boolean;
  height?: number; // Ceiling height
  wallArea?: number; // Calculated wall area
  perimeter?: number; // Calculated perimeter
}

export interface Scale {
  pixelDistance: number;
  realDistance: number;
  unit: string;
}

export interface ProjectPage {
  id: string;
  name: string;
  imageSrc: string;
  scale: Scale | null;
  measurements: Measurement[];
  stageScale: number;
  stagePos: Point;
}
