export type Meridian =
  | '任脉'
  | '督脉'
  | '足阳明胃经'
  | '足太阳膀胱经'
  | '足少阳胆经'
  | '手阳明大肠经'
  | '手太阴肺经'
  | '足太阴脾经'
  | '足少阴肾经'
  | '手厥阴心包经'
  | '手少阴心经'
  | '手太阳小肠经'
  | '足厥阴肝经'
  | '手少阳三焦经'

export type BodyRegion =
  | 'head'
  | 'neck'
  | 'chest'
  | 'abdomen'
  | 'back'
  | 'arm'
  | 'hand'
  | 'leg'
  | 'foot'

export type Side = 'left' | 'right' | 'center'

export type DisplayMode = 'info' | 'acupuncture' | 'moxibustion'

export type SceneViewPreset = 'front' | 'back' | 'left' | 'right' | 'focus'

export type Vector3Tuple = [number, number, number]

export interface CameraPreset {
  position: Vector3Tuple
  target: Vector3Tuple
}

export interface SurfaceAnchor {
  position: Vector3Tuple
  normal: Vector3Tuple
  meshName?: string
  triangleIndex?: number
  barycentric?: Vector3Tuple
}

export interface AcupunctureProfile {
  angle: Vector3Tuple
  depth: number
  needleLength: number
  effectRadius: number
  approachDistance?: number
  entryOffset?: number
  insertDuration?: number
  needleScale?: number
  tipOffset?: number
  tilt?: Vector3Tuple
}

export type NeedleState =
  | 'hidden'
  | 'idle'
  | 'preview'
  | 'snapped'
  | 'inserting'
  | 'inserted'
  | 'resetting'

export interface MoxibustionProfile {
  radius: number
  intensity: number
  hoverHeight: number
  duration: number
  trail: 'circle' | 'line' | 'pulse'
}

export interface AnimationProfile {
  acupuncture: AcupunctureProfile
  moxibustion: MoxibustionProfile
}

export interface Acupoint {
  id: string
  name: string
  aliases: string[]
  meridian: Meridian
  bodyRegion: BodyRegion
  side: Side
  position3d: Vector3Tuple
  surfaceAnchor?: SurfaceAnchor
  cameraPreset: CameraPreset
  summary: string
  location: string
  indications: string[]
  contraindications: string[]
  acupuncture: string
  moxibustion: string
  animationProfile: AnimationProfile
}

export interface Filters {
  keyword: string
  meridian: Meridian | 'all'
  bodyRegion: BodyRegion | 'all'
}
