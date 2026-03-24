/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Tool = 'select' | 'scale' | 'length' | 'area';

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
}

export interface Scale {
  pixelDistance: number;
  realDistance: number;
  unit: string;
}
