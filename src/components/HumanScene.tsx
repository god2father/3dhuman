import { Billboard, Line, OrbitControls, Text, useGLTF, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import humanModelUrl from '../assets/models/human2/scene.gltf?url'
import humanModelBinUrl from '../assets/models/human2/scene.bin?url'
import needleModelUrl from '../assets/models/tools/needle/scene.glb?url'
import moxaModelUrl from '../assets/models/tools/moxa/scene.gltf?url'
import moxaModelBinUrl from '../assets/models/tools/moxa/scene.bin?url'
import moxaBaseColorUrl from '../assets/models/tools/moxa/textures/Material.002_baseColor.png?url'
import smokeSheetUrl from '../assets/smoke_sheet.png?url'
import type { Acupoint, CameraPreset, DisplayMode, SceneViewPreset } from '../types'

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
const MOXA_MODEL_BIN_URL = moxaModelBinUrl

const moxaAssetMap: Record<string, string> = {
  'scene.bin': MOXA_MODEL_BIN_URL,
  'textures/Material.002_baseColor.png': moxaBaseColorUrl,
}

const defaultPresets: Record<Exclude<SceneViewPreset, 'focus'>, CameraPreset> = {
  front: { position: [0, 1.5, 7.35], target: [0, 1.46, 0] },
  back: { position: [0, 1.5, -7.35], target: [0, 1.46, 0] },
  left: { position: [-6.95, 1.46, 0], target: [0, 1.42, 0] },
  right: { position: [6.95, 1.46, 0], target: [0, 1.42, 0] },
}

const markerColorByMode: Record<DisplayMode, string> = {
  info: '#84ccff',
  acupuncture: '#7cc9ff',
  moxibustion: '#ff9a52',
}

const worldUp = new THREE.Vector3(0, 1, 0)

function getMarkerOffset(point: Acupoint): [number, number, number] {
  if (point.surfaceAnchor) {
    const normal = new THREE.Vector3(...point.surfaceAnchor.normal)
    if (normal.lengthSq() > 0.0001) {
      normal.normalize()
      normal.multiplyScalar(point.bodyRegion === 'head' ? 0.05 : point.bodyRegion === 'neck' ? 0.045 : 0.04)
      return [normal.x, normal.y, normal.z]
    }
  }

  const [x, , z] = point.position3d
  const offset = new THREE.Vector3(x * 0.1, 0.04, z * 0.12)

  switch (point.bodyRegion) {
    case 'head':
      if (Math.abs(x) < 0.06 && Math.abs(z) < 0.08) {
        offset.set(0, 0.07, 0)
      } else if (z >= 0) {
        offset.set(x * 0.08, 0.02, 0.06)
      } else {
        offset.set(x * 0.08, 0.05, -0.05)
      }
      break
    case 'neck':
      offset.set(x * 0.08, 0.03, z >= 0 ? 0.05 : -0.05)
      break
    case 'chest':
    case 'abdomen':
      offset.set(x * 0.06, 0.02, z >= 0 ? 0.05 : -0.04)
      break
    case 'back':
      offset.set(x * 0.05, 0.02, -0.05)
      break
    case 'arm':
    case 'hand':
      offset.set(x >= 0 ? 0.05 : -0.05, 0.02, z * 0.05)
      break
    case 'leg':
    case 'foot':
      offset.set(x * 0.06, 0.02, z >= 0 ? 0.04 : -0.03)
      break
    default:
      break
  }

  if (offset.lengthSq() < 0.0001) {
    offset.set(0, 0.08, 0)
  }

  offset.setLength(point.bodyRegion === 'head' ? 0.07 : point.bodyRegion === 'neck' ? 0.06 : 0.055)

  return [offset.x, offset.y, offset.z]
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
      minDistance={3.8}
      maxDistance={13.8}
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

function HumanModel({ displayMode }: { displayMode: DisplayMode }) {
  const { scene } = useGLTF(HUMAN_MODEL_URL, false, false, (loader) => {
    installUrlModifier(loader, { 'scene.bin': HUMAN_MODEL_BIN_URL })
  })
  const fit = useMemo(() => {
    const clone = scene.clone()
    clone.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(clone)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const targetHeight = 3.05
    const scale = targetHeight / Math.max(size.y, 0.001)

    return {
      scale,
      offset: new THREE.Vector3(-center.x * scale, -bounds.min.y * scale + 0.02, -center.z * scale),
    }
  }, [scene])

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
    <group position={fit.offset.toArray()} scale={fit.scale * emphasis}>
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

function FocusBloom({ point, displayMode }: { point: Acupoint; displayMode: DisplayMode }) {
  const bloomRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!bloomRef.current) {
      return
    }

    const pulse = 0.92 + Math.sin(clock.getElapsedTime() * 3.2) * 0.1
    bloomRef.current.scale.setScalar(pulse)
    ;(bloomRef.current.material as THREE.MeshBasicMaterial).opacity =
      displayMode === 'moxibustion' ? 0.24 : 0.14
  })

  return (
    <mesh ref={bloomRef} position={point.position3d}>
      <sphereGeometry args={[0.12, 24, 24]} />
      <meshBasicMaterial
        color={displayMode === 'moxibustion' ? '#ffb36b' : '#8bdbff'}
        transparent
        opacity={0.16}
      />
    </mesh>
  )
}

function LoadedToolModel({
  scene,
  targetLength,
  sourceAxis,
}: {
  scene: THREE.Group
  targetLength: number
  sourceAxis: 'x' | 'z'
}) {
  const fit = useMemo(() => {
    const clone = scene.clone()
    const alignment = new THREE.Group()
    alignment.add(clone)

    if (sourceAxis === 'z') {
      clone.rotation.x = Math.PI / 2
    } else {
      clone.rotation.z = -Math.PI / 2
    }

    clone.updateMatrixWorld(true)
    alignment.updateMatrixWorld(true)

    const bounds = new THREE.Box3().setFromObject(alignment)
    const size = bounds.getSize(new THREE.Vector3())
    const scale = targetLength / Math.max(size.y, 0.001)
    const centerX = (bounds.min.x + bounds.max.x) * 0.5
    const centerZ = (bounds.min.z + bounds.max.z) * 0.5

    return {
      scale,
      position: new THREE.Vector3(-centerX * scale, -bounds.max.y * scale, -centerZ * scale),
      rotation: clone.rotation.clone(),
    }
  }, [scene, sourceAxis, targetLength])

  return (
    <group position={fit.position.toArray()} scale={fit.scale}>
      <primitive object={scene} rotation={fit.rotation.toArray()} />
    </group>
  )
}

function NeedleToolActor({
  previewPoint,
  activePoint,
  procedureKey,
}: {
  previewPoint: Acupoint | null
  activePoint: Acupoint | null
  procedureKey: number
}) {
  const toolRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const progressRef = useRef(1)
  const { scene } = useGLTF(NEEDLE_MODEL_URL)

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
          material.roughness = Math.min(material.roughness ?? 0.6, 0.64)
        }
        if ('metalness' in material) {
          material.metalness = Math.max(material.metalness ?? 0.2, 0.42)
        }
      })
    })
  }, [scene])

  useFrame(({ clock }, delta) => {
    if (!toolRef.current || !previewPoint) {
      return
    }

    const base = new THREE.Vector3(...previewPoint.position3d)
    const direction = new THREE.Vector3(...previewPoint.animationProfile.acupuncture.angle).normalize()
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction)
    const isActive = procedureKey > 0 && activePoint?.id === previewPoint.id
    const previewOffset = direction
      .clone()
      .multiplyScalar(-0.4)
      .add(worldUp.clone().multiplyScalar(0.1))
    const previewPosition = base.clone().add(previewOffset)

    if (isActive) {
      progressRef.current = Math.min(1, progressRef.current + delta * 1.35)
    } else {
      progressRef.current = 1
    }

    const pulse = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 3.2)
    const travel = easeInOut(progressRef.current)
    const insertDepth = previewPoint.animationProfile.acupuncture.depth * travel
    const engagedPosition = base.clone().addScaledVector(direction, insertDepth)
    const finalPosition = isActive
      ? previewPosition.clone().lerp(engagedPosition, travel)
      : previewPosition.clone().add(worldUp.clone().multiplyScalar(Math.sin(clock.getElapsedTime() * 1.8) * 0.01))

    toolRef.current.position.copy(finalPosition)
    toolRef.current.quaternion.slerp(quaternion, 1 - Math.exp(-delta * 10))
    toolRef.current.scale.setScalar(isActive ? 1 : 0.96 + pulse * 0.03)

    if (ringRef.current) {
      ringRef.current.position.copy(base)
      ringRef.current.scale.setScalar(
        isActive ? 0.78 + pulse * 0.94 + travel * 0.16 : 0.86 + pulse * 0.16,
      )
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = isActive
        ? 0.18 + pulse * 0.18
        : 0.08 + pulse * 0.06
    }
  })

  if (!previewPoint) {
    return null
  }

  const needleLength = previewPoint.animationProfile.acupuncture.needleLength

  return (
    <group>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[
            previewPoint.animationProfile.acupuncture.effectRadius,
            previewPoint.animationProfile.acupuncture.effectRadius + 0.024,
            40,
          ]}
        />
        <meshBasicMaterial color="#9dd8ff" transparent opacity={0.16} />
      </mesh>

      <group ref={toolRef}>
        <LoadedToolModel scene={scene} targetLength={needleLength * 0.62} sourceAxis="z" />
      </group>
    </group>
  )
}

function MoxaToolActor({
  previewPoint,
  activePoint,
  procedureKey,
}: {
  previewPoint: Acupoint | null
  activePoint: Acupoint | null
  procedureKey: number
}) {
  const toolRef = useRef<THREE.Group>(null)
  const emberRef = useRef<THREE.Mesh>(null)
  const heatRef = useRef<THREE.Mesh>(null)
  const smokeRefs = useRef<THREE.Sprite[]>([])
  const progressRef = useRef(1)
  const { scene } = useGLTF(MOXA_MODEL_URL, false, false, (loader) => {
    installUrlModifier(loader, moxaAssetMap)
  })
  const smokeTexture = useTexture(smokeSheetUrl)

  useEffect(() => {
    if (procedureKey > 0 && activePoint && previewPoint?.id === activePoint.id) {
      progressRef.current = 0
      return
    }

    progressRef.current = 1
  }, [activePoint?.id, previewPoint?.id, procedureKey])

  useEffect(() => {
    smokeTexture.wrapS = THREE.ClampToEdgeWrapping
    smokeTexture.wrapT = THREE.ClampToEdgeWrapping
    smokeTexture.colorSpace = THREE.SRGBColorSpace
    smokeTexture.needsUpdate = true
  }, [smokeTexture])

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
    if (!toolRef.current || !previewPoint) {
      return
    }

    const base = new THREE.Vector3(...previewPoint.position3d)
    const config = previewPoint.animationProfile.moxibustion
    const isActive = procedureKey > 0 && activePoint?.id === previewPoint.id

    if (isActive) {
      progressRef.current = Math.min(1, progressRef.current + delta * 1.2)
    } else {
      progressRef.current = 1
    }

    const loop = clock.getElapsedTime()
    const wave = 0.5 + 0.5 * Math.sin(loop * 4.2)
    const anchor = base.clone()
    anchor.y += config.hoverHeight

    if (isActive) {
      const travel = easeInOut(progressRef.current)
      const trailOffset =
        config.trail === 'circle'
          ? new THREE.Vector3(Math.cos(loop * 1.4) * 0.08, 0, Math.sin(loop * 1.4) * 0.08)
          : config.trail === 'line'
            ? new THREE.Vector3(Math.sin(loop * 1.9) * 0.12, Math.sin(loop * 2.4) * 0.02, 0)
            : new THREE.Vector3(0, Math.sin(loop * 3.1) * 0.06, 0)

      toolRef.current.position.copy(anchor.add(trailOffset.multiplyScalar(0.5 + travel * 0.5)))
    } else {
      toolRef.current.position.copy(
        anchor.add(new THREE.Vector3(0, Math.sin(loop * 2) * 0.025, 0)),
      )
    }

    toolRef.current.rotation.set(-0.38, 0.16 + Math.sin(loop * 0.7) * 0.06, 0.12)

    if (emberRef.current) {
      ;(emberRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.8 + wave * 1.2
      emberRef.current.scale.setScalar(0.9 + wave * 0.18)
    }

    if (heatRef.current) {
      heatRef.current.position.copy(base)
      heatRef.current.scale.setScalar(0.88 + wave * (0.4 + config.intensity * 0.24))
      ;(heatRef.current.material as THREE.MeshBasicMaterial).opacity = isActive
        ? 0.16 + wave * 0.18
        : 0.08 + wave * 0.08
    }

    smokeRefs.current.forEach((smoke, index) => {
      if (!smoke) {
        return
      }

      const shift = (loop * 0.42 + index * 0.17) % 1
      smoke.position.set(
        Math.sin(loop * 1.3 + index) * 0.02,
        0.05 + shift * 0.44,
        Math.cos(loop * 1.1 + index) * 0.018,
      )
      smoke.scale.setScalar(0.11 + shift * 0.13)
      const material = smoke.material as THREE.SpriteMaterial
      material.opacity = (isActive ? 0.18 : 0.08) * (1 - shift)
      material.rotation = Math.sin(loop * 0.7 + index) * 0.18
    })
  })

  if (!previewPoint) {
    return null
  }

  return (
    <group>
      <mesh ref={heatRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[
            previewPoint.animationProfile.moxibustion.radius,
            previewPoint.animationProfile.moxibustion.radius + 0.05,
            48,
          ]}
        />
        <meshBasicMaterial color="#ff9a52" transparent opacity={0.2} />
      </mesh>

      <group ref={toolRef}>
        <LoadedToolModel scene={scene} targetLength={0.82} sourceAxis="x" />
        <mesh ref={emberRef} position={[0, -0.01, 0]}>
          <sphereGeometry args={[0.055, 18, 18]} />
          <meshStandardMaterial color="#ffc080" emissive="#ff6f1a" emissiveIntensity={2.2} />
        </mesh>
        {Array.from({ length: 7 }).map((_, index) => (
          <sprite
            key={index}
            ref={(node) => {
              if (node) {
                smokeRefs.current[index] = node
              }
            }}
            position={[0, 0.08 + index * 0.04, 0]}
          >
            <spriteMaterial
              map={smokeTexture}
              color="#dde8ef"
              transparent
              opacity={0.08}
              depthWrite={false}
            />
          </sprite>
        ))}
      </group>
    </group>
  )
}

function ToolActor({
  displayMode,
  previewPoint,
  activePoint,
  procedureKey,
}: {
  displayMode: DisplayMode
  previewPoint: Acupoint | null
  activePoint: Acupoint | null
  procedureKey: number
}) {
  if (displayMode === 'info') {
    return null
  }

  if (displayMode === 'acupuncture') {
    return (
      <NeedleToolActor
        previewPoint={previewPoint}
        activePoint={activePoint}
        procedureKey={procedureKey}
      />
    )
  }

  return (
    <MoxaToolActor
      previewPoint={previewPoint}
      activePoint={activePoint}
      procedureKey={procedureKey}
    />
  )
}

function AcupointLabel({
  point,
  persistent,
  origin,
  onClose,
}: {
  point: Acupoint
  persistent: boolean
  origin: [number, number, number]
  onClose?: () => void
}) {
  const direction = point.position3d[0] >= 0 ? 1 : -1
  const elbowX = 0.08 * direction
  const panelCenterX = 0.42 * direction
  const accentX = 0.286 * direction
  const closeX = 0.545 * direction

  return (
    <Billboard position={origin} follow lockX={false} lockY={false} lockZ={false}>
      <group>
        <Line
          points={[
            [0, 0, 0],
            [elbowX, 0.1, 0],
            [panelCenterX - 0.14 * direction, 0.1, 0],
          ]}
          color="#9fdcff"
          lineWidth={1.2}
          transparent
          opacity={persistent ? 0.92 : 0.8}
          depthWrite={false}
        />
        <mesh position={[panelCenterX, 0.1, 0]}>
          <planeGeometry args={[0.28, 0.11]} />
          <meshBasicMaterial
            color="#07141f"
            transparent
            opacity={persistent ? 0.9 : 0.84}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[accentX, 0.1, 0.002]}>
          <planeGeometry args={[0.01, 0.11]} />
          <meshBasicMaterial color="#8fd8ff" transparent opacity={0.92} depthWrite={false} />
        </mesh>
        <Text
          position={[panelCenterX + 0.01 * direction, 0.123, 0.004]}
          fontSize={0.034}
          color="#f3f8fc"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.19}
        >
          {point.name}
        </Text>
        <Text
          position={[panelCenterX + 0.01 * direction, 0.083, 0.004]}
          fontSize={0.02}
          color="#9bb7ca"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.19}
        >
          {point.aliases[0]}
        </Text>
        {persistent && onClose && (
          <group position={[closeX, 0.1, 0.006]} onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}>
            <mesh>
              <circleGeometry args={[0.026, 18]} />
              <meshBasicMaterial color="#0f2534" transparent opacity={0.94} depthWrite={false} />
            </mesh>
            <Text
              position={[0, -0.001, 0.002]}
              fontSize={0.028}
              color="#f4fbff"
              anchorX="center"
              anchorY="middle"
            >
              ×
            </Text>
          </group>
        )}
      </group>
    </Billboard>
  )
}

function AcupointMarker({
  point,
  selected,
  hovered,
  displayMode,
  showMarkers,
  onSelectAcupoint,
  onClearSelection,
  onHoverAcupoint,
}: {
  point: Acupoint
  selected: boolean
  hovered: boolean
  displayMode: DisplayMode
  showMarkers: boolean
  onSelectAcupoint: (id: string) => void
  onClearSelection: () => void
  onHoverAcupoint: (id: string | null) => void
}) {
  const coreRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Mesh>(null)
  const markerOffset = useMemo(() => getMarkerOffset(point), [point])

  useFrame(({ clock }) => {
    const pulse = 0.78 + Math.sin(clock.getElapsedTime() * (selected ? 5.2 : 3)) * 0.08

    if (coreRef.current) {
      coreRef.current.scale.setScalar((selected ? 1.4 : hovered ? 1.15 : 0.95) * pulse)
    }

    if (haloRef.current) {
      haloRef.current.scale.setScalar((selected ? 1.9 : hovered ? 1.45 : 1.1) + Math.sin(clock.getElapsedTime() * 2.2) * 0.08)
      ;(haloRef.current.material as THREE.MeshBasicMaterial).opacity =
        selected ? 0.34 : hovered ? 0.22 : 0.12
    }
  })

  return (
    <group position={point.position3d} visible={showMarkers || selected}>
      <Line
        points={[
          [0, 0, 0],
          markerOffset,
        ]}
        color={selected ? '#ffd7a0' : markerColorByMode[displayMode]}
        lineWidth={1}
        transparent
        opacity={selected ? 0.72 : hovered ? 0.54 : 0.34}
        depthWrite={false}
      />
      <mesh
        ref={haloRef}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={() => onSelectAcupoint(point.id)}
        onPointerEnter={() => onHoverAcupoint(point.id)}
        onPointerLeave={() => onHoverAcupoint(null)}
      >
        <ringGeometry args={[0.035, 0.075, 32]} />
        <meshBasicMaterial color={markerColorByMode[displayMode]} transparent opacity={0.16} />
      </mesh>
      <mesh
        ref={coreRef}
        position={markerOffset}
        onClick={() => onSelectAcupoint(point.id)}
        onPointerEnter={() => onHoverAcupoint(point.id)}
        onPointerLeave={() => onHoverAcupoint(null)}
      >
        <sphereGeometry args={[0.034, 20, 20]} />
        <meshStandardMaterial
          color={selected ? '#fff0d6' : markerColorByMode[displayMode]}
          emissive={selected ? '#ffd585' : markerColorByMode[displayMode]}
          emissiveIntensity={selected ? 1.15 : hovered ? 0.86 : 0.5}
        />
      </mesh>
      {(hovered || selected) && (
        <AcupointLabel
          point={point}
          persistent={selected}
          origin={markerOffset}
          onClose={selected ? onClearSelection : undefined}
        />
      )}
    </group>
  )
}

function SceneContent(props: HumanSceneProps) {
  const hoveredPoint = props.acupoints.find((point) => point.id === props.hoveredAcupointId) ?? null
  const previewPoint = hoveredPoint ?? props.selectedAcupoint

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
      <ModelErrorBoundary>
        <Suspense fallback={<FallbackBody />}>
          <HumanModel displayMode={props.displayMode} />
        </Suspense>
      </ModelErrorBoundary>
      <ToolActor
        displayMode={props.displayMode}
        previewPoint={previewPoint}
        activePoint={props.selectedAcupoint}
        procedureKey={props.procedureKey}
      />
      {props.selectedAcupoint && <FocusBloom point={props.selectedAcupoint} displayMode={props.displayMode} />}
      {props.acupoints.map((point) => (
        <AcupointMarker
          key={point.id}
          point={point}
          selected={props.selectedAcupoint?.id === point.id}
          hovered={props.hoveredAcupointId === point.id}
          displayMode={props.displayMode}
          showMarkers={props.showMarkers}
          onSelectAcupoint={props.onSelectAcupoint}
          onClearSelection={props.onClearSelection}
          onHoverAcupoint={props.onHoverAcupoint}
        />
      ))}
      <CameraRig selectedAcupoint={props.selectedAcupoint} viewPreset={props.viewPreset} />
    </>
  )
}

export function HumanScene(props: HumanSceneProps) {
  const [canvasKey, setCanvasKey] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  const recoveryTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (recoveryTimeoutRef.current !== null) {
        window.clearTimeout(recoveryTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="scene-canvas-shell">
      {contextLost && <div className="scene-loading scene-loading-overlay">3D 场景正在恢复…</div>}
      <Canvas
        key={canvasKey}
        camera={{ position: defaultPresets.front.position, fov: 28 }}
        dpr={[1, 1]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
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
        <SceneContent {...props} />
      </Canvas>
    </div>
  )
}
