import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom } from '../utils/noise';
import { scrollDirector, useScrollStateSelector } from '../experience/ScrollDirector';
import { soundController } from '../hero/SoundController';
import { getPortalProgress } from '../portal/PortalCameraPath';
import { getSculptureReveal } from './reveal';
import { SCULPTURE_POSITION } from '../portal/stage';
import { heroStore } from '../hero/heroStore';

import { selection, setSocialSelection } from './social';

function sampleThickSegment(
  random: () => number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfWidth: number,
  halfDepth: number,
  haloFactor: number,
): [number, number, number] {
  const t = random();
  const cx = ax + (bx - ax) * t;
  const cy = ay + (by - ay) * t;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.max(0.0001, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;

  const across = random() * 2 - 1;
  const edgeBias = Math.sign(across) * Math.pow(Math.abs(across), 0.72) * halfWidth;
  const depthBias = (random() * 2 - 1) * halfDepth;

  let x = cx + nx * edgeBias;
  let y = cy + ny * edgeBias;
  let z = depthBias;

  if (haloFactor > 0) {
    const spread = (0.07 + random() * 0.24) * haloFactor;
    const ang = random() * Math.PI * 2;
    x += Math.cos(ang) * spread;
    y += Math.sin(ang) * spread * 1.1;
    z += (random() - 0.5) * spread * 1.25;
  }

  return [x, y, z];
}

function sampleLinkedInTarget(random: () => number, i: number, isHalo: boolean): [number, number, number] {
  const bucket = i % 100;
  const halo = isHalo ? 1 : 0;

  // 'i' dot sphere
  if (bucket < 14) {
    const a = random() * Math.PI * 2;
    const b = Math.acos(random() * 2 - 1);
    const r = isHalo ? 0.16 + random() * 0.08 : 0.42 + 0.58 * Math.pow(random(), 0.25);
    return [
      -0.46 + Math.sin(b) * Math.cos(a) * r * 0.155,
      0.56 + Math.cos(b) * r * 0.155,
      Math.sin(b) * Math.sin(a) * r * 0.19,
    ];
  }
  // 'i' stem
  if (bucket < 36) {
    return sampleThickSegment(random, -0.46, -0.76, -0.46, 0.22, 0.135, 0.22, halo);
  }
  // 'n' left vertical stem
  if (bucket < 54) {
    return sampleThickSegment(random, -0.12, -0.76, -0.12, 0.22, 0.13, 0.22, halo);
  }
  // 'n' smooth rounded shoulder arch connecting (-0.12, -0.02) to (0.60, -0.02)
  if (bucket < 76) {
    const theta = random() * Math.PI;
    const radialOffset = (random() * 2 - 1) * 0.125;
    const r = 0.36 + radialOffset;
    const haloJitter = halo * (0.06 + random() * 0.16);
    const jAng = random() * Math.PI * 2;
    return [
      0.24 - Math.cos(theta) * r + Math.cos(jAng) * haloJitter,
      -0.02 + Math.sin(theta) * r + Math.sin(jAng) * haloJitter,
      (random() * 2 - 1) * 0.22 + (random() - 0.5) * haloJitter,
    ];
  }
  // 'n' right vertical stem
  if (bucket < 94) {
    return sampleThickSegment(random, 0.60, -0.02, 0.60, -0.76, 0.13, 0.22, halo);
  }
  // Subtle rounded-square crystalline orbital outline framing the 'in' monogram
  const side = bucket % 4;
  const u = random() * 1.48 - 0.74;
  const edge = 0.86;
  const depth = (random() * 2 - 1) * 0.16;
  if (side === 0) return [u, edge, depth];
  if (side === 1) return [u, -edge, depth];
  if (side === 2) return [-edge, u, depth];
  return [edge, u, depth];
}

function targets(count: number) {
  const random = createSeededRandom(429);
  return [0, 1, 2].map(shape => {
    const points = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let x = 0, y = 0, z = 0;
      const isHalo = (i % 100) >= 92;

      if (shape === 0) {
        [x, y, z] = sampleLinkedInTarget(random, i, isHalo);
      } else if (shape === 1) {
        // Iconic Twitter/X: solid '/' bar crossed by hollow double-walled '\' ribbon + flat serif caps
        const bucket = i % 20;
        const halo = isHalo ? 1 : 0;
        if (bucket < 8) {
          [x, y, z] = sampleThickSegment(random, -0.68, -0.94, 0.68, 0.94, 0.1, 0.18, halo);
        } else if (bucket < 13) {
          [x, y, z] = sampleThickSegment(random, -0.58, 0.94, 0.76, -0.94, 0.055, 0.18, halo);
        } else if (bucket < 18) {
          [x, y, z] = sampleThickSegment(random, -0.78, 0.94, 0.56, -0.94, 0.055, 0.18, halo);
        } else if (bucket === 18) {
          [x, y, z] = sampleThickSegment(random, -0.82, 0.94, -0.54, 0.94, 0.05, 0.18, 0);
        } else {
          [x, y, z] = sampleThickSegment(random, 0.52, -0.94, 0.80, -0.94, 0.05, 0.18, 0);
        }
      } else {
        // Bold architectural editorial serif M (Medium) with top & bottom serifs + sharp center V
        const bucket = i % 24;
        const halo = isHalo ? 1 : 0;
        if (bucket < 5) {
          [x, y, z] = sampleThickSegment(random, -0.58, -0.92, -0.58, 0.88, 0.125, 0.22, halo);
        } else if (bucket < 10) {
          [x, y, z] = sampleThickSegment(random, 0.58, -0.92, 0.58, 0.88, 0.125, 0.22, halo);
        } else if (bucket < 15) {
          [x, y, z] = sampleThickSegment(random, -0.54, 0.86, 0.0, -0.46, 0.125, 0.22, halo);
        } else if (bucket < 20) {
          [x, y, z] = sampleThickSegment(random, 0.0, -0.46, 0.54, 0.86, 0.125, 0.22, halo);
        } else if (bucket === 20) {
          [x, y, z] = sampleThickSegment(random, -0.78, 0.88, -0.42, 0.88, 0.065, 0.21, 0);
        } else if (bucket === 21) {
          [x, y, z] = sampleThickSegment(random, -0.78, -0.92, -0.38, -0.92, 0.065, 0.21, 0);
        } else if (bucket === 22) {
          [x, y, z] = sampleThickSegment(random, 0.42, 0.88, 0.78, 0.88, 0.065, 0.21, 0);
        } else {
          [x, y, z] = sampleThickSegment(random, 0.38, -0.92, 0.78, -0.92, 0.065, 0.21, 0);
        }
      }

      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = z;
    }
    return points;
  });
}

// Shared click impulse signal so clicking SocialSelector buttons or arrows triggers a particle shockwave too
export const sculptureBridge = {
  burstCount: 0,
  triggerBurst() {
    this.burstCount++;
  },
};

// Defer allocating particle buffers until the final stage is approaching.
export function ParticleSculpture({ reducedMotion }: { reducedMotion: boolean }) {
  const approaching = useScrollStateSelector(snapshot => snapshot.scrollPct >= 60);
  const [prepared, setPrepared] = useState(false);

  useEffect(() => {
    if (approaching) setPrepared(true);
  }, [approaching]);

  return prepared ? <SculptureSimulation reducedMotion={reducedMotion} /> : null;
}

function SculptureSimulation({ reducedMotion }: { reducedMotion: boolean }) {
  const { size, pointer, camera, gl } = useThree();
  const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
  // Dense crisp granular ice dots with luminous larger crystalline pearls
  const count = size.width < 768 ? 72000 : size.width < 1440 || cores < 8 ? 185000 : 250000;

  const containment = useMemo(() => {
    const cyl = new THREE.CylinderGeometry(2.08, 2.22, 6.4, 28, 12, true);
    const wire = new THREE.WireframeGeometry(cyl);
    const wireMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying float vY;
        void main() {
          vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vY;
        void main() {
          float fade = smoothstep(-3.1, -0.8, vY) * (1.0 - smoothstep(0.8, 3.1, vY));
          gl_FragColor = vec4(0.85, 0.92, 0.98, fade * 0.042);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    return { wire, points: cyl, wireMat };
  }, []);

  const system = useMemo(() => {
    const shapes = targets(count);
    const geometry = new THREE.BufferGeometry();
    // Targets fit inside [-2, 2]; normalized shorts halve the target buffer bandwidth.
    ['position', 'targetX', 'targetM'].forEach((name, shape) => {
      const packed = new Int16Array(count * 3);
      for (let i = 0; i < packed.length; i++) {
        packed[i] = Math.max(-32767, Math.min(32767, Math.round(shapes[shape][i] * 16383.5)));
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(packed, 3, true));
    });
    geometry.setDrawRange(0, count);
    const seeds = new Uint8Array(count);
    const random = createSeededRandom(98);
    for (let i = 0; i < count; i++) seeds[i] = Math.floor(random() * 256);
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1, true));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsLib.fog,
        weights: { value: new THREE.Vector3(1, 0, 0) },
        time: { value: 0 },
        pulse: { value: 0 },
        motion: { value: reducedMotion ? 0 : 1 },
        cursor: { value: new THREE.Vector3(100, 100, 100) },
        disturbance: { value: 0 },
        clickPos: { value: new THREE.Vector3(0, 0, 0) },
        clickBurst: { value: 0 },
        clickWave: { value: 0 },
        swirlEnergy: { value: 0 },
        pointScale: { value: 1 },
        pixelRatio: { value: 1 },
        reveal: { value: 0 },
      },
      vertexShader: `
        attribute vec3 targetX;
        attribute vec3 targetM;
        attribute float seed;
        uniform vec3 weights, cursor, clickPos;
        uniform float time, pulse, motion, disturbance, clickBurst, clickWave, swirlEnergy, pointScale, pixelRatio;
        varying float brightness;
        varying float characterShade;
        varying float vChunk;
        #include <fog_pars_vertex>
        void main() {
          vec3 p = (position * weights.x + targetX * weights.y + targetM * weights.z) * 2.0;
          float influence = 0.0;
          float clickGlow = 0.0;
          float outerSeed = smoothstep(0.58, 1.0, seed);
          vChunk = pow(seed, 1.35);

          // Silky orbital spiral bloom during shape transitions so morphs feel fluid & sculpted
          float maxW = max(weights.x, max(weights.y, weights.z));
          float transitionMix = clamp((1.0 - maxW) * 1.48, 0.0, 1.0);

          if (motion > 0.5) {
            if (transitionMix > 0.005) {
              float arc = sin(transitionMix * 3.14159265);
              float twistAngle = arc * (1.25 + outerSeed * 1.1) * (seed - 0.5);
              float ct = cos(twistAngle);
              float st = sin(twistAngle);
              p.xz = vec2(p.x * ct - p.z * st, p.x * st + p.z * ct);
              vec3 outDir = normalize(vec3(p.x, p.y * 0.45, p.z) + vec3(0.001));
              p += outDir * arc * (0.24 + seed * 0.46);
            }

            // Continuous 3D swirling curl-like flow + rising orbital halo drift
            float flowSpeed = time * (0.78 + swirlEnergy * 0.42);
            vec3 q1 = p * 1.9;
            vec3 q2 = p * 3.6 + vec3(seed * 4.0);
            vec3 flow1 = vec3(
              sin(q1.y + flowSpeed) + cos(q1.z * 1.4 - flowSpeed * 0.8),
              sin(q1.z + flowSpeed * 0.9) - cos(q1.x - flowSpeed * 1.1),
              sin(q1.x * 1.3 - flowSpeed * 0.7) + cos(q1.y + flowSpeed)
            ) * 0.5;
            vec3 flow2 = vec3(
              cos(q2.z - flowSpeed * 1.3),
              sin(q2.x + flowSpeed * 1.5),
              cos(q2.y - flowSpeed * 1.1)
            ) * 0.35;

            // Tangential orbital swirl around Y-axis for outer shedding particles
            vec2 radialXZ = vec2(p.x, p.z);
            vec2 orbitDir = vec2(-radialXZ.y, radialXZ.x);
            float orbitWave = sin(time * 0.9 + seed * 12.0 + p.y * 1.5);

            float baseMove = 0.052 + outerSeed * 0.14 + swirlEnergy * 0.18 + pulse * 0.42;
            p += (flow1 + flow2 * 0.55) * baseMove;
            p.xz += orbitDir * (outerSeed * 0.14 + swirlEnergy * 0.22 + pulse * 0.35) * (0.65 + 0.35 * orbitWave);
            p.y += outerSeed * 0.075 * sin(time * 1.1 + seed * 19.0);

            // Responsive pointer vortex wake
            if (disturbance > 0.004) {
              vec3 delta = p - cursor;
              float distanceSquared = dot(delta, delta);
              if (distanceSquared < 4.8) {
                float distanceToCursor = sqrt(distanceSquared);
                influence = exp(-distanceSquared * 1.3) * disturbance;
                vec3 tangent = normalize(vec3(-delta.y, delta.x, 0.28));
                p += (delta * inversesqrt(max(distanceSquared, 0.0001)) * 0.36 + tangent * 0.44) * influence;
                p.z += sin(distanceToCursor * 14.0 - time * 7.5) * exp(-distanceToCursor * 1.4) * disturbance * 0.11;
              }
            }

            // Radial click shockwave & explosive dispersion ripple
            if (clickBurst > 0.004) {
              vec3 cDelta = p - clickPos;
              float cDist = length(cDelta);
              vec3 cDir = cDist > 0.001 ? cDelta / cDist : vec3(0.0, 1.0, 0.0);
              vec3 cSwirl = normalize(vec3(-cDir.z, 0.35, cDir.x) + vec3(0.001));
              float ring = exp(-pow((cDist - clickWave) * 1.55, 2.0));
              float nearBlast = exp(-cDist * 1.15);
              float push = (ring * 0.54 + nearBlast * 0.4) * clickBurst * (0.55 + seed * 0.9);
              p += cDir * push + cSwirl * push * 0.65;
              p.y += push * 0.22;
              clickGlow = clamp(ring * 0.9 + nearBlast * 0.85, 0.0, 1.2) * clickBurst;
            }
          }

          characterShade = 1.0;

          // Traveling surface highlights across luminous crystalline spheres
          float sheen = 0.5 + 0.5 * sin(p.y * 2.4 + p.x * 1.8 - time * 0.95 * motion);
          sheen = pow(sheen, 3.2);

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vec4 mvPosition = mv;
          #include <fog_vertex>
          #ifdef USE_FOG
            vFogDepth *= 0.62;
          #endif
          gl_Position = projectionMatrix * mv;

          // Bigger, cleaner optical ice dots across core and outer shards
          float sizeBoost = 0.92 + vChunk * 1.72 + outerSeed * 0.48 + clickGlow * 0.85 + influence * 0.42 + transitionMix * 0.32;
          gl_PointSize = clamp(pointScale * sizeBoost / max(0.5, -mv.z), 2.5 * pixelRatio, 17.5 * pixelRatio);

          vec3 surfaceNormal = normalize(vec3(p.x * 0.92, p.y * 0.72, p.z * 1.15) + vec3(0.001));
          float formLight = 0.44 + max(0.0, dot(surfaceNormal, normalize(vec3(-0.55, 0.78, 0.55)))) * 0.68;
          brightness = (0.48 + seed * 0.16 + p.y * 0.06 + sheen * 0.34) * formLight + pulse * 0.28 + influence * 0.45 + clickGlow * 0.6 + transitionMix * 0.22;
        }
      `,
      fragmentShader: `
        uniform float reveal;
        varying float brightness;
        varying float characterShade;
        varying float vChunk;
        #include <fog_pars_fragment>
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          // Faceted crystalline ice shards on larger chunks, smooth luminous pearls on core dots
          float roundR = dot(uv, uv);
          float facetR = max(abs(uv.x), abs(uv.y)) * 0.86 + (abs(uv.x) + abs(uv.y)) * 0.22;
          float shapeR = mix(roundR, facetR * facetR, smoothstep(0.52, 0.96, vChunk) * 0.42);
          if (shapeR > 1.0) discard;

          float sphere = sqrt(max(0.0, 1.0 - roundR));
          vec3 normal = normalize(vec3(uv, sphere + 0.18));
          float diffuse = max(0.0, dot(normal, normalize(vec3(-0.5, 0.75, 0.9))));
          float rim = pow(1.0 - sphere, 1.85) * 0.32;
          float highlight = pow(max(0.0, dot(normal, normalize(vec3(-0.35, 0.58, 1.0)))), 18.0);
          float light = 0.42 + diffuse * 0.54 + rim + highlight * 0.38;

          vec3 shadowTone = vec3(0.56, 0.65, 0.76);
          vec3 litTone = vec3(0.98, 0.995, 1.0);
          vec3 iceTone = mix(shadowTone, litTone, clamp(brightness * 0.72 + highlight * 0.65, 0.0, 1.0));
          float edgeAlpha = 1.0 - smoothstep(0.64, 1.0, shapeR);
          gl_FragColor = vec4(iceTone * (brightness + 0.32) * light * characterShade, edgeAlpha * reveal);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      fog: true,
      depthWrite: true,
    });
    return { geometry, material };
  }, [count, reducedMotion]);

  const group = useRef<THREE.Group>(null);
  const cageGroup = useRef<THREE.Group>(null);
  const previous = useRef(selection.index);
  const lastSelectorBurst = useRef(sculptureBridge.burstCount);
  const pulse = useRef(0);
  const clickBurst = useRef(0);
  const clickWave = useRef(0);
  const swirlEnergy = useRef(0);
  const wasHoveredRef = useRef(false);
  const lastPointer = useRef(new THREE.Vector2());
  const pointerWorldNdc = useRef(new THREE.Vector2());
  const local = useMemo(() => new THREE.Vector3(), []);
  const worldCenter = useMemo(() => new THREE.Vector3(), []);
  const camForward = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 48), []);
  const elapsed = useRef(0);
  const timing = useRef({ seconds: 0, frames: 0, fraction: 1, fastWindows: 0 });

  useEffect(() => () => {
    system.geometry.dispose();
    system.material.dispose();
    containment.points.dispose();
    containment.wire.dispose();
    containment.wireMat.dispose();
    soundController.setParticleMotion(0);
  }, [system, containment]);

  // Direct click / tap interaction on the particle stage: triggers shockwave bursts + sound clicks
  useEffect(() => {
    let downX = 0;
    let downY = 0;

    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onUp = (e: PointerEvent) => {
      if (scrollDirector.stateName !== 'particle-stage') return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, a, nav')) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 16) return;
      if (!group.current) return;

      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      pointerWorldNdc.current.set((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1);

      group.current.getWorldPosition(worldCenter);
      camera.getWorldDirection(camForward);
      plane.setFromNormalAndCoplanarPoint(camForward, worldCenter);
      ray.setFromCamera(pointerWorldNdc.current, camera);

      let clickedOnDots = false;
      if (ray.ray.intersectPlane(plane, local)) {
        group.current.worldToLocal(local);
        clickedOnDots = local.length() < 2.65;
        local.x = THREE.MathUtils.clamp(local.x, -1.6, 1.6);
        local.y = THREE.MathUtils.clamp(local.y, -1.6, 1.6);
        local.z = THREE.MathUtils.clamp(local.z, -1.2, 1.2);
        system.material.uniforms.clickPos.value.copy(local);
      } else {
        system.material.uniforms.clickPos.value.set(0, 0, 0);
      }

      if (clickedOnDots) {
        setSocialSelection(selection.index + 1);
        soundController.playSelectorClick(1);
      }

      clickBurst.current = Math.min(1.8, clickBurst.current + 1.0);
      clickWave.current = 0;
      swirlEnergy.current = Math.min(1.6, swirlEnergy.current + 0.55);
      pulse.current = Math.min(1.3, pulse.current + 0.55);
      soundController.playParticleClickBurst(Math.min(1.1, 0.7 + clickBurst.current * 0.25));
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, local, plane, ray, system, worldCenter, camForward]);

  useFrame((_, delta) => {
    if (!group.current) return;
    const progress = scrollDirector.scrollProgress;
    const loopProgress = scrollDirector.loopProgress;
    const portalProgress = getPortalProgress(progress);
    const loopDissolve = loopProgress > 0.002 ? THREE.MathUtils.smoothstep(loopProgress, 0.06, 0.45) : 0;
    const reveal = getSculptureReveal(portalProgress) * (1 - THREE.MathUtils.smoothstep(loopProgress, 0.18, 0.5));
    group.current.visible = reveal > 0.001;
    if (cageGroup.current) cageGroup.current.visible = reveal > 0.02;
    if (!group.current.visible) {
      soundController.setParticleMotion(0);
      if (wasHoveredRef.current) {
        wasHoveredRef.current = false;
        heroStore.setState({ pointerInteractive: false });
      }
      timing.current.seconds = 0;
      timing.current.frames = 0;
      lastPointer.current.copy(pointer);
      return;
    }

    const dt = Math.min(delta, 0.05);
    elapsed.current += dt;
    const quality = timing.current;
    quality.seconds += delta;
    quality.frames++;
    if (quality.seconds > 2) {
      const fps = quality.frames / quality.seconds;
      quality.fastWindows = fps > 57 ? quality.fastWindows + 1 : 0;
      if (fps < 45) quality.fraction = Math.max(0.35, quality.fraction * 0.75);
      else if (quality.fastWindows >= 3) {
        quality.fraction = Math.min(1, quality.fraction + 0.05);
        quality.fastWindows = 0;
      }
      system.geometry.setDrawRange(0, Math.floor(count * quality.fraction));
      quality.seconds = 0;
      quality.frames = 0;
    }

    const changed = previous.current !== selection.index;
    previous.current = selection.index;
    if (changed) {
      pulse.current = reducedMotion ? 0 : 1.15;
      clickBurst.current = reducedMotion ? 0 : Math.max(clickBurst.current, 0.9);
      clickWave.current = 0;
      swirlEnergy.current = Math.min(1.5, swirlEnergy.current + 0.65);
      soundController.playMaterializeSwell(0.65);
    }
    if (lastSelectorBurst.current !== sculptureBridge.burstCount) {
      lastSelectorBurst.current = sculptureBridge.burstCount;
      clickBurst.current = Math.min(1.8, clickBurst.current + 1.0);
      clickWave.current = 0;
      swirlEnergy.current = Math.min(1.5, swirlEnergy.current + 0.5);
    }

    pulse.current = THREE.MathUtils.damp(pulse.current, 0, 2.8, dt);
    clickBurst.current = THREE.MathUtils.damp(clickBurst.current, 0, 3.0, dt);
    swirlEnergy.current = THREE.MathUtils.damp(swirlEnergy.current, 0, 1.8, dt);
    if (clickBurst.current > 0.01) {
      clickWave.current += dt * 5.8;
    }

    const uniforms = system.material.uniforms;
    const weights = uniforms.weights.value as THREE.Vector3;
    weights.x = THREE.MathUtils.damp(weights.x, selection.index === 0 ? 1 : 0, 4.6, dt);
    weights.y = THREE.MathUtils.damp(weights.y, selection.index === 1 ? 1 : 0, 4.6, dt);
    weights.z = THREE.MathUtils.damp(weights.z, selection.index === 2 ? 1 : 0, 4.6, dt);

    group.current.position.y = SCULPTURE_POSITION[1] + loopDissolve * 2.2;
    group.current.rotation.y = reducedMotion ? 0 : Math.sin(elapsed.current * 0.24) * 0.24 + loopDissolve * 0.9;
    group.current.updateMatrixWorld();

    if (cageGroup.current) {
      cageGroup.current.rotation.y = reducedMotion
        ? 0
        : elapsed.current * 0.045 + swirlEnergy.current * 0.18 + loopDissolve * 0.6;
    }

    const speed = Math.min(1.4, pointer.distanceTo(lastPointer.current) / Math.max(dt, 0.001) * 1.1);
    if (!reducedMotion) {
      group.current.getWorldPosition(worldCenter);
      camera.getWorldDirection(camForward);
      plane.setFromNormalAndCoplanarPoint(camForward, worldCenter);
      ray.setFromCamera(pointer, camera);
      if (ray.ray.intersectPlane(plane, local)) {
        group.current.worldToLocal(local);
        uniforms.cursor.value.copy(local);
        const overSculpture = local.length() < 2.25 && scrollDirector.stateName === 'particle-stage';
        if (overSculpture !== wasHoveredRef.current) {
          wasHoveredRef.current = overSculpture;
          heroStore.setState({ pointerInteractive: overSculpture });
        }
      }
    } else if (wasHoveredRef.current) {
      wasHoveredRef.current = false;
      heroStore.setState({ pointerInteractive: false });
    }
    lastPointer.current.copy(pointer);

    const activeDisturb = Math.max(speed, uniforms.disturbance.value * 0.92);
    uniforms.disturbance.value = THREE.MathUtils.damp(uniforms.disturbance.value, Math.min(1.3, activeDisturb), 6.2, dt);
    soundController.setParticleMotion(
      reducedMotion ? 0 : Math.min(1, Math.max(pulse.current, clickBurst.current * 0.85, uniforms.disturbance.value, loopDissolve * 0.7)),
    );
    uniforms.time.value = elapsed.current;
    const arrival = THREE.MathUtils.smoothstep(portalProgress, 0.68, 0.76)
      * (1 - THREE.MathUtils.smoothstep(portalProgress, 0.8, 0.9));
    uniforms.pulse.value = Math.max(pulse.current, arrival * 0.32, loopDissolve * 1.4);
    uniforms.clickBurst.value = reducedMotion ? 0 : clickBurst.current;
    uniforms.clickWave.value = clickWave.current;
    uniforms.swirlEnergy.value = reducedMotion ? 0 : Math.max(swirlEnergy.current, loopDissolve * 1.35);
    const dpr = gl.getPixelRatio();
    uniforms.pixelRatio.value = dpr;
    uniforms.pointScale.value = size.height * dpr * 0.044;
    uniforms.reveal.value = reveal;
  });

  return <>
    <group ref={group} position={SCULPTURE_POSITION} scale={size.width < 768 ? 1.05 : 1.35}>
      <points geometry={system.geometry} material={system.material} frustumCulled={false} />
    </group>
    <group ref={cageGroup} position={[SCULPTURE_POSITION[0], SCULPTURE_POSITION[1] + 0.65, SCULPTURE_POSITION[2]]}>
      <lineSegments geometry={containment.wire} material={containment.wireMat} />
      <points geometry={containment.points}>
        <pointsMaterial color="#eef7ff" size={0.032} transparent opacity={0.14} depthWrite={false} />
      </points>
    </group>
  </>;
}
