import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom } from '../utils/noise';
import { scrollDirector, useScrollStateSelector } from '../experience/ScrollDirector';
import { soundController } from '../hero/SoundController';
import { getPortalProgress } from '../portal/PortalCameraPath';

export const selection = { index: 0 };
const names = ['LINKEDIN', 'X / TWITTER', 'MEDIUM'];
const destinations = ['https://www.linkedin.com/', 'https://x.com/', 'https://medium.com/'];

function targets(count: number) {
  const random = createSeededRandom(429);
  const parts = [
    [0, -0.3, 0, 0.66, 0.87, 0.49], [0, 0.72, 0, 0.60, 0.56, 0.50],
    [-0.67, -0.2, 0, 0.16, 0.57, 0.23], [0.67, -0.2, 0, 0.16, 0.57, 0.23],
    [-0.28, -1.13, 0.12, 0.24, 0.12, 0.34], [0.28, -1.13, 0.12, 0.24, 0.12, 0.34],
    [0, 0.62, 0.48, 0.19, 0.12, 0.25],
    [-0.55, 0.73, 0, 0.14, 0.28, 0.27], [0.55, 0.73, 0, 0.14, 0.28, 0.27],
  ];
  return [0, 1, 2].map(shape => {
    const points = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let x = 0, y = 0, z = 0;
      if (shape === 0) {
        const part = i % 100;
        // Headphone arch and ear cups make the mascot readable in silhouette.
        if (part >= 76 && part < 82) {
          const angle = random() * Math.PI;
          const tube = random() * Math.PI * 2;
          x = Math.cos(angle) * (0.59 + Math.cos(tube) * 0.045);
          y = 0.72 + Math.sin(angle) * (0.64 + Math.cos(tube) * 0.045);
          z = Math.sin(tube) * 0.065;
          points[i * 3] = x;
          points[i * 3 + 1] = y;
          points[i * 3 + 2] = z;
          continue;
        }
        const spec = parts[part < 48 ? 0 : part < 76 ? 1 : part < 85 ? 7 : part < 88 ? 8 : part < 90 ? 2 : part < 92 ? 3 : part < 95 ? 4 : part < 98 ? 5 : 6];
        const a = random() * Math.PI * 2;
        const b = Math.acos(random() * 2 - 1);
        const r = 0.88 + random() * 0.12;
        x = spec[0] + Math.sin(b) * Math.cos(a) * r * spec[3];
        y = spec[1] + Math.cos(b) * r * spec[4];
        z = spec[2] + Math.sin(b) * Math.sin(a) * r * spec[5];
      } else {
        y = random() * 2 - 1;
        const side = random() < 0.5 ? -1 : 1;
        x = shape === 1 ? side * y * 0.78 : side * (0.75 - Math.max(0, y) * 0.65);
        x += (random() - 0.5) * 0.22;
        if (shape === 2 && i % 2 === 0) x = side * 0.75 + (random() - 0.5) * 0.2;
        z = (random() - 0.5) * 0.45;
      }
      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = z;
    }
    return points;
  });
}

// Defer allocating particle buffers until the final stage is approaching.
export function ParticleSculpture({ reducedMotion }: { reducedMotion: boolean }) {
  const approaching = useScrollStateSelector(snapshot => snapshot.scrollPct >= 88);

  return approaching ? <SculptureSimulation reducedMotion={reducedMotion} /> : null;
}

function SculptureSimulation({ reducedMotion }: { reducedMotion: boolean }) {
  const { size, pointer, camera, gl } = useThree();
  const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
  const count = size.width < 768 ? 65000 : size.width < 1440 || cores < 8 ? 300000 : 1000000;
  const system = useMemo(() => {
    const shapes = targets(count);
    const geometry = new THREE.BufferGeometry();
    // Targets fit inside [-2, 2]; normalized shorts halve the target buffer bandwidth.
    ['position', 'targetX', 'targetM'].forEach((name, shape) => {
      const packed = new Int16Array(count * 3);
      for (let i = 0; i < packed.length; i++) packed[i] = Math.round(shapes[shape][i] * 16383.5);
      geometry.setAttribute(name, new THREE.BufferAttribute(packed, 3, true));
    });
    geometry.setDrawRange(0, Math.min(count, 250000));
    const seeds = new Uint8Array(count);
    const random = createSeededRandom(98);
    for (let i = 0; i < count; i++) seeds[i] = Math.floor(random() * 256);
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1, true));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsLib.fog,
        weights: { value: new THREE.Vector3(1, 0, 0) },
        time: { value: 0 }, pulse: { value: 0 }, motion: { value: reducedMotion ? 0 : 1 },
        cursor: { value: new THREE.Vector3(100, 100, 100) }, disturbance: { value: 0 },
        pointScale: { value: 1 }, reveal: { value: 0 },
      },
      vertexShader: `
        attribute vec3 targetX;
        attribute vec3 targetM;
        attribute float seed;
        uniform vec3 weights, cursor;
        uniform float time, pulse, motion, disturbance, pointScale;
        varying float brightness;
        varying float characterShade;
        #include <fog_pars_vertex>
        void main() {
          vec3 p = (position * weights.x + targetX * weights.y + targetM * weights.z) * 2.0;
          // A spatial flow field moves neighboring particles together instead of random jitter.
          float influence = 0.0;
          if (motion > 0.5) {
            vec3 q = p * 2.4;
            float t = time * 0.65;
            vec3 flow = vec3(
              sin(q.y + t) + cos(q.z * 1.3 - t * 0.7),
              sin(q.z + t * 0.8) - cos(q.x - t),
              sin(q.x * 1.2 - t * 0.6) + cos(q.y + t)
            ) * 0.5;
            p += flow * (0.035 + pulse * 0.36);
            // Skip cursor length, exponentials and normalization while the pointer is still.
            if (disturbance > 0.005) {
              vec3 delta = p - cursor;
              float distanceSquared = dot(delta, delta);
              if (distanceSquared < 2.25) {
                float distanceToCursor = sqrt(distanceSquared);
                influence = exp(-distanceSquared * 3.5) * disturbance;
                vec3 tangent = normalize(vec3(-delta.y, delta.x, 0.2));
                p += (delta * inversesqrt(max(distanceSquared, 0.0001)) * 0.23 + tangent * 0.3) * influence;
                p.z += sin(distanceToCursor * 16.0 - time * 6.0) * exp(-distanceToCursor * 2.0) * disturbance * 0.06;
              }
            }
          }
          characterShade = 1.0;
          if (weights.x > 0.005) {
          vec3 mascot = position * 2.0;
          float front = smoothstep(0.2, 0.38, mascot.z);
          float eyeLeft = 1.0 - smoothstep(0.055, 0.085, length(mascot.xy - vec2(-0.21, 0.82)));
          float eyeRight = 1.0 - smoothstep(0.055, 0.085, length(mascot.xy - vec2(0.21, 0.82)));
          float eyes = max(eyeLeft, eyeRight) * front;
          float belly = (1.0 - smoothstep(0.45, 0.85, length((mascot.xy - vec2(0.0, -0.28)) * vec2(1.5, 0.85)))) * front;
          characterShade = 1.0 + weights.x * (belly * 0.22 - eyes * 0.78);
          }
          // Traveling surface highlights read as one flowing sculpture.
          float sheen = 0.5 + 0.5 * sin(p.y * 3.0 + p.x * 1.8 - time * 0.65 * motion);
          sheen *= sheen;
          sheen *= sheen;
          sheen *= sheen;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vec4 mvPosition = mv;
          #include <fog_vertex>
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(pointScale * (0.65 + seed * 0.7) / max(0.5, -mv.z), 1.5, 7.0);
          brightness = 0.44 + seed * 0.06 + p.y * 0.07 + sheen * 0.3 + pulse * 0.18 + influence * 0.3;
        }
      `,
      fragmentShader: `
        uniform float reveal;
        varying float brightness;
        varying float characterShade;
        #include <fog_pars_fragment>
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float radius = dot(uv, uv);
          if (radius > 1.0) discard;
          float sphere = sqrt(1.0 - radius);
          vec3 normal = vec3(uv, sphere);
          float diffuse = max(0.0, dot(normal, normalize(vec3(-0.5, 0.7, 1.0))));
          float highlight = pow(max(0.0, dot(normal, normalize(vec3(-0.3, 0.5, 1.0)))), 18.0);
          float light = 0.55 + diffuse * 0.32 + highlight * 0.22;
          gl_FragColor = vec4(vec3(0.79, 0.87, 0.95) * (brightness + 0.25) * light * characterShade, (1.0 - smoothstep(0.65, 1.0, radius)) * reveal);
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
  const previous = useRef(selection.index);
  const pulse = useRef(0);
  const lastPointer = useRef(new THREE.Vector2());
  const local = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 48), []);
  const elapsed = useRef(0);
  const timing = useRef({ seconds: 0, frames: 0, fraction: Math.min(1, 250000 / count), fastWindows: 0 });
  useEffect(() => () => { system.geometry.dispose(); system.material.dispose(); soundController.setParticleMotion(0); }, [system]);
  useFrame((_, delta) => {
    if (!group.current) return;
    const progress = scrollDirector.scrollProgress;
    const portalProgress = getPortalProgress(progress);
    group.current.visible = portalProgress > 0.78;
    if (!group.current.visible) {
      soundController.setParticleMotion(0);
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
      if (fps < 45) quality.fraction = Math.max(0.1, quality.fraction * 0.7);
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
      pulse.current = reducedMotion ? 0 : 1;
      soundController.playMaterializeSwell(0.65);
    }
    pulse.current = THREE.MathUtils.damp(pulse.current, 0, 2.2, dt);
    const uniforms = system.material.uniforms;
    const weights = uniforms.weights.value as THREE.Vector3;
    weights.x = THREE.MathUtils.damp(weights.x, selection.index === 0 ? 1 : 0, 3.8, dt);
    weights.y = THREE.MathUtils.damp(weights.y, selection.index === 1 ? 1 : 0, 3.8, dt);
    weights.z = THREE.MathUtils.damp(weights.z, selection.index === 2 ? 1 : 0, 3.8, dt);
    group.current.rotation.y = reducedMotion ? 0 : Math.sin(elapsed.current * 0.16) * 0.18;
    group.current.updateMatrixWorld();
    const speed = Math.min(1, pointer.distanceTo(lastPointer.current) / Math.max(dt, 0.001) * 0.8);
    if (!reducedMotion && speed > 0.001) {
      ray.setFromCamera(pointer, camera);
      if (ray.ray.intersectPlane(plane, local)) {
        group.current.worldToLocal(local);
        uniforms.cursor.value.copy(local);
      }
    }
    lastPointer.current.copy(pointer);
    uniforms.disturbance.value = THREE.MathUtils.damp(uniforms.disturbance.value, speed, 7, dt);
    soundController.setParticleMotion(reducedMotion ? 0 : Math.max(pulse.current, uniforms.disturbance.value));
    uniforms.time.value = elapsed.current;
    const arrival = 1 - THREE.MathUtils.smoothstep(portalProgress, 0.82, 0.96);
    uniforms.pulse.value = Math.max(pulse.current, arrival * 0.8);
    uniforms.pointScale.value = size.height * gl.getPixelRatio() * 0.019;
    uniforms.reveal.value = THREE.MathUtils.smoothstep(portalProgress, 0.78, 0.86);
  });
  return <group ref={group} position={[0, -0.55, -48]} scale={size.width < 768 ? 1.05 : 1.35}>
    <points geometry={system.geometry} material={system.material} frustumCulled={false} />
  </group>;
}

export function SocialSelector() {
  const [active, setActive] = useState(0);
  const visible = useScrollStateSelector(s => s.stateName === 'particle-stage');
  const touch = useRef({ x: 0, y: 0 });
  const choose = (index: number) => { const next = (index + 3) % 3; selection.index = next; setActive(next); };
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      choose(selection.index + (event.key === 'ArrowLeft' ? -1 : 1));
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touch.current.x;
      const dy = event.changedTouches[0].clientY - touch.current.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) choose(selection.index + (dx < 0 ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [visible]);
  if (!visible) return null;
  return <nav className="social-selector" aria-label="Social sculpture">
    <button className="sculpture-arrow previous" aria-label="Previous sculpture" onClick={() => choose(active - 1)}><svg viewBox="0 0 64 20" aria-hidden="true"><path d="M63 14H2L13 3" /></svg></button>
    {[2, 0, 1].map(index => <button key={names[index]} aria-pressed={active === index} onClick={() => { if (active === index) window.open(destinations[index], '_blank', 'noopener,noreferrer'); else choose(index); }}>{names[index]}</button>)}
    <button className="sculpture-arrow next" aria-label="Next sculpture" onClick={() => choose(active + 1)}><svg viewBox="0 0 64 20" aria-hidden="true"><path d="M1 14H62L51 3" /></svg></button>
  </nav>;
}
