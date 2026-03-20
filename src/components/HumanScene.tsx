import { Billboard, OrbitControls, Text, useGLTF, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import humanModelUrl from '../assets/models/human2/scene.gltf?url'
import humanModelBinUrl from '../assets/models/human2/scene.bin?url'
import needleModelUrl from '../assets/models/tools/needle/base.glb?url'
import moxaModelUrl from '../assets/models/tools/moxa/moxa.glb?url'
import brushFontUrl from '../assets/fonts/MaShanZheng-Regular.ttf?url'
import inkLabelUrl from '../assets/ink/ink-label.png?url'
import type { Acupoint, CameraPreset, DisplayMode, SceneViewPreset } from '../types'

interface HumanModelFit {
  offset: THREE.Vector3
  scale: number
}

interface ResolvedAcupointAnchor {
  markerPoint: THREE.Vector3
  normal: THREE.Vector3
  skinPoint: THREE.Vector3
  source: 'surface' | 'cache' | 'legacy'
}

interface CalibrationHit {
  barycentric: [number, number, number]
  meshName: string
  normal: [number, number, number]
  pointId: string
  position: [number, number, number]
  triangleIndex: number
}

interface HumanSceneProps {
  acupoints: Acupoint[]
  selectedAcupoint: Acupoint | null
  hoveredAcupointId: string | null
  displayMode: DisplayMode
  viewPreset: SceneViewPreset
  showMarkers: boolean
  procedureKey: number
  onSelectAcupoint: (id: string) => void
  onClearSelection: () => void
  onHoverAcupoint: (id: string | null) => void
}

const HUMAN_MODEL_URL = humanModelUrl
const HUMAN_MODEL_BIN_URL = humanModelBinUrl
const NEEDLE_MODEL_URL = needleModelUrl
const MOXA_MODEL_URL = moxaModelUrl
const BRUSH_FONT_URL = brushFontUrl
const INK_LABEL_URL = inkLabelUrl
const NEEDLE_LOCAL_DIRECTION = new THREE.Vector3(0, 1, 0)
const MOXA_HEAD_LOCAL_POSITION: [number, number, number] = [0, 0.5, 0]


const defaultPresets: Record<Exclude<SceneViewPreset, 'focus'>, CameraPreset> = {
  front: { position: [0, 1.46, 7.55], target: [0, 1.3, 0] },
  back: { position: [0, 1.46, -7.55], target: [0, 1.3, 0] },
  left: { position: [-7.2, 1.4, 0], target: [0, 1.26, 0] },
  right: { position: [7.2, 1.4, 0], target: [0, 1.26, 0] },
}

const worldUp = new THREE.Vector3(0, 1, 0)

function getHumanModelFit(scene: THREE.Group): HumanModelFit {
  const clone = scene.clone()
  clone.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(clone)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const targetHeight = 2.84
  const scale = targetHeight / Math.max(size.y, 0.001)

  return {
    scale,
    offset: new THREE.Vector3(-center.x * scale, -bounds.min.y * scale + 0.02, -center.z * scale),
  }
}

function getAnchorLift(point: Acupoint) {
  return point.bodyRegion === 'head' ? 0.05 : point.bodyRegion === 'neck' ? 0.045 : 0.04
}

function guessAnchorNormal(point: Acupoint) {
  const [x, , z] = point.position3d
  const normal = new THREE.Vector3(x * 0.18, 0.04, z >= 0 ? 1 : -1)

  switch (point.bodyRegion) {
    case 'head':
      if (Math.abs(x) < 0.06 && Math.abs(z) < 0.08) {
        normal.set(0, 1, 0)
      } else if (z >= 0) {
        normal.set(x * 0.12, 0.16, 0.98)
      } else {
        normal.set(x * 0.16, 0.18, -0.96)
      }
      break
    case 'neck':
      normal.set(x * 0.14, 0.08, z >= 0 ? 0.98 : -0.98)
      break
    case 'chest':
    case 'abdomen':
      normal.set(x * 0.08, 0.03, z >= 0 ? 1 : -1)
      break
    case 'back':
      normal.set(x * 0.06, 0.04, -1)
      break
    case 'arm':
    case 'hand':
      normal.set(x >= 0 ? 0.9 : -0.9, 0.08, Math.abs(z) > 0.02 ? Math.sign(z) * 0.42 : 0.18)
      break
    case 'leg':
    case 'foot':
      normal.set(x * 0.24, 0.06, z >= 0 ? 1 : -0.8)
      break
    default:
      break
  }

  if (normal.lengthSq() < 0.0001) {
    normal.set(0, 1, 0)
  }

  return normal.normalize()
}

function getTrianglePoint(
  mesh: THREE.Mesh,
  triangleIndex: number,
  barycentric: [number, number, number],
) {
  const geometry = mesh.geometry
  const positions = geometry.getAttribute('position')
  if (!positions || positions.itemSize < 3) {
    return null
  }

  const triStart = triangleIndex * 3
  const index = geometry.getIndex()
  const getVertexIndex = (offset: number) => (index ? index.getX(triStart + offset) : triStart + offset)
  const aIndex = getVertexIndex(0)
  const bIndex = getVertexIndex(1)
  const cIndex = getVertexIndex(2)

  if (
    aIndex >= positions.count ||
    bIndex >= positions.count ||
    cIndex >= positions.count ||
    aIndex < 0 ||
    bIndex < 0 ||
    cIndex < 0
  ) {
    return null
  }

  const a = new THREE.Vector3().fromBufferAttribute(positions, aIndex)
  const b = new THREE.Vector3().fromBufferAttribute(positions, bIndex)
  const c = new THREE.Vector3().fromBufferAttribute(positions, cIndex)
  const point = a.multiplyScalar(barycentric[0]).add(b.multiplyScalar(barycentric[1])).add(c.multiplyScalar(barycentric[2]))

  mesh.updateMatrixWorld(true)
  return mesh.localToWorld(point)
}

function applyFitToPoint(point: THREE.Vector3, fit: HumanModelFit, emphasis: number) {
  return point.multiplyScalar(fit.scale * emphasis).add(fit.offset)
}

function resolveAcupointAnchor(
  point: Acupoint,
  meshMap: Map<string, THREE.Mesh>,
  fit: HumanModelFit,
  emphasis: number,
): ResolvedAcupointAnchor | null {
  const anchor = point.surfaceAnchor
  let skinPoint: THREE.Vector3 | null = null
  let source: ResolvedAcupointAnchor['source'] = 'legacy'

  if (anchor?.position) {
    skinPoint = new THREE.Vector3(...anchor.position)
    source = 'cache'
  }

  if (!skinPoint && anchor?.meshName && typeof anchor.triangleIndex === 'number' && anchor.barycentric) {
    const mesh = meshMap.get(anchor.meshName)
    if (mesh) {
      const trianglePoint = getTrianglePoint(mesh, anchor.triangleIndex, anchor.barycentric)
      if (trianglePoint) {
        skinPoint = applyFitToPoint(trianglePoint, fit, emphasis)
        source = 'surface'
      }
    }
  }

  if (!skinPoint && point.position3d) {
    skinPoint = new THREE.Vector3(...point.position3d)
    source = 'legacy'
  }

  if (!skinPoint) {
    return null
  }

  const normal =
    anchor?.normal && anchor.normal.some((value) => Math.abs(value) > 0.0001)
      ? new THREE.Vector3(...anchor.normal).normalize()
      : guessAnchorNormal(point)
  const markerPoint = skinPoint.clone().add(normal.clone().multiplyScalar(getAnchorLift(point)))

  return { skinPoint, markerPoint, normal, source }
}

function computeBarycentric(
  point: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): [number, number, number] {
  const v0 = b.clone().sub(a)
  const v1 = c.clone().sub(a)
  const v2 = point.clone().sub(a)
  const d00 = v0.dot(v0)
  const d01 = v0.dot(v1)
  const d11 = v1.dot(v1)
  const d20 = v2.dot(v0)
  const d21 = v2.dot(v1)
  const denom = d00 * d11 - d01 * d01

  if (Math.abs(denom) < 1e-8) {
    return [1, 0, 0]
  }

  const v = (d11 * d20 - d01 * d21) / denom
  const w = (d00 * d21 - d01 * d20) / denom
  const u = 1 - v - w
  return [u, v, w]
}

function roundTuple(vector: THREE.Vector3, precision = 4): [number, number, number] {
  const factor = 10 ** precision
  return [
    Math.round(vector.x * factor) / factor,
    Math.round(vector.y * factor) / factor,
    Math.round(vector.z * factor) / factor,
  ]
}

function installUrlModifier(loader: { manager: THREE.LoadingManager }, assetMap: Record<string, string>) {
  loader.manager.setURLModifier((url) => {
    const normalized = url.replace(/\\/g, '/')
    const withoutCurrentDir = normalized.replace(/^(\.\/)+/, '')
    const withoutLeadingSlash = withoutCurrentDir.replace(/^\/+/, '')
    const pathFromAssets = withoutLeadingSlash.includes('/assets/')
      ? withoutLeadingSlash.slice(withoutLeadingSlash.indexOf('/assets/') + '/assets/'.length)
      : withoutLeadingSlash
    const basename = withoutLeadingSlash.split('/').pop() ?? withoutLeadingSlash

    return (
      assetMap[normalized] ??
      assetMap[withoutCurrentDir] ??
      assetMap[withoutLeadingSlash] ??
      assetMap[pathFromAssets] ??
      assetMap[basename] ??
      url
    )
  })
}

function easeInOut(value: number) {
  if (value <= 0) {
    return 0
  }

  if (value >= 1) {
    return 1
  }

  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
}

const disableRaycast = () => null

function computePrincipalAxis(mesh: THREE.Mesh) {
  const geometry = mesh.geometry
  const positions = geometry.getAttribute('position')
  if (!positions || positions.itemSize < 3 || positions.count === 0) {
    return null
  }

  const centroid = new THREE.Vector3()
  const point = new THREE.Vector3()
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index)
    centroid.add(point)
  }
  centroid.multiplyScalar(1 / positions.count)

  let xx = 0
  let xy = 0
  let xz = 0
  let yy = 0
  let yz = 0
  let zz = 0

  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index).sub(centroid)
    xx += point.x * point.x
    xy += point.x * point.y
    xz += point.x * point.z
    yy += point.y * point.y
    yz += point.y * point.z
    zz += point.z * point.z
  }

  const covariance = [
    [xx, xy, xz],
    [xy, yy, yz],
    [xz, yz, zz],
  ] as const

  const axis = new THREE.Vector3(0, 1, 0)
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const next = new THREE.Vector3(
      covariance[0][0] * axis.x + covariance[0][1] * axis.y + covariance[0][2] * axis.z,
      covariance[1][0] * axis.x + covariance[1][1] * axis.y + covariance[1][2] * axis.z,
      covariance[2][0] * axis.x + covariance[2][1] * axis.y + covariance[2][2] * axis.z,
    )

    if (next.lengthSq() < 1e-8) {
      break
    }
    axis.copy(next.normalize())
  }

  return axis.normalize()
}

function getExtremePointAlongAxis(mesh: THREE.Mesh, axis: THREE.Vector3, preferPositive = true) {
  const positions = mesh.geometry.getAttribute('position')
  if (!positions || positions.itemSize < 3 || positions.count === 0) {
    return null
  }

  const point = new THREE.Vector3()
  let bestPoint: THREE.Vector3 | null = null
  let bestProjection = preferPositive ? -Infinity : Infinity

  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index)
    const projection = point.dot(axis)
    if (
      bestPoint === null ||
      (preferPositive ? projection > bestProjection : projection < bestProjection)
    ) {
      bestProjection = projection
      bestPoint = point.clone()
    }
  }

  return bestPoint
}

function createTintedTexture(source: THREE.Texture, rgb: [number, number, number]) {
  const image = source.image as CanvasImageSource | undefined
  if (!image) {
    return null
  }

  const width = Number(
    'naturalWidth' in image
      ? image.naturalWidth
      : 'videoWidth' in image
        ? image.videoWidth
        : 'width' in image
          ? image.width
          : 0,
  )
  const height = Number(
    'naturalHeight' in image
      ? image.naturalHeight
      : 'videoHeight' in image
        ? image.videoHeight
        : 'height' in image
          ? image.height
          : 0,
  )

  if (!width || !height) {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)
  const data = imageData.data

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3]
    if (alpha === 0) {
      continue
    }

    data[index] = rgb[0]
    data[index + 1] = rgb[1]
    data[index + 2] = rgb[2]
    data[index + 3] = Math.min(255, Math.round(alpha * 0.92))
  }

  context.putImageData(imageData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function createFlameTexture(rgb: [number, number, number]) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  context.clearRect(0, 0, 256, 256)
  context.translate(128, 128)

  const outerGradient = context.createRadialGradient(0, 18, 6, 0, 8, 88)
  outerGradient.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.98)`)
  outerGradient.addColorStop(0.38, `rgba(${rgb[0]}, ${Math.max(0, rgb[1] - 36)}, ${Math.max(0, rgb[2] - 10)}, 0.74)`)
  outerGradient.addColorStop(0.75, `rgba(${Math.max(0, rgb[0] - 30)}, 18, 8, 0.2)`)
  outerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

  context.fillStyle = outerGradient
  context.beginPath()
  context.moveTo(0, -86)
  context.bezierCurveTo(58, -44, 54, 54, 0, 94)
  context.bezierCurveTo(-54, 54, -58, -44, 0, -86)
  context.closePath()
  context.fill()

  const innerGradient = context.createRadialGradient(0, 6, 4, 0, 12, 48)
  innerGradient.addColorStop(0, 'rgba(255, 236, 168, 0.95)')
  innerGradient.addColorStop(0.35, 'rgba(255, 176, 88, 0.82)')
  innerGradient.addColorStop(0.8, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.12)`)
  innerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  context.fillStyle = innerGradient
  context.beginPath()
  context.ellipse(0, 18, 22, 42, 0, 0, Math.PI * 2)
  context.fill()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function FallbackBody() {
  return (
    <group position={[0, 1.48, 0]}>
      <mesh position={[0, 0.88, 0]}>
        <capsuleGeometry args={[0.42, 1.4, 12, 24]} />
        <meshStandardMaterial color="#b4c7d9" roughness={0.78} metalness={0.02} />
      </mesh>
      <mesh position={[0, 2.02, 0]}>
        <sphereGeometry args={[0.24, 24, 24]} />
        <meshStandardMaterial color="#c8d6e3" roughness={0.74} metalness={0.02} />
      </mesh>
      <mesh position={[-0.55, 1.5, 0]} rotation={[0, 0, Math.PI / 9]}>
        <capsuleGeometry args={[0.12, 1.02, 10, 18]} />
        <meshStandardMaterial color="#9bb6ca" roughness={0.8} metalness={0.02} />
      </mesh>
      <mesh position={[0.55, 1.5, 0]} rotation={[0, 0, -Math.PI / 9]}>
        <capsuleGeometry args={[0.12, 1.02, 10, 18]} />
        <meshStandardMaterial color="#9bb6ca" roughness={0.8} metalness={0.02} />
      </mesh>
      <mesh position={[-0.2, 0.28, 0]} rotation={[0, 0, Math.PI / 28]}>
        <capsuleGeometry args={[0.14, 1.18, 10, 18]} />
        <meshStandardMaterial color="#8fa9be" roughness={0.82} metalness={0.02} />
      </mesh>
      <mesh position={[0.2, 0.28, 0]} rotation={[0, 0, -Math.PI / 28]}>
        <capsuleGeometry args={[0.14, 1.18, 10, 18]} />
        <meshStandardMaterial color="#8fa9be" roughness={0.82} metalness={0.02} />
      </mesh>
    </group>
  )
}

class ModelErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  public override state = { hasError: false }

  public static getDerivedStateFromError() {
    return { hasError: true }
  }

  public override componentDidCatch(error: unknown) {
    console.error('Failed to load local human model.', error)
  }

  public override render() {
    if (this.state.hasError) {
      return <FallbackBody />
    }

    return this.props.children
  }
}

function CameraRig({
  selectedAcupoint,
  viewPreset,
}: Pick<HumanSceneProps, 'selectedAcupoint' | 'viewPreset'>) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  const targetPosition = useRef(new THREE.Vector3(...defaultPresets.front.position))
  const targetLookAt = useRef(new THREE.Vector3(...defaultPresets.front.target))
  const isAnimatingRef = useRef(true)

  useEffect(() => {
    const preset =
      viewPreset === 'focus' && selectedAcupoint
        ? selectedAcupoint.cameraPreset
        : defaultPresets[viewPreset === 'focus' ? 'front' : viewPreset]

    targetPosition.current.set(...preset.position)
    targetLookAt.current.set(...preset.target)
    isAnimatingRef.current = true
  }, [selectedAcupoint, viewPreset])

  useFrame((_state, delta) => {
    if (!isAnimatingRef.current) {
      return
    }

    const damping = 1 - Math.exp(-delta * 4)
    camera.position.lerp(targetPosition.current, damping)

    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, damping)
      controlsRef.current.update()
      const settled =
        camera.position.distanceTo(targetPosition.current) < 0.02 &&
        controlsRef.current.target.distanceTo(targetLookAt.current) < 0.02
      if (settled) {
        isAnimatingRef.current = false
      }
    } else if (isAnimatingRef.current) {
      camera.lookAt(targetLookAt.current)
    }
  })

  return (
      <OrbitControls
        ref={controlsRef}
        enablePan
        enableRotate
        enableZoom
        enableDamping
        minDistance={2.2}
        maxDistance={14.2}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.86}
      onStart={() => {
        isAnimatingRef.current = false
      }}
      onChange={() => {
        if (!controlsRef.current || isAnimatingRef.current) {
          return
        }

        targetPosition.current.copy(camera.position)
        targetLookAt.current.copy(controlsRef.current.target)
      }}
    />
  )
}

function HumanModel({
  calibrationEnabled,
  displayMode,
  fit,
  onCalibrationHit,
  onPointerMove,
  onPointerOut,
  scene,
}: {
  calibrationEnabled: boolean
  displayMode: DisplayMode
  fit: HumanModelFit
  onCalibrationHit: (event: ThreeEvent<PointerEvent>) => void
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void
  scene: THREE.Group
}) {
  useEffect(() => {
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return
      }
      child.castShadow = false
      child.receiveShadow = false

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        if (!('roughness' in material)) {
          return
        }

        material.roughness = Math.min(material.roughness ?? 0.8, 0.88)
        if ('metalness' in material) {
          material.metalness = Math.min(material.metalness ?? 0.08, 0.16)
        }
        if ('envMapIntensity' in material) {
          material.envMapIntensity = 1.28
        }
        if ('emissiveIntensity' in material) {
          material.emissiveIntensity =
            displayMode === 'moxibustion' ? 0.08 : displayMode === 'acupuncture' ? 0.05 : 0.02
        }
      })
    })
  }, [displayMode, scene])

  const emphasis = displayMode === 'moxibustion' ? 1.012 : displayMode === 'acupuncture' ? 1.004 : 1

  return (
    <group
      position={fit.offset.toArray()}
      scale={fit.scale * emphasis}
      onPointerDown={calibrationEnabled ? onCalibrationHit : undefined}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
    >
      <primitive object={scene} />
    </group>
  )
}

function SceneStage() {
  return (
    <group position={[0, 0.01, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.25, 72]} />
        <meshBasicMaterial color="#123146" transparent opacity={0.42} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[1.78, 1.92, 72]} />
        <meshBasicMaterial color="#4e8db6" transparent opacity={0.4} />
      </mesh>
    </group>
  )
}

function LoadedToolModel({
  scene,
  targetLength,
  sourceAxis,
  sourceDirection,
  axisDirection = 1,
  widthScale = 1,
  verticalAnchor = 'top',
  axialOffset = 0,
  tipLocalPosition,
  showDebugBox = false,
  showDebugAxes = false,
  showDebugTip = false,
  }: {
  scene: THREE.Group
  targetLength: number
  sourceAxis: 'x' | 'y' | 'z'
  sourceDirection?: [number, number, number]
  axisDirection?: 1 | -1
  widthScale?: number
  verticalAnchor?: 'top' | 'center' | 'bottom'
  axialOffset?: number
  tipLocalPosition?: [number, number, number]
  showDebugBox?: boolean
  showDebugAxes?: boolean
  showDebugTip?: boolean
  }) {
  const fit = useMemo(() => {
    const clone = scene.clone()
    const alignment = new THREE.Group()
    alignment.add(clone)
    let primaryMesh: THREE.Mesh | null = null

    clone.traverse((child) => {
      if (!primaryMesh && child instanceof THREE.Mesh) {
        primaryMesh = child
      }
    })

    if (sourceDirection) {
      clone.quaternion.copy(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(...sourceDirection).normalize(),
          new THREE.Vector3(0, 1, 0),
        ),
      )
    } else if (sourceAxis === 'z') {
      clone.rotation.x = axisDirection === 1 ? Math.PI / 2 : -Math.PI / 2
    } else if (sourceAxis === 'x') {
      clone.rotation.z = axisDirection === 1 ? -Math.PI / 2 : Math.PI / 2
    } else if (sourceAxis === 'y' && axisDirection === -1) {
      clone.rotation.z = Math.PI
    }

    clone.updateMatrixWorld(true)
    alignment.updateMatrixWorld(true)

    const bounds = new THREE.Box3().setFromObject(alignment)
    const size = bounds.getSize(new THREE.Vector3())
    const scale = targetLength / Math.max(size.y, 0.001)
    const centerX = (bounds.min.x + bounds.max.x) * 0.5
    const centerZ = (bounds.min.z + bounds.max.z) * 0.5
    const tipMesh = primaryMesh as THREE.Mesh | null
    const explicitTipPoint = tipLocalPosition && tipMesh
      ? tipMesh.localToWorld(new THREE.Vector3(...tipLocalPosition))
      : null
    const anchorPoint =
      explicitTipPoint ??
      (verticalAnchor === 'center'
        ? new THREE.Vector3(centerX, (bounds.min.y + bounds.max.y) * 0.5, centerZ)
        : (() => {
            const targetIsTop = verticalAnchor === 'top'
            const vertex = new THREE.Vector3()
            const candidate = new THREE.Vector3(
              centerX,
              targetIsTop ? bounds.max.y : bounds.min.y,
              centerZ,
            )
            let found = false

            alignment.traverse((child) => {
              if (!(child instanceof THREE.Mesh)) {
                return
              }

              const geometry = child.geometry
              const positions = geometry.getAttribute('position')
              if (!positions || positions.itemSize < 3) {
                return
              }

              for (let index = 0; index < positions.count; index += 1) {
                vertex.fromBufferAttribute(positions, index)
                vertex.applyMatrix4(child.matrixWorld)

                if (!found || (targetIsTop ? vertex.y > candidate.y : vertex.y < candidate.y)) {
                  candidate.copy(vertex)
                  found = true
                }
              }
            })

            return candidate
          })())

      return {
        boundsCenter: bounds.getCenter(new THREE.Vector3()),
        boundsSize: size.clone(),
        debugTipPosition: explicitTipPoint?.clone() ?? null,
        debugTipLocalPosition: tipLocalPosition ? new THREE.Vector3(...tipLocalPosition) : null,
        scale,
        position: new THREE.Vector3(
          -anchorPoint.x * scale,
        -anchorPoint.y * scale + axialOffset,
        -anchorPoint.z * scale,
      ),
      quaternion: clone.quaternion.clone(),
    }
  }, [axialOffset, axisDirection, scene, sourceAxis, sourceDirection, targetLength, tipLocalPosition, verticalAnchor])

  return (
      <group
        position={fit.position.toArray()}
        scale={[fit.scale * widthScale, fit.scale, fit.scale * widthScale]}
      >
        {showDebugBox ? (
          <mesh position={fit.boundsCenter.toArray()} raycast={disableRaycast}>
            <boxGeometry args={fit.boundsSize.toArray()} />
            <meshBasicMaterial color="#69d8ff" transparent opacity={0.16} depthWrite={false} wireframe />
          </mesh>
        ) : null}
        {showDebugAxes ? <axesHelper args={[0.22]} raycast={disableRaycast} /> : null}
        {showDebugTip && fit.debugTipLocalPosition ? (
          <mesh position={fit.debugTipLocalPosition.toArray()} raycast={disableRaycast}>
            <sphereGeometry args={[0.02, 12, 12]} />
            <meshBasicMaterial color="#ff2ea6" depthWrite={false} />
          </mesh>
        ) : null}
        <group quaternion={fit.quaternion.toArray()}>
          <primitive object={scene} />
        </group>
      </group>
  )
}

interface NeedlePose {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: number
}

function getNeedleProfile(point: Acupoint | null) {
  const profile = point?.animationProfile.acupuncture
  const legacyAngle = profile?.angle
  const normalizedTilt: [number, number, number] = profile?.tilt
    ? profile.tilt
    : legacyAngle
      ? [legacyAngle[0] ?? 0, legacyAngle[1] ?? 0, 0]
      : [0, 0, 0]
  return {
    approachDistance: profile?.approachDistance ?? 0.2,
    entryOffset: profile?.entryOffset ?? 0,
    insertDuration: profile?.insertDuration ?? 0.58,
    needleScale: profile?.needleScale ?? 1,
    tipOffset: profile?.tipOffset ?? 0,
    needleLength: profile?.needleLength ?? 0.045,
    depth: profile?.depth ?? 0.02,
    effectRadius: profile?.effectRadius ?? 0.16,
    tilt: normalizedTilt,
  }
}

function getNeedleQuaternion(normal: THREE.Vector3, tilt: [number, number, number]) {
  const surfaceQuat = new THREE.Quaternion().setFromUnitVectors(NEEDLE_LOCAL_DIRECTION, normal)
  const tiltQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt[0], tilt[1], tilt[2]))
  return surfaceQuat.multiply(tiltQuat)
}

function getMarkerCenter(anchor: ResolvedAcupointAnchor) {
  return anchor.markerPoint.clone()
}

function applyNeedleBias(position: THREE.Vector3, quaternion: THREE.Quaternion, axialBias: number, lateralBias: number) {
  const next = position.clone()
  if (axialBias !== 0) {
    const axis = new THREE.Vector3(0, -1, 0).applyQuaternion(quaternion)
    next.addScaledVector(axis, axialBias)
  }
  if (lateralBias !== 0) {
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion)
    next.addScaledVector(axis, lateralBias)
  }
  return next
}

function getVisibleNeedleNormal(anchor: ResolvedAcupointAnchor, cameraPosition: THREE.Vector3) {
  const toCamera = cameraPosition.clone().sub(anchor.skinPoint).normalize()
  const normal = anchor.normal.clone().normalize()
  return normal.dot(toCamera) >= 0 ? normal : normal.negate()
}

function getApproachNeedlePose(
  point: Acupoint,
  anchor: ResolvedAcupointAnchor,
  normal: THREE.Vector3,
  elapsed: number,
  axialBias: number,
  lateralBias: number,
): NeedlePose {
  const profile = getNeedleProfile(point)
  const hoverWave = Math.sin(elapsed * 2.3) * 0.01
  const quaternion = getNeedleQuaternion(normal, profile.tilt)
  const position = getMarkerCenter(anchor)
    .clone()
    .addScaledVector(normal, profile.approachDistance + profile.entryOffset)
    .add(new THREE.Vector3(0, hoverWave, 0))

  return {
    position: applyNeedleBias(position, quaternion, axialBias, lateralBias),
    quaternion,
    scale: 0.9,
  }
}

function getInsertedNeedleTargetPose(
  point: Acupoint,
  anchor: ResolvedAcupointAnchor,
  normal: THREE.Vector3,
  progress: number,
  axialBias: number,
  lateralBias: number,
): NeedlePose {
  const profile = getNeedleProfile(point)
  const surfaceQuat = getNeedleQuaternion(normal, profile.tilt)
  const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1)
  const thrustPhase = Math.min(clampedProgress / 0.72, 1)
  const settlePhase = clampedProgress > 0.72 ? (clampedProgress - 0.72) / 0.28 : 0
  const thrustOffset = -0.042 * easeInOut(thrustPhase)
  const settleOffset = settlePhase > 0 ? 0.014 * (1 - easeInOut(settlePhase)) : 0
  const insertedPoint = getMarkerCenter(anchor).clone().addScaledVector(normal, thrustOffset + settleOffset)
  const insertedScale = 1 + Math.sin(Math.min(clampedProgress, 1) * Math.PI) * 0.035

  return {
    position: applyNeedleBias(insertedPoint, surfaceQuat, axialBias, lateralBias),
    quaternion: surfaceQuat,
    scale: insertedScale,
  }
}

function NeedleToolActorV2({
  selectedPoint,
  selectedAnchor,
  procedureKey,
}: {
  selectedPoint: Acupoint | null
  selectedAnchor: ResolvedAcupointAnchor | null
  procedureKey: number
}) {
  const needleAxialBias = 0
  const needleLateralBias = 0
  const toolRef = useRef<THREE.Group>(null)
  const twisterRef = useRef<THREE.Group>(null)
  const progressRef = useRef(1)
  const lastProcedureKeyRef = useRef(procedureKey)
  const lockedNormalRef = useRef<THREE.Vector3 | null>(null)
  const { scene } = useGLTF(NEEDLE_MODEL_URL)
  const selectedProfile = getNeedleProfile(selectedPoint)
  const needleTipLocalPosition: [number, number, number] = [-0.00011, 0, -0.00047]
  const needleRenderLength = Math.max(0.22, selectedProfile.needleLength * 5.1)

  useEffect(() => {
    if (selectedPoint && selectedAnchor && procedureKey !== lastProcedureKeyRef.current) {
      lastProcedureKeyRef.current = procedureKey
      progressRef.current = 0
      return
    }

    progressRef.current = 1
  }, [procedureKey, selectedAnchor, selectedPoint])

  useEffect(() => {
    lockedNormalRef.current = null
  }, [selectedAnchor?.skinPoint.x, selectedAnchor?.skinPoint.y, selectedAnchor?.skinPoint.z, selectedPoint?.id])

  useEffect(() => {
    scene.traverse((child) => {
      child.frustumCulled = false
      if (!(child instanceof THREE.Mesh)) {
        return
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.roughness = 0.12
          material.metalness = 1
          material.color.set('#ffffff')
          material.emissive.set('#eef5ff')
          material.emissiveIntensity = 0.04
          material.envMapIntensity = 1.9
        }
      })
    })
  }, [scene])

  useFrame((state, delta) => {
    if (!toolRef.current || !selectedPoint || !selectedAnchor) {
      return
    }

    const loop = state.clock.getElapsedTime()
    const isInsertedFlow = procedureKey > 0
    if (!lockedNormalRef.current) {
      lockedNormalRef.current = getVisibleNeedleNormal(selectedAnchor, state.camera.position)
    }
    const lockedNormal = lockedNormalRef.current

    if (isInsertedFlow) {
      progressRef.current = Math.min(1, progressRef.current + delta / selectedProfile.insertDuration)
      const insertedPose = getInsertedNeedleTargetPose(
        selectedPoint,
        selectedAnchor,
        lockedNormal,
        progressRef.current,
        needleAxialBias,
        needleLateralBias,
      )
      const approachPose = getApproachNeedlePose(
        selectedPoint,
        selectedAnchor,
        lockedNormal,
        loop,
        needleAxialBias,
        needleLateralBias,
      )
      const travel = easeInOut(progressRef.current)

      toolRef.current.position.copy(approachPose.position.clone().lerp(insertedPose.position, travel))
      toolRef.current.quaternion.copy(approachPose.quaternion.clone().slerp(insertedPose.quaternion, travel))
      toolRef.current.scale.setScalar(THREE.MathUtils.lerp(approachPose.scale, insertedPose.scale, travel))
    } else {
      progressRef.current = 1
      const approachPose = getApproachNeedlePose(
        selectedPoint,
        selectedAnchor,
        lockedNormal,
        loop,
        needleAxialBias,
        needleLateralBias,
      )
      toolRef.current.position.copy(approachPose.position)
      toolRef.current.quaternion.copy(approachPose.quaternion)
      toolRef.current.scale.setScalar(approachPose.scale)
    }

    if (twisterRef.current) {
      twisterRef.current.rotation.y =
        isInsertedFlow && progressRef.current < 0.98 ? Math.sin(loop * 9) * 0.014 : Math.sin(loop * 2.6) * 0.01
    }
  })

  if (!selectedPoint || !selectedAnchor) {
    return null
  }

  const isInserted = procedureKey > 0 && progressRef.current > 0.98

  return (
    <group>
      <group ref={toolRef}>
        <group ref={twisterRef}>
          <LoadedToolModel
            scene={scene}
            targetLength={needleRenderLength}
            sourceAxis="y"
            widthScale={1}
            verticalAnchor="top"
            axialOffset={0}
            tipLocalPosition={needleTipLocalPosition}
          />
        </group>
      </group>

        {isInserted && selectedAnchor && (
          <Billboard position={selectedAnchor.skinPoint.clone().add(new THREE.Vector3(0.32, -0.08, 0)).toArray()}>
            <Suspense fallback={null}>
              <Text
                fontSize={0.064}
                color="#a7281b"
                outlineWidth={0.0035}
                outlineColor="#f0c874"
                anchorX="left"
                anchorY="middle"
                font={BRUSH_FONT_URL}
              >
                进针完成
              </Text>
            </Suspense>
        </Billboard>
      )}
    </group>
  )
}

function MoxaToolActor({
  previewPoint,
  previewAnchor,
  activePoint,
  procedureKey,
}: {
  previewPoint: Acupoint | null
  previewAnchor: ResolvedAcupointAnchor | null
  activePoint: Acupoint | null
  procedureKey: number
}) {
  const toolRef = useRef<THREE.Group>(null)
  const emberSpriteRef = useRef<THREE.Sprite>(null)
  const emberLightRef = useRef<THREE.PointLight>(null)
  const progressRef = useRef(1)
  const { scene } = useGLTF(MOXA_MODEL_URL)
  const flameTexture = useMemo(() => createFlameTexture([230, 44, 22]), [])
  const moxaAlignment = useMemo(() => {
    let primaryMesh: THREE.Mesh | null = null
    scene.traverse((child) => {
      if (!primaryMesh && child instanceof THREE.Mesh) {
        primaryMesh = child
      }
    })

    if (!primaryMesh) {
      return {
        sourceDirection: [0, 1, 0] as [number, number, number],
        headLocalPosition: MOXA_HEAD_LOCAL_POSITION,
      }
    }

    const axis = computePrincipalAxis(primaryMesh) ?? new THREE.Vector3(0, 1, 0)
    const headAxis = axis.clone().negate()
    const headPoint =
      getExtremePointAlongAxis(primaryMesh, headAxis, true) ?? new THREE.Vector3(...MOXA_HEAD_LOCAL_POSITION)

    return {
      sourceDirection: roundTuple(headAxis, 6),
      headLocalPosition: roundTuple(headPoint, 6),
    }
  }, [scene])

  useEffect(() => {
    if (procedureKey > 0 && activePoint && previewPoint?.id === activePoint.id) {
      progressRef.current = 0
      return
    }

    progressRef.current = 1
  }, [activePoint?.id, previewPoint?.id, procedureKey])

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        if ('roughness' in material) {
          material.roughness = Math.min(material.roughness ?? 0.8, 0.82)
        }
        if ('metalness' in material) {
          material.metalness = Math.min(material.metalness ?? 0.08, 0.12)
        }
      })
    })
  }, [scene])

  useFrame(({ clock }, delta) => {
    if (!toolRef.current || !previewPoint || !previewAnchor) {
      return
    }

    const markerCenter = getMarkerCenter(previewAnchor)
    const normal = previewAnchor.normal.clone().normalize()
    const config = previewPoint.animationProfile.moxibustion
    const emberHoverDistance = Math.max(0.038, config.hoverHeight * 0.22)
    const isActive = procedureKey > 0 && activePoint?.id === previewPoint.id
    progressRef.current = isActive ? Math.min(1, progressRef.current + delta * 1.2) : 1

    const tangent = new THREE.Vector3()
      .crossVectors(Math.abs(normal.dot(worldUp)) > 0.92 ? new THREE.Vector3(1, 0, 0) : worldUp, normal)
      .normalize()
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize()
    const orbitRadius =
      config.trail === 'line' ? 0.05 : config.trail === 'pulse' ? 0.038 : 0.06
    const orbitOffset = isActive
      ? config.trail === 'line'
        ? tangent
            .clone()
            .multiplyScalar(Math.sin(clock.getElapsedTime() * 1.8) * orbitRadius)
        : config.trail === 'pulse'
          ? tangent
              .clone()
              .multiplyScalar(Math.cos(clock.getElapsedTime() * 2.2) * orbitRadius * 0.75)
              .add(bitangent.clone().multiplyScalar(Math.sin(clock.getElapsedTime() * 2.2) * orbitRadius * 0.2))
          : tangent
              .clone()
              .multiplyScalar(Math.cos(clock.getElapsedTime() * 1.55) * orbitRadius)
              .add(bitangent.clone().multiplyScalar(Math.sin(clock.getElapsedTime() * 1.55) * orbitRadius))
      : new THREE.Vector3()

    const desiredEmberPoint = markerCenter
      .clone()
      .addScaledVector(normal, emberHoverDistance)
      .add(orbitOffset)
    const inwardDirection = markerCenter.clone().sub(desiredEmberPoint).normalize()

    toolRef.current.position.copy(desiredEmberPoint)
    toolRef.current.quaternion.copy(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), inwardDirection),
    )

    const pulse = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 5.2)
    if (emberSpriteRef.current) {
      ;(emberSpriteRef.current.material as THREE.SpriteMaterial).opacity = 0.42 + pulse * 0.28
    }

    if (emberLightRef.current) {
      emberLightRef.current.intensity = 0.85 + pulse * 0.95
      emberLightRef.current.distance = 0.24 + pulse * 0.06
    }
  })

  if (!previewPoint || !previewAnchor) {
    return null
  }

  return (
    <group>
      <group ref={toolRef}>
        <LoadedToolModel
          scene={scene}
          targetLength={0.18}
          sourceAxis="y"
          sourceDirection={moxaAlignment.sourceDirection}
          axisDirection={1}
          tipLocalPosition={moxaAlignment.headLocalPosition}
        />
        {flameTexture ? (
          <sprite ref={emberSpriteRef} position={[0, 0, 0]} scale={[0.1, 0.14, 1]} raycast={disableRaycast}>
            <spriteMaterial map={flameTexture} transparent opacity={0.58} depthWrite={false} />
          </sprite>
        ) : null}
        <pointLight
          ref={emberLightRef}
          position={[0, 0, 0]}
          color="#ff5a1f"
          intensity={1.4}
          distance={0.32}
          decay={2}
        />
      </group>
    </group>
  )
}

function ToolActor({
  displayMode,
  hoveredPoint,
  hoveredAnchor,
  selectedPoint,
  selectedAnchor,
  procedureKey,
}: {
  displayMode: DisplayMode
  hoveredPoint: Acupoint | null
  hoveredAnchor: ResolvedAcupointAnchor | null
  selectedPoint: Acupoint | null
  selectedAnchor: ResolvedAcupointAnchor | null
  procedureKey: number
}) {
  if (displayMode === 'info') return null
  if (displayMode === 'acupuncture') {
    return (
      <NeedleToolActorV2
        selectedPoint={selectedPoint}
        selectedAnchor={selectedAnchor}
        procedureKey={procedureKey}
      />
    )
  }

  const previewPoint = hoveredPoint ?? selectedPoint
  const previewAnchor = hoveredAnchor ?? selectedAnchor
  if (!previewPoint || !previewAnchor) return null

  return (
    <MoxaToolActor
      previewPoint={previewPoint}
      previewAnchor={previewAnchor}
      activePoint={selectedPoint}
      procedureKey={procedureKey}
    />
  )
}

function AcupointMarker({
  point,
  resolvedAnchor,
  selected,
  hovered,
  showMarkers,
  onSelectAcupoint,
  onHoverAcupoint,
}: {
  point: Acupoint
  resolvedAnchor: ResolvedAcupointAnchor
  selected: boolean
  hovered: boolean
  showMarkers: boolean
  onSelectAcupoint: (id: string) => void
  onHoverAcupoint: (id: string | null) => void
}) {
  const coreRef = useRef<THREE.Mesh>(null)
  const markerOffset = resolvedAnchor.markerPoint.clone().sub(resolvedAnchor.skinPoint)
  const labelOffset = markerOffset.clone().add(new THREE.Vector3(0.16, 0.08, 0))
  const baseInkTexture = useTexture(INK_LABEL_URL)
  const inkTexture = useMemo(() => createTintedTexture(baseInkTexture, [242, 203, 98]), [baseInkTexture])
  const inkLabelWidth = Math.max(0.46, point.name.length * 0.18)
  const connectorLength = markerOffset.length()
  const connectorMidpoint = useMemo(() => markerOffset.clone().multiplyScalar(0.5), [markerOffset])
  const connectorQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), markerOffset.clone().normalize()),
    [markerOffset],
  )

  useEffect(() => {
    return () => {
      inkTexture?.dispose()
    }
  }, [inkTexture])

  useFrame(({ clock }) => {
    const pulse = 0.78 + Math.sin(clock.getElapsedTime() * (selected ? 5.2 : 3)) * 0.08

    if (coreRef.current) {
      coreRef.current.scale.setScalar((selected ? 1.22 : hovered ? 1.08 : 0.96) * pulse)
    }
  })

  return (
    <group position={resolvedAnchor.skinPoint.toArray()} visible={showMarkers || selected}>
      <mesh
        position={resolvedAnchor.markerPoint.clone().sub(resolvedAnchor.skinPoint).toArray()}
        onClick={(event) => {
          event.stopPropagation()
          onSelectAcupoint(point.id)
        }}
        onPointerEnter={(event) => {
          event.stopPropagation()
          onHoverAcupoint(point.id)
        }}
        onPointerLeave={(event) => {
          event.stopPropagation()
          onHoverAcupoint(null)
        }}
      >
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh
        position={connectorMidpoint.toArray()}
        quaternion={connectorQuaternion}
        raycast={disableRaycast}
      >
        <cylinderGeometry args={[0.0045, 0.006, connectorLength, 12]} />
        <meshPhysicalMaterial
          color={selected ? '#b88743' : hovered ? '#9f7239' : '#7a5229'}
          emissive={selected ? '#6e430f' : '#42240a'}
          emissiveIntensity={selected ? 0.12 : hovered ? 0.08 : 0.05}
          roughness={0.44}
          metalness={0.04}
          clearcoat={0.3}
          clearcoatRoughness={0.35}
        />
      </mesh>
      <mesh
        ref={coreRef}
        position={markerOffset.toArray()}
        raycast={disableRaycast}
      >
        <sphereGeometry args={[0.022, 24, 24]} />
        <meshPhysicalMaterial
          color={selected ? '#d2a15a' : hovered ? '#bb8547' : '#976434'}
          emissive={selected ? '#7f4a18' : '#582f10'}
          emissiveIntensity={selected ? 0.2 : hovered ? 0.14 : 0.1}
          roughness={0.38}
          metalness={0.06}
          clearcoat={0.72}
          clearcoatRoughness={0.24}
        />
      </mesh>
      {selected && (
        <Billboard position={labelOffset.toArray()} follow lockX={false} lockY={false} lockZ={false}>
          {inkTexture && (
            <sprite
              scale={[inkLabelWidth, 0.32, 1]}
              position={[inkLabelWidth * 0.4, 0, -0.01]}
              raycast={disableRaycast}
            >
              <spriteMaterial
                map={inkTexture}
                color="#f2cb62"
                transparent
                opacity={0.64}
                depthWrite={false}
              />
            </sprite>
          )}
          <Suspense fallback={null}>
            <Text
              fontSize={0.128}
              color="#a7281b"
              outlineWidth={0.004}
              outlineColor="#f0c874"
              anchorX="left"
              anchorY="middle"
              font={BRUSH_FONT_URL}
            >
              {point.name}
            </Text>
          </Suspense>
        </Billboard>
      )}
    </group>
  )
}

function SceneContent({
  calibrationEnabled,
  onCalibrationHit,
  ...props
}: HumanSceneProps & {
  calibrationEnabled: boolean
  onCalibrationHit: (hit: CalibrationHit | null) => void
}) {
  const { scene } = useGLTF(HUMAN_MODEL_URL, false, false, (loader) => {
    installUrlModifier(loader, { 'scene.bin': HUMAN_MODEL_BIN_URL })
  })
  const hoveredPoint = props.acupoints.find((point) => point.id === props.hoveredAcupointId) ?? null
  const previewPoint = hoveredPoint ?? props.selectedAcupoint
  const fit = useMemo(() => getHumanModelFit(scene), [scene])
  const emphasis = props.displayMode === 'moxibustion' ? 1.012 : props.displayMode === 'acupuncture' ? 1.004 : 1
  const meshMap = useMemo(() => {
    const next = new Map<string, THREE.Mesh>()
    scene.updateMatrixWorld(true)
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name) {
        next.set(child.name, child)
      }
    })
    return next
  }, [scene])
  const resolvedAcupoints = useMemo(
    () =>
      props.acupoints
        .map((point) => ({
          point,
          resolved: resolveAcupointAnchor(point, meshMap, fit, emphasis),
        }))
        .filter(
          (entry): entry is { point: Acupoint; resolved: ResolvedAcupointAnchor } => entry.resolved !== null,
        ),
    [emphasis, fit, meshMap, props.acupoints],
  )
  const resolvedMap = useMemo(
    () => new Map(resolvedAcupoints.map((entry) => [entry.point.id, entry.resolved])),
    [resolvedAcupoints],
  )
  
  const previewAnchor = previewPoint ? resolvedMap.get(previewPoint.id) ?? null : null
  const selectedAnchor = props.selectedAcupoint ? resolvedMap.get(props.selectedAcupoint.id) ?? null : null

  const handleCalibrationPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!calibrationEnabled || !props.selectedAcupoint || !(event.object instanceof THREE.Mesh) || event.faceIndex == null) {
      return
    }

    const mesh = event.object
    const geometry = mesh.geometry
    const positions = geometry.getAttribute('position')
    if (!positions || positions.itemSize < 3) {
      return
    }

    const triangleIndex = event.faceIndex
    const triStart = triangleIndex * 3
    const index = geometry.getIndex()
    const getVertexIndex = (offset: number) => (index ? index.getX(triStart + offset) : triStart + offset)
    const aIndex = getVertexIndex(0)
    const bIndex = getVertexIndex(1)
    const cIndex = getVertexIndex(2)

    if (
      aIndex >= positions.count ||
      bIndex >= positions.count ||
      cIndex >= positions.count ||
      aIndex < 0 ||
      bIndex < 0 ||
      cIndex < 0
    ) {
      return
    }

    const a = new THREE.Vector3().fromBufferAttribute(positions, aIndex)
    const b = new THREE.Vector3().fromBufferAttribute(positions, bIndex)
    const c = new THREE.Vector3().fromBufferAttribute(positions, cIndex)
    const localHit = mesh.worldToLocal(event.point.clone())
    const barycentric = computeBarycentric(localHit, a, b, c)
    const normal = (event.face?.normal ?? worldUp).clone().transformDirection(mesh.matrixWorld).normalize()
    const point = roundTuple(event.point)
    const hit: CalibrationHit = {
      pointId: props.selectedAcupoint.id,
      meshName: mesh.name,
      triangleIndex,
      barycentric: [
        Number(barycentric[0].toFixed(6)),
        Number(barycentric[1].toFixed(6)),
        Number(barycentric[2].toFixed(6)),
      ],
      normal: roundTuple(normal),
      position: point,
    }

    onCalibrationHit(hit)
    console.info(
      `[human2-calibration] ${hit.pointId}: {\n  meshName: '${hit.meshName}',\n  triangleIndex: ${hit.triangleIndex},\n  barycentric: [${hit.barycentric.join(', ')}],\n  normal: [${hit.normal.join(', ')}],\n  position: [${hit.position.join(', ')}],\n}`,
    )
    event.stopPropagation()
  }

  return (
    <>
      <color attach="background" args={['#08131e']} />
      <fog attach="fog" args={['#08131e', 7.5, 16]} />
      <hemisphereLight args={['#f1f8ff', '#153245', 1.2]} />
      <ambientLight intensity={1.38} />
      <directionalLight position={[2.8, 5.8, 5.2]} intensity={2.35} color="#eff8ff" />
      <directionalLight position={[-4.8, 3.8, -2.8]} intensity={0.9} color="#7fcfff" />
      <pointLight position={[2.8, 3.2, 3.8]} intensity={1.15} color="#97dcff" />
      <pointLight position={[-2.6, 2.4, -3.2]} intensity={0.84} color="#ffdcb8" />
      <SceneStage />
      <HumanModel
        calibrationEnabled={calibrationEnabled}
        displayMode={props.displayMode}
        fit={fit}
        onCalibrationHit={handleCalibrationPointerDown}
        scene={scene}
      />
      <Suspense fallback={null}>
        <ToolActor
          displayMode={props.displayMode}
          hoveredPoint={hoveredPoint}
          hoveredAnchor={hoveredPoint ? previewAnchor : null}
          selectedPoint={props.selectedAcupoint}
          selectedAnchor={selectedAnchor}
          procedureKey={props.procedureKey}
        />
      </Suspense>
      {resolvedAcupoints.map(({ point, resolved }) => (
        <AcupointMarker
          key={point.id}
          point={point}
          resolvedAnchor={resolved}
          selected={props.selectedAcupoint?.id === point.id}
          hovered={props.hoveredAcupointId === point.id}
          showMarkers={props.showMarkers}
          onSelectAcupoint={props.onSelectAcupoint}
          onHoverAcupoint={props.onHoverAcupoint}
        />
      ))}
      <CameraRig selectedAcupoint={props.selectedAcupoint} viewPreset={props.viewPreset} />
    </>
  )
}

export function HumanScene(props: HumanSceneProps) {
  const [canvasKey, setCanvasKey] = useState(0)
  const calibrationEnabled =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('calibrate') === '1'
  const [calibrationHit, setCalibrationHit] = useState<CalibrationHit | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [contextLost, setContextLost] = useState(false)
  const recoveryTimeoutRef = useRef<number | null>(null)
  const calibrationSnippet = useMemo(() => {
    if (!calibrationHit) {
      return ''
    }

    return `${calibrationHit.pointId}: {\n  meshName: '${calibrationHit.meshName}',\n  triangleIndex: ${calibrationHit.triangleIndex},\n  barycentric: [${calibrationHit.barycentric.join(', ')}],\n  normal: [${calibrationHit.normal.join(', ')}],\n  position: [${calibrationHit.position.join(', ')}],\n},`
  }, [calibrationHit])

  useEffect(() => {
    return () => {
      if (recoveryTimeoutRef.current !== null) {
        window.clearTimeout(recoveryTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!calibrationHit) {
      setCopyState('idle')
    }
  }, [calibrationHit])

  const handleCopyCalibration = async () => {
    if (!calibrationSnippet) {
      return
    }

    try {
      await navigator.clipboard.writeText(calibrationSnippet)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <div className="scene-canvas-shell">
      {contextLost && <div className="scene-loading scene-loading-overlay">3D 场景正在恢复...</div>}
      {calibrationEnabled && (
        <div className="calibration-panel">
          <strong>Calibration Mode</strong>
          <span>{props.selectedAcupoint ? `Target: ${props.selectedAcupoint.name}` : 'Select an acupoint first'}</span>
          <span>{calibrationHit ? `Mesh: ${calibrationHit.meshName} / Face: ${calibrationHit.triangleIndex}` : 'Click model surface to capture an anchor'}</span>
          <pre className="calibration-snippet">{calibrationSnippet || '// capture a point to generate anchor data'}</pre>
          <div className="calibration-actions">
            <button type="button" className="calibration-button" onClick={handleCopyCalibration} disabled={!calibrationSnippet}>
              {copyState === 'copied' ? 'Copied' : 'Copy anchor'}
            </button>
            <button
              type="button"
              className="calibration-button is-ghost"
              onClick={() => setCalibrationHit(null)}
              disabled={!calibrationHit}
            >
              Clear
            </button>
          </div>
          {copyState === 'error' && <span>Clipboard copy failed. Copy the snippet manually.</span>}
        </div>
      )}
      <Canvas
        key={canvasKey}
        camera={{ position: defaultPresets.front.position, fov: 31 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#08131e')

          const canvas = gl.domElement

          const handleContextLost = (event: Event) => {
            event.preventDefault()
            setContextLost(true)

            if (recoveryTimeoutRef.current !== null) {
              window.clearTimeout(recoveryTimeoutRef.current)
            }

            recoveryTimeoutRef.current = window.setTimeout(() => {
              setCanvasKey((current) => current + 1)
              setContextLost(false)
            }, 320)
          }

          const handleContextRestored = () => {
            setContextLost(false)
          }

          canvas.addEventListener('webglcontextlost', handleContextLost, false)
          canvas.addEventListener('webglcontextrestored', handleContextRestored, false)
        }}
      >
        <ModelErrorBoundary>
          <Suspense fallback={<FallbackBody />}>
            <SceneContent
              {...props}
              calibrationEnabled={calibrationEnabled}
              onCalibrationHit={setCalibrationHit}
            />
          </Suspense>
        </ModelErrorBoundary>
      </Canvas>
    </div>
  )
}
