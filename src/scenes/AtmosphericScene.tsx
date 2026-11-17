import { ParticleSculpture } from '../particles/Sculpture';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, smoothstep } from '../utils/noise';
import { createSnowParticleMaterial } from '../shaders/snowMaterial';
import { damp } from '../utils/damping';
import {
  createMistSpriteTexture,
  createOverpassCrystalGeometry,
  createPenguinCrystalGeometry,
} from '../portfolio/crystalGeometry';
import { createCrystalEnvironmentMaps } from '../portfolio/crystalMaterial';
import { IceCrystalObject } from '../portfolio/IceCrystalObject';
import { EmbeddedOverpassEmblem, EmbeddedPenguin } from '../portfolio/embeddedSculptures';
import { BackgroundTelemetryField } from '../portfolio/BackgroundTelemetryField';
import { computeDetailCameraPose, computePortfolioCameraPose } from '../portfolio/portfolioCamera';
import { getProjectById, PORTFOLIO_PROJECTS, type PortfolioProjectId } from '../portfolio/projects';
import {
  portfolioHudBridge,
  portfolioStore,
  usePortfolioSelector,
} from '../portfolio/portfolioStore';
import { PortalScene } from '../portal/PortalScene';
import { computePortalCameraPose, getPortalProgress } from '../portal/PortalCameraPath';

interface AtmosphericSceneProps {
  camera: THREE.PerspectiveCamera;
  pointerNdcRef: React.MutableRefObject<THREE.Vector2>;
  pointerActiveRef: React.MutableRefObject<boolean>;
  scrollProgressRef: React.MutableRefObject<number>;
  reducedMotion: boolean;
}

const LIGHT_BG = new THREE.Color('#AAB2C0');
const DARK_BG = new THREE.Color('#070C17');
const LIGHT_AMBIENT = new THREE.Color('#EAF1FA');
const DARK_AMBIENT = new THREE.Color('#1A2942');

interface MistLayerSpec {
  pos: [number, number, number];
  scale: number;
  speed: number;
  phase: number;
  opacity: number;
}

const MIST_LAYERS: MistLayerSpec[] = [
  { pos: [-2.8, 0.6, 1.2], scale: 8.5, speed: 0.16, phase: 0.2, opacity: 0.24 },
  { pos: [3.1, -0.8, -1.6], scale: 9.2, speed: 0.13, phase: 1.5, opacity: 0.22 },
  { pos: [-1.4, -0.4, -6.5], scale: 11.5, speed: 0.11, phase: 2.8, opacity: 0.28 },
  { pos: [2.2, 0.9, -9.8], scale: 12.0, speed: 0.14, phase: 3.9, opacity: 0.30 },
  { pos: [-2.4, 0.2, -14.2], scale: 9.6, speed: 0.12, phase: 0.7, opacity: 0.24 },
  { pos: [2.8, -0.6, -20.8], scale: 11.2, speed: 0.10, phase: 4.5, opacity: 0.26 },
  { pos: [-1.2, 0.4, -26.5], scale: 13.0, speed: 0.09, phase: 2.1, opacity: 0.30 },
];

/**
 * Phase 1 State E + Phase 2 Portfolio 3D Environment:
 * Pale steel-grey volumetric atmosphere with drifting oversized technical typography,
 * two distinct faceted refractive ice crystals (Pudgy Penguins + Overpass) with real
 * 3D embedded sculptures, smooth scroll choreography, and dark blue-black detail transition.
 */
export function AtmosphericScene({
  camera,
  pointerNdcRef,
  pointerActiveRef,
  scrollProgressRef,
  reducedMotion,
}: AtmosphericSceneProps) {
  const { gl, scene, size } = useThree();

  const selectedProjectId = usePortfolioSelector((s) => s.selectedProjectId);
  const hoveredProjectId = usePortfolioSelector((s) => s.hoveredProjectId);

  const bgColorRef = useRef<THREE.Color>(null);
  const fogRef = useRef<THREE.FogExp2>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const keyLightRef = useRef<THREE.DirectionalLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);
  const reticleGroupRef = useRef<THREE.Group>(null);
  const dustGroupRef = useRef<THREE.Group>(null);
  const entryMistRefs = useRef<(THREE.Mesh | null)[]>([]);
  const entryMistMaterials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const mistMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const mistMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const camPos = useRef(new THREE.Vector3(0, 0.45, 7.6));
  const camLook = useRef(new THREE.Vector3(0, 0, -3.5));
  const goalPos = useMemo(() => new THREE.Vector3(), []);
  const goalLook = useMemo(() => new THREE.Vector3(), []);
  const fovRef = useRef(38);
  const fogDensityRef = useRef(0.084);
  const detailBlendRef = useRef(0);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const meshRegistryRef = useRef<Record<string, THREE.Mesh | null>>({});
  const worldPosOutRef = useRef<Record<string, THREE.Vector3>>({
    'pudgy-penguins': new THREE.Vector3(...PORTFOLIO_PROJECTS[0].worldPos),
    overpass: new THREE.Vector3(...PORTFOLIO_PROJECTS[1].worldPos),
  });

  // Procedural studio environment maps for bright icy refraction & dark detail contrast
  const envMaps = useMemo(() => createCrystalEnvironmentMaps(gl), [gl]);
  const penguinGeomBundle = useMemo(() => createPenguinCrystalGeometry(), []);
  const overpassGeomBundle = useMemo(() => createOverpassCrystalGeometry(), []);
  const mistTex = useMemo(() => createMistSpriteTexture(), []);

  // Spatial calibration crosshairs distributed along the corridor (including Ring dock ahead)
  const guideLineGeom = useMemo(() => {
    const verts: number[] = [];
    const coords = [
      [-3.4, 1.6, -4.5],
      [3.2, 1.8, -5.2],
      [-2.8, -1.5, -3.8],
      [2.6, -1.4, -4.8],
      [-3.2, 1.4, -16.8],
      [3.0, 1.6, -18.2],
      [-2.6, -1.6, -16.4],
      [2.8, -1.3, -18.6],
      [-3.6, 1.2, -29.5],
      [3.6, -1.2, -31.0],
      [0.0, 0.0, -33.5],
    ];
    for (const [cx, cy, cz] of coords) {
      const s = 0.08;
      verts.push(cx - s, cy, cz, cx + s, cy, cz);
      verts.push(cx, cy - s, cz, cx, cy + s, cz);
    }
    verts.push(-5.5, 0, -6.5, -3.8, 0, -6.5);
    verts.push(3.8, 0, -6.5, 5.5, 0, -6.5);
    verts.push(-5.8, 0, -29.5, -3.6, 0, -29.5);
    verts.push(3.6, 0, -29.5, 5.8, 0, -29.5);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return g;
  }, []);

  const { dustGeom, dustMat } = useMemo(() => {
    const count = 260;
    const rand = createSeededRandom(88421);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const seeds = new Float32Array(count);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() * 2 - 1) * 9;
      pos[i * 3 + 1] = (rand() * 2 - 1) * 5;
      pos[i * 3 + 2] = (rand() * 2 - 1) * 9;
      scales[i] = 0.32 + rand() * 0.68;
      seeds[i] = rand();
      speeds[i] = 0.22 + rand() * 0.52;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    const mat = createSnowParticleMaterial();
    mat.uniforms.uBounds.value.set(9, 5, 9);
    return { dustGeom: g, dustMat: mat };
  }, []);

  // Reusable projection math temporaries (zero per-frame allocations)
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpRight = useMemo(() => new THREE.Vector3(), []);
  const tmpUp = useMemo(() => new THREE.Vector3(), []);
  const tmpForward = useMemo(() => new THREE.Vector3(), []);
  const tmpProj = useMemo(() => new THREE.Vector3(), []);
  const tmpPoint = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    scene.environment = envMaps.lightEnv;
    scene.environmentIntensity = 0.9;
    return () => {
      scene.environment = null;
      envMaps.dispose();
      mistTex.dispose();
      guideLineGeom.dispose();
      dustGeom.dispose();
      dustMat.dispose();
    };
  }, [scene, envMaps, mistTex, guideLineGeom, dustGeom, dustMat]);

  // Pointer click handler for clicking directly on 3D ice crystals
  useEffect(() => {
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (scrollProgressRef.current < 0.42) return;
      if (portfolioStore.getState().selectedProjectId) return;

      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist > 8) return;

      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const ndc = new THREE.Vector2((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);

      const candidates = Object.values(meshRegistryRef.current).filter(
        (m): m is THREE.Mesh => m !== null,
      );
      if (candidates.length === 0) return;

      const hits = raycaster.intersectObjects(candidates, false);
      if (hits.length > 0 && hits[0].distance < 11.5) {
        const hitId = hits[0].object.userData?.projectId as PortfolioProjectId | undefined;
        if (hitId) {
          portfolioStore.openProject(hitId);
        }
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [camera, raycaster, scrollProgressRef]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const isMobile = size.width < 768;
    const p = scrollProgressRef.current;

    const selectedProject = getProjectById(selectedProjectId);
    const targetDetail = selectedProject ? 1 : 0;
    const blendLambda = reducedMotion ? 10.0 : 3.6;
    detailBlendRef.current = damp(detailBlendRef.current, targetDetail, blendLambda, dt);
    if (Math.abs(detailBlendRef.current - targetDetail) < 0.001) {
      detailBlendRef.current = targetDetail;
    }
    const dBlend = detailBlendRef.current;
    portfolioHudBridge.detailBlend = dBlend;


    // 1. Evaluate camera pose: smooth scroll spline <-> centered detail focus
    const pose = selectedProject
      ? computeDetailCameraPose(
          selectedProject,
          isMobile,
          pointerNdcRef.current.x,
          pointerNdcRef.current.y,
          reducedMotion,
          goalPos,
          goalLook,
        )
      : p > 0.92
      ? computePortalCameraPose(getPortalProgress(p), isMobile, goalPos, goalLook, {
          aspect: size.width / Math.max(1, size.height),
          pointerX: pointerNdcRef.current.x,
          pointerY: pointerNdcRef.current.y,
          reducedMotion,
        })
      : computePortfolioCameraPose(
          {
            time: t,
            scrollProgress: p,
            isMobile,
            pointerNdcX: pointerNdcRef.current.x,
            pointerNdcY: pointerNdcRef.current.y,
            reducedMotion,
          },
          goalPos,
          goalLook,
        );

    const camLambda = reducedMotion ? 14.0 : selectedProject ? 6.2 : 7.8;
    camPos.current.lerp(goalPos, 1 - Math.exp(-camLambda * dt));
    camLook.current.lerp(goalLook, 1 - Math.exp(-camLambda * dt));
    fovRef.current = damp(fovRef.current, pose.fov, camLambda, dt);
    fogDensityRef.current = damp(fogDensityRef.current, pose.fogDensity, 4.2, dt);

    camera.position.copy(camPos.current);
    camera.lookAt(camLook.current);
    camera.fov = fovRef.current;
    camera.aspect = size.width / Math.max(1, size.height);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // 2. Smooth environment & fog transition: pale steel-grey <-> dark blue-black detail void
    if (bgColorRef.current) {
      bgColorRef.current.copy(LIGHT_BG).lerp(DARK_BG, dBlend);
    }
    if (fogRef.current) {
      fogRef.current.color.copy(LIGHT_BG).lerp(DARK_BG, dBlend);
      fogRef.current.density = fogDensityRef.current;
    }

    const nextEnv = dBlend > 0.45 ? envMaps.darkEnv : envMaps.lightEnv;
    if (scene.environment !== nextEnv) {
      scene.environment = nextEnv;
    }
    scene.environmentIntensity = THREE.MathUtils.lerp(0.95, 1.25, dBlend);

    if (ambientRef.current) {
      tmpColor.copy(LIGHT_AMBIENT).lerp(DARK_AMBIENT, dBlend);
      ambientRef.current.color.copy(tmpColor);
      ambientRef.current.intensity = THREE.MathUtils.lerp(0.68, 0.55, dBlend);
    }

    // Track lighting rig along camera Z so both crystals get crisp sculpted highlights
    if (keyLightRef.current) {
      keyLightRef.current.position.set(camPos.current.x - 5.5, camPos.current.y + 6.8, camPos.current.z + 2.5);
      keyLightRef.current.target.position.set(camPos.current.x, camPos.current.y, camPos.current.z - 8);
      keyLightRef.current.target.updateMatrixWorld();
      keyLightRef.current.intensity = THREE.MathUtils.lerp(1.45, 2.25, dBlend);
    }
    if (rimLightRef.current) {
      rimLightRef.current.position.set(camPos.current.x + 6.5, camPos.current.y - 1.5, camPos.current.z - 8.5);
      rimLightRef.current.target.position.set(camPos.current.x, camPos.current.y, camPos.current.z - 8);
      rimLightRef.current.target.updateMatrixWorld();
      rimLightRef.current.intensity = THREE.MathUtils.lerp(0.95, 1.9, dBlend);
    }

    const entryMist = smoothstep(0.31, 0.375, p) * (1 - smoothstep(0.41, 0.49, p));
    entryMistRefs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const drift = reducedMotion ? 0 : Math.sin(t * 0.09 + index * 2) * 0.35;
      mesh.position.set(camPos.current.x + (index - 1) * 1.8 + drift, camPos.current.y + (index - 1) * 0.45, camPos.current.z - 2.5 - index * 1.6);
      mesh.quaternion.copy(camera.quaternion);
      mesh.visible = entryMist > 0.001;
      const material = entryMistMaterials.current[index];
      if (material) material.opacity = entryMist * (isMobile ? 0.12 : 0.18) * (1 - dBlend);
    });

    // 3. Soft volumetric mist billboards & infinite-depth dust particles
    for (let i = 0; i < MIST_LAYERS.length; i++) {
      const m = MIST_LAYERS[i];
      const mesh = mistMeshRefs.current[i];
      const mat = mistMatRefs.current[i];
      if (mesh) {
        if (!reducedMotion) {
          mesh.position.x = m.pos[0] + Math.sin(t * m.speed + m.phase) * 0.9;
          mesh.position.y = m.pos[1] + Math.cos(t * (m.speed * 0.7) + m.phase) * 0.35;
        }
        mesh.quaternion.copy(camera.quaternion);
      }
      if (mat) {
        mat.opacity = m.opacity * (1 - dBlend * 0.72);
        mat.color.setHex(dBlend > 0.5 ? 0x16243a : 0xeef4fb);
      }
    }

    if (dustGroupRef.current) {
      dustGroupRef.current.position.set(camPos.current.x, camPos.current.y, camPos.current.z - 6.0);
    }
    const atmoActive = THREE.MathUtils.clamp((p - 0.31) / 0.12, 0, 1);
    dustMat.uniforms.uTime.value = reducedMotion ? 0 : t * 0.42;
    dustMat.uniforms.uWindOffset.value = reducedMotion ? 0 : t * 0.42 * 0.45;
    dustMat.uniforms.uOpacity.value = 0.46 * atmoActive * (1 - dBlend * 0.25);

    if (reticleGroupRef.current) {
      reticleGroupRef.current.rotation.z = reducedMotion ? 0 : Math.sin(t * 0.12) * 0.012;
    }

    // 4. Hover raycasting against active crystal meshes (when not in detail modal)
    if (p >= 0.42 && !selectedProject && pointerActiveRef.current) {
      raycaster.setFromCamera(pointerNdcRef.current, camera);
      const candidates = Object.values(meshRegistryRef.current).filter(
        (m): m is THREE.Mesh => m !== null,
      );
      const hits = candidates.length > 0 ? raycaster.intersectObjects(candidates, false) : [];
      if (hits.length > 0 && hits[0].distance < 11.5) {
        const hitId = hits[0].object.userData?.projectId as PortfolioProjectId | undefined;
        portfolioStore.setHoveredProject(hitId ?? null);
      } else {
        portfolioStore.setHoveredProject(null);
      }
    } else if (portfolioStore.getState().hoveredProjectId !== null) {
      portfolioStore.setHoveredProject(null);
    }

    // 5. Project 3D crystal annotation anchors -> 2D screen coordinates at 60fps
    let activeProj: (typeof PORTFOLIO_PROJECTS)[number] | null = null;
    let hudOpacity = 0;

    if (!selectedProject && dBlend < 0.08 && p >= 0.435) {
      for (const proj of PORTFOLIO_PROJECTS) {
        const [startP, endP] = proj.revealRange;
        if (p >= startP && p <= endP) {
          const fadeIn = smoothstep(startP, startP + 0.045, p);
          const fadeOut = 1 - smoothstep(endP - 0.04, endP, p);
          const op = Math.min(fadeIn, fadeOut) * (1 - dBlend);
          if (op > 0.02) {
            activeProj = proj;
            hudOpacity = op;
          }
          break;
        }
      }
    }

    if (activeProj) {
      portfolioStore.setActiveHudProject(activeProj.id);

      const worldCenter =
        worldPosOutRef.current[activeProj.id] ??
        tmpPoint.set(activeProj.worldPos[0], activeProj.worldPos[1], activeProj.worldPos[2]);

      camera.getWorldDirection(tmpForward);
      tmpRight.crossVectors(tmpForward, camera.up).normalize();
      tmpUp.crossVectors(tmpRight, tmpForward).normalize();

      // Crystal center
      tmpProj.copy(worldCenter).project(camera);
      const centerX = (tmpProj.x * 0.5 + 0.5) * size.width;
      const centerY = (-tmpProj.y * 0.5 + 0.5) * size.height;

      // Upper-left leader attachment on crystal upper-left silhouette
      const isOverpass = activeProj.id === 'overpass';
      const anchorOffsetX = isOverpass ? -0.58 : -0.44;
      const anchorOffsetY = isOverpass ? 0.72 : 0.86;
      tmpPoint
        .copy(worldCenter)
        .addScaledVector(tmpRight, anchorOffsetX)
        .addScaledVector(tmpUp, anchorOffsetY)
        .project(camera);
      const tlAnchorX = (tmpPoint.x * 0.5 + 0.5) * size.width;
      const tlAnchorY = (-tmpPoint.y * 0.5 + 0.5) * size.height;

      const elbowOffset = isMobile ? 28 : 48;
      const lineLen = isMobile ? 96 : 138;
      const tlElbowX = tlAnchorX - elbowOffset;
      const tlElbowY = Math.max(82, Math.min(size.height - 130, tlAnchorY - elbowOffset));
      const tlEndX = Math.max(isMobile ? 18 : 28, tlElbowX - lineLen);
      const tlEndY = tlElbowY;

      // Upper-right thermal telemetry anchor (note -tmpPoint.y converts NDC +Y up -> screen +Y down)
      tmpPoint
        .copy(worldCenter)
        .addScaledVector(tmpRight, isOverpass ? 1.02 : 0.88)
        .addScaledVector(tmpUp, isOverpass ? 0.66 : 0.74)
        .project(camera);
      const trX = Math.max(
        tlElbowX + 18,
        Math.min(size.width - (isMobile ? 104 : 136), (tmpPoint.x * 0.5 + 0.5) * size.width),
      );
      const trY = Math.max(82, Math.min(size.height - 140, (-tmpPoint.y * 0.5 + 0.5) * size.height));

      // Lower-right date / CLICK TO EXPLORE leader attachment
      tmpPoint
        .copy(worldCenter)
        .addScaledVector(tmpRight, isOverpass ? 0.62 : 0.50)
        .addScaledVector(tmpUp, isOverpass ? -0.62 : -0.78)
        .project(camera);
      const brAnchorX = (tmpPoint.x * 0.5 + 0.5) * size.width;
      const brAnchorY = Math.max(120, Math.min(size.height - 96, (-tmpPoint.y * 0.5 + 0.5) * size.height));
      const brEndX = Math.min(size.width - (isMobile ? 18 : 28), brAnchorX + (isMobile ? 92 : 136));
      const brEndY = brAnchorY;

      portfolioHudBridge.projection = {
        projectId: activeProj.id,
        visible: true,
        opacity: hudOpacity,
        centerX,
        centerY,
        topLeftAnchorX: tlAnchorX,
        topLeftAnchorY: tlAnchorY,
        topLeftElbowX: tlElbowX,
        topLeftElbowY: tlElbowY,
        topLeftEndX: tlEndX,
        topLeftEndY: tlEndY,
        topRightX: trX,
        topRightY: trY,
        bottomRightAnchorX: brAnchorX,
        bottomRightAnchorY: brAnchorY,
        bottomRightEndX: brEndX,
        bottomRightEndY: brEndY,
      };
      portfolioHudBridge.emit();
    } else {
      if (portfolioStore.getState().activeHudProjectId !== null) {
        portfolioStore.setActiveHudProject(null);
      }
      if (portfolioHudBridge.projection !== null) {
        portfolioHudBridge.projection = null;
        portfolioHudBridge.emit();
      }
    }
  });

  return (
    <>
      <color ref={bgColorRef} attach="background" args={['#AAB2C0']} />
      <fogExp2 ref={fogRef} attach="fog" args={['#AAB2C0', 0.084]} />

      <ambientLight ref={ambientRef} intensity={0.68} color="#EAF1FA" />
      <directionalLight ref={keyLightRef} position={[-5.5, 6.8, 7.5]} intensity={1.45} color="#FFFFFF" />
      <directionalLight ref={rimLightRef} position={[6.5, -1.5, -3.5]} intensity={0.95} color="#B8DEFF" />

      {/* Drifting out-of-focus oversized technical typography across Z depth */}
      <BackgroundTelemetryField detailBlendRef={detailBlendRef} reducedMotion={reducedMotion} />

      {[0, 1, 2].map(index => <mesh key={`entry-mist-${index}`} ref={mesh => { entryMistRefs.current[index] = mesh; }} scale={[9, 6, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={material => { entryMistMaterials.current[index] = material; }}
          map={mistTex} color='#d4dce5' transparent opacity={0} depthWrite={false} fog={false} />
      </mesh>)}

      {/* Soft volumetric fog wisps drifting in space */}
      <group>
        {MIST_LAYERS.map((m, i) => (
          <mesh
            key={i}
            ref={(el) => {
              mistMeshRefs.current[i] = el;
            }}
            position={m.pos}
            scale={[m.scale, m.scale * 0.65, 1]}
            renderOrder={-1}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              ref={(el) => {
                mistMatRefs.current[i] = el;
              }}
              map={mistTex}
              color="#EEF4FB"
              transparent
              opacity={m.opacity}
              depthWrite={false}
              fog={false}
            />
          </mesh>
        ))}
      </group>

      {/* Delicate spatial calibration crosshairs along corridor */}
      <group ref={reticleGroupRef}>
        <lineSegments geometry={guideLineGeom}>
          <lineBasicMaterial color="#FFFFFF" transparent opacity={0.36} depthWrite={false} />
        </lineSegments>
      </group>

      {/* Wrapping atmospheric ice dust field */}
      <group ref={dustGroupRef}>
        <points geometry={dustGeom} material={dustMat} frustumCulled={false} />
      </group>

      <ParticleSculpture reducedMotion={reducedMotion} />
      <PortalScene scrollProgressRef={scrollProgressRef} reducedMotion={reducedMotion} />

      {/* Ice Crystal 1 — Pudgy Penguins */}
      <IceCrystalObject
        projectId="pudgy-penguins"
        position={PORTFOLIO_PROJECTS[0].worldPos}
        scrollProgressRef={scrollProgressRef}
        geometryBundle={penguinGeomBundle}
        phaseOffset={0.4}
        baseYaw={0.14}
        pointerNdcRef={pointerNdcRef}
        isHovered={hoveredProjectId === 'pudgy-penguins'}
        isSelected={selectedProjectId === 'pudgy-penguins'}
        detailBlendRef={detailBlendRef}
        reducedMotion={reducedMotion}
        meshRegistryRef={meshRegistryRef}
        worldPosOutRef={worldPosOutRef}
      >
        <EmbeddedPenguin
          isHighlighted={
            hoveredProjectId === 'pudgy-penguins' || selectedProjectId === 'pudgy-penguins'
          }
        />
      </IceCrystalObject>

      {/* Ice Crystal 2 — Overpass */}
      <IceCrystalObject
        projectId="overpass"
        position={PORTFOLIO_PROJECTS[1].worldPos}
        scrollProgressRef={scrollProgressRef}
        geometryBundle={overpassGeomBundle}
        phaseOffset={2.2}
        baseYaw={-0.16}
        pointerNdcRef={pointerNdcRef}
        isHovered={hoveredProjectId === 'overpass'}
        isSelected={selectedProjectId === 'overpass'}
        detailBlendRef={detailBlendRef}
        reducedMotion={reducedMotion}
        meshRegistryRef={meshRegistryRef}
        worldPosOutRef={worldPosOutRef}
      >
        <EmbeddedOverpassEmblem
          isHighlighted={hoveredProjectId === 'overpass' || selectedProjectId === 'overpass'}
        />
      </IceCrystalObject>
    </>
  );
}
