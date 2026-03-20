/*
 * @Author: your name
 * @Date: 2026-03-17 16:00:23
 * @LastEditors: your name
 * @LastEditTime: 2026-03-18 11:27:16
 * @Description: 
 * @FilePath: \3Dhuman\src\data\human2Anchors.ts
 */
import type { SurfaceAnchor } from '../types'

// These anchors are calibrated specifically for the human2 model.
// They are the transition format before moving to mesh triangle / barycentric calibration.
export const human2SurfaceAnchors: Record<string, SurfaceAnchor> = {
  baihui: {
    position: [0, 2.78, -0.01],
    normal: [0, 1, 0],
  },
 yintang: {
  meshName: 'Object_5',
  triangleIndex: 91270,
  barycentric: [0.188257, 0.405667, 0.406076],
  normal: [0.1095, 0.0244, 0.9937],
  position: [0.0004, 2.9419, 0.1475],
},
  chengjiang: {
    position: [0, 2.12, 0.25],
    normal: [0, -0.08, 0.98],
  },
  shanzhong: {
    position: [0, 1.78, 0.18],
    normal: [0, 0.1, 0.99],
  },
  qihai: {
    position: [0, 1.31, 0.16],
    normal: [0, 0.02, 1],
  },
  guanyuan: {
    position: [0, 1.16, 0.15],
    normal: [0, -0.02, 1],
  },
  dazhui: {
    position: [0, 2.08, -0.12],
    normal: [0, 0.08, -0.99],
  },
  mingmen: {
    position: [0, 1.28, -0.11],
    normal: [0, 0.04, -1],
  },
  'fengchi-left': {
    position: [-0.16, 2.18, -0.17],
    normal: [-0.32, 0.16, -0.93],
  },
  'fengchi-right': {
    position: [0.16, 2.18, -0.17],
    normal: [0.32, 0.16, -0.93],
  },
  'hegu-left': {
    position: [-0.76, 1.03, 0.2],
    normal: [-0.72, 0.14, 0.68],
  },
  'hegu-right': {
    position: [0.76, 1.03, 0.2],
    normal: [0.72, 0.14, 0.68],
  },
  'zusanli-left': {
    position: [-0.24, 0.69, 0.16],
    normal: [-0.18, 0.06, 0.98],
  },
  'zusanli-right': {
    position: [0.24, 0.69, 0.16],
    normal: [0.18, 0.06, 0.98],
  },
  'sanyinjiao-left': {
    position: [-0.12, 0.47, 0.08],
    normal: [-0.44, 0.08, 0.89],
  },
  'sanyinjiao-right': {
    position: [0.12, 0.47, 0.08],
    normal: [0.44, 0.08, 0.89],
  },
}
