import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';

const root = process.cwd();
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'igloo-camera-'));
try {
  const noise = stripTypeScriptTypes(await fs.readFile('src/utils/noise.ts', 'utf8'));
  await fs.writeFile(path.join(temporary, 'noise.mjs'), noise);
  const source = await fs.readFile('src/portal/PortalCameraPath.ts', 'utf8');
  const compiled = stripTypeScriptTypes(source)
    .replace("'three'", JSON.stringify(pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href))
    .replace("'../utils/noise'", "'./noise.mjs'");
  await fs.writeFile(path.join(temporary, 'camera.mjs'), compiled);
  const { computePortalCameraPose, getPortalAssemblyPose } = await import(pathToFileURL(path.join(temporary, 'camera.mjs')).href);
  for (const mobile of [false, true]) {
    const position = new THREE.Vector3(), look = new THREE.Vector3();
    const samples = [];
    const crossed = new Set();
    for (let i = 0; i <= 400; i++) {
      const progress = i / 400;
      computePortalCameraPose(progress, mobile, position, look);
      assert(position.toArray().every(Number.isFinite));
      assert(look.z < position.z - 1, `Camera looks backward at ${progress}, mobile=${mobile}`);
      for (const z of [-36, -38.2, -40.4, -42.6]) {
        if (Math.abs(position.z - z) < 0.4) {
          const clearance = z === -36 ? 0.7 : 2.3;
          assert(Math.hypot(position.x, position.y) < clearance, `Camera hits ring at z=${z}`);
          crossed.add(z);
        }
      }
      samples.push(position.clone());
    }
    assert.equal(crossed.size, 4, 'Camera must physically cross all four rings');
    for (let i = 400; i >= 0; i--) {
      computePortalCameraPose(i / 400, mobile, position, look);
      assert(position.distanceTo(samples[i]) < 1e-9, 'Reverse scroll must reproduce the same route');
    }
  }
  for (const mobile of [false, true]) {
    const position = new THREE.Vector3(), look = new THREE.Vector3();
    for (const progress of [0.46, 0.5, 0.55, 0.6]) {
      computePortalCameraPose(progress, mobile, position, look, { pointerX: 1, pointerY: -1 });
      assert(Math.abs(position.x) < 1e-9 && Math.abs(position.y) < 1e-9, 'Completed portal must face camera straight on');
      assert(Math.abs(look.x) < 1e-9 && Math.abs(look.y) < 1e-9, 'Portal look direction must align with its normal');
    }
  }
  const portfolioSource = stripTypeScriptTypes(await fs.readFile('src/portfolio/portfolioCamera.ts', 'utf8'))
    .replace("'three'", JSON.stringify(pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href))
    .replace("'../utils/noise'", "'./noise.mjs'");
  await fs.writeFile(path.join(temporary, 'portfolio.mjs'), portfolioSource);
  const { computePortfolioCameraPose } = await import(pathToFileURL(path.join(temporary, 'portfolio.mjs')).href);
  const crystalSource = stripTypeScriptTypes(await fs.readFile('src/portfolio/crystalGeometry.ts', 'utf8'))
    .replace("'three'", JSON.stringify(pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href))
    .replace("'../utils/noise'", "'./noise.mjs'");
  await fs.writeFile(path.join(temporary, 'crystals.mjs'), crystalSource);
  const crystals = await import(pathToFileURL(path.join(temporary, 'crystals.mjs')).href);
  const clearance = [crystals.createPenguinCrystalGeometry(), crystals.createOverpassCrystalGeometry()].map(bundle => {
    const vertices = bundle.outerGeom.attributes.position;
    let radius = 0;
    for (let i = 0; i < vertices.count; i++) radius = Math.max(radius, Math.hypot(vertices.getX(i), vertices.getY(i), vertices.getZ(i)));
    bundle.dispose();
    return radius + 0.3; // Covers floating offset, camera near plane and crystal tilt.
  });
  const verticalSource = stripTypeScriptTypes(await fs.readFile('src/portfolio/verticalFlow.ts', 'utf8'))
    .replace("'../utils/noise'", "'./noise.mjs'");
  await fs.writeFile(path.join(temporary, 'vertical.mjs'), verticalSource);
  const { getCrystalFlowOffset } = await import(pathToFileURL(path.join(temporary, 'vertical.mjs')).href);
  const flowSpecs = [[0.435, 0.53, 0.64], [0.685, 0.77, 0.87]];
  for (const mobile of [false, true]) {
    const camera = new THREE.PerspectiveCamera(mobile ? 45 : 38, mobile ? 0.56 : 16 / 9);
    const position = new THREE.Vector3(), look = new THREE.Vector3();
    for (const [index, center] of [[0, [0, 0.02, -3.5]], [1, [0.15, -0.04, -17.5]]]) {
      const [start, focus, end] = flowSpecs[index];
      for (const [progress, direction] of [[start, -1], [end - 0.035, 1]]) {
        computePortfolioCameraPose({ time: 0, scrollProgress: progress, isMobile: mobile,
          pointerNdcX: 0, pointerNdcY: 0, reducedMotion: true }, position, look);
        camera.position.copy(position);
        camera.lookAt(look);
        camera.updateMatrixWorld();
        const worldCenter = new THREE.Vector3(...center);
        worldCenter.y += getCrystalFlowOffset(progress, start, focus, end);
        for (const ySign of [-1, 1]) {
          for (const zSign of [-1, 1]) {
            const extreme = worldCenter.clone().add(new THREE.Vector3(0, ySign * clearance[index], zSign * clearance[index])).project(camera);
            assert(extreme.y * direction > 1, `Whole model must pass ${direction < 0 ? 'below' : 'above'} viewport, crystal=${index}, mobile=${mobile}, y=${extreme.y}`);
          }
        }
      }
      assert.equal(getCrystalFlowOffset(focus, start, focus, end), 0, 'Each crystal must center at its focus point');
    }
  }
  for (const mobile of [false, true]) {
    const camera = new THREE.PerspectiveCamera(mobile ? 45 : 38, mobile ? 0.56 : 16 / 9);
    const position = new THREE.Vector3(), look = new THREE.Vector3();
    for (const [index, start, end, center] of [[0, 0.48, 0.62, [0, 0.02, -3.5]], [1, 0.72, 0.85, [0.15, -0.04, -17.5]]]) {
      let previousY = -Infinity;
      let firstY = 0, lastY = 0;
      for (let i = 0; i <= 80; i++) {
        const progress = start + (end - start) * i / 80;
        computePortfolioCameraPose({ time: 0, scrollProgress: progress, isMobile: mobile,
          pointerNdcX: 0, pointerNdcY: 0, reducedMotion: true }, position, look);
        camera.position.copy(position);
        camera.lookAt(look);
        camera.updateMatrixWorld();
        const worldCenter = new THREE.Vector3(...center);
        worldCenter.y += getCrystalFlowOffset(progress, ...flowSpecs[index]);
        const projected = worldCenter.project(camera);
        assert(projected.y >= previousY - 0.015, `Crystal reverses vertical direction at ${progress}`);
        assert(Math.abs(projected.x) < 0.04, 'Crystal drifts sideways during vertical passage');
        if (i === 0) firstY = projected.y;
        lastY = projected.y;
        previousY = projected.y;
      }
      assert(firstY < -0.1 && lastY > 0.7, 'Crystal must enter below center and exit above');
    }
    for (let i = 0; i <= 300; i++) {
      const progress = 0.43 + 0.49 * i / 300;
      computePortfolioCameraPose({ time: 0, scrollProgress: progress, isMobile: mobile,
        pointerNdcX: 0, pointerNdcY: 0, reducedMotion: true }, position, look);
      for (const [index, center] of [[0, [0, 0.02, -3.5]], [1, [0.15, -0.04, -17.5]]]) {
        const worldCenter = new THREE.Vector3(...center);
        worldCenter.y += getCrystalFlowOffset(progress, ...flowSpecs[index]);
        assert(position.distanceTo(worldCenter) > clearance[index], `Camera clips crystal ${index} at ${progress}`);
      }
    }
  }
  for (const mobile of [false, true]) {
    for (const reducedMotion of [false, true]) {
      const exit = new THREE.Vector3(), exitLook = new THREE.Vector3();
      const entry = new THREE.Vector3(), entryLook = new THREE.Vector3();
      const before = computePortfolioCameraPose({ time: 45, scrollProgress: 0.92, isMobile: mobile,
        pointerNdcX: 1, pointerNdcY: -1, reducedMotion }, exit, exitLook);
      const after = computePortalCameraPose(0, mobile, entry, entryLook, { pointerX: 1, pointerY: -1, reducedMotion });
      assert(exit.distanceTo(entry) < 1e-9, 'Scene handoff changes camera position');
      assert(exitLook.distanceTo(entryLook) < 1e-9, 'Scene handoff changes camera orientation');
      assert.equal(before.fov, after.fov, 'Scene handoff changes field of view');
      assert.equal(before.fogDensity, after.fogDensity, 'Scene handoff changes fog');
    }
  }
  // Project the entire outer silhouette at assembly checkpoints for actual viewport fit.
  for (const mobile of [false, true]) {
    const camera = new THREE.PerspectiveCamera();
    const position = new THREE.Vector3(), look = new THREE.Vector3();
    let previousY = -Infinity;
    for (let i = 1; i <= 38; i++) {
      const progress = i / 100;
      const pose = computePortalCameraPose(progress, mobile, position, look);
      const assembly = getPortalAssemblyPose(progress);
      camera.position.copy(position);
      camera.lookAt(look);
      camera.fov = pose.fov;
      camera.aspect = mobile ? 0.56 : 16 / 9;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const center = new THREE.Vector3(0, assembly.y, -36).project(camera);
      assert(center.y >= previousY - 0.005, 'Portal must rise from below, following the crystals');
      previousY = center.y;
    }
    const settled = getPortalAssemblyPose(0.6);
    assert.equal(settled.y, 0, 'Portal must reach the camera corridor before passage');
    assert.equal(settled.tilt, 0, 'Portal must align its opening before passage');
  }
  for (const aspect of [0.46, 0.56, 0.75, 1.33, 16 / 9, 2.4]) {
    const mobile = aspect < 1;
    const camera = new THREE.PerspectiveCamera();
    const position = new THREE.Vector3(), look = new THREE.Vector3();
    for (const progress of [0.38, 0.42, 0.46, 0.5, 0.55]) {
      const pose = computePortalCameraPose(progress, mobile, position, look, { aspect });
      camera.position.copy(position);
      camera.lookAt(look);
      camera.aspect = aspect;
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      for (let i = 0; i < 64; i++) {
        const angle = i / 64 * Math.PI * 2;
        const projected = new THREE.Vector3(Math.cos(angle) * 3.35, Math.sin(angle) * 3.35, -36).project(camera);
        assert(Math.abs(projected.x) < 0.99 && Math.abs(projected.y) < 0.99,
          `Ring clips at progress=${progress}, aspect=${aspect}: ${projected.x}, ${projected.y}`);
      }
    }
  }
  for (const aspect of [0.46, 0.56, 0.75, 1.33, 16 / 9, 2.4]) {
    const camera = new THREE.PerspectiveCamera();
    const position = new THREE.Vector3(), look = new THREE.Vector3();
    const pose = computePortalCameraPose(0.885, aspect < 1, position, look, { aspect });
    assert(position.y - look.y > 20, 'Stage must include a real elevated overhead camera angle');
    camera.position.copy(position);
    camera.lookAt(look);
    camera.aspect = aspect;
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    for (let i = 0; i < 64; i++) {
      const angle = i / 64 * Math.PI * 2;
      const projected = new THREE.Vector3(Math.cos(angle) * 7.2, -2.8, -48 + Math.sin(angle) * 7.2).project(camera);
      assert(Math.abs(projected.x) < 0.99 && Math.abs(projected.y) < 0.99, `Overhead stage clips at aspect=${aspect}`);
    }
    const finalPose = computePortalCameraPose(1, aspect < 1, position, look, { aspect });
    camera.fov = finalPose.fov;
    camera.updateProjectionMatrix();
    assert(position.x > 1, 'Final view must expose a side angle');
    assert(position.y < 2, 'Final camera must settle at character height');
    camera.position.copy(position);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    const scale = aspect < 1 ? 1.05 : 1.35;
    for (const corner of [[-0.85, -1.25], [0.85, -1.25], [-0.85, 1.4], [0.85, 1.4]]) {
      const projected = new THREE.Vector3(corner[0] * scale, -0.55 + corner[1] * scale, -48).project(camera);
      assert(Math.abs(projected.x) < 0.94 && Math.abs(projected.y) < 0.85, `Social sculpture clips at aspect=${aspect}: ${projected.x}, ${projected.y}`);
    }
  }
  const damping = stripTypeScriptTypes(await fs.readFile('src/utils/damping.ts', 'utf8'));
  await fs.writeFile(path.join(temporary, 'damping.mjs'), damping);
  const directorSource = stripTypeScriptTypes(await fs.readFile('src/experience/ScrollDirector.ts', 'utf8'))
    .replace("'react'", JSON.stringify(pathToFileURL(path.join(root, 'node_modules/react/index.js')).href))
    .replace("'../utils/noise'", "'./noise.mjs'")
    .replace("'../utils/damping'", "'./damping.mjs'");
  await fs.writeFile(path.join(temporary, 'director.mjs'), directorSource);
  const { classifyScrollState, scrollDirector, EXPERIENCE_MAX_SCROLL } = await import(pathToFileURL(path.join(temporary, 'director.mjs')).href);
  const stages = [[0, 'hero-rest'], [0.16, 'igloo-activation'], [0.26, 'camera-zoomout'], [0.36, 'frost-entry'],
    [0.42, 'atmospheric-reveal'], [0.53, 'crystal-1'], [0.65, 'inter-crystal-fog'], [0.77, 'crystal-2'],
    [0.88, 'ring-entry'], [1.1, 'portal-assembly'], [1.28, 'portal-passage'], [1.4, 'particle-stage']];
  for (const [progress, name] of [...stages, ...stages.toReversed()]) {
    assert.equal(classifyScrollState(progress), name);
    scrollDirector.setImmediate(progress);
    assert.equal(scrollDirector.stateName, name);
  }
  scrollDirector.setImmediate(99);
  assert.equal(scrollDirector.scrollProgress, EXPERIENCE_MAX_SCROLL);
  scrollDirector.setImmediate(-1);
  assert.equal(scrollDirector.scrollProgress, 0);
  for (const reducedMotion of [false, true]) {
    scrollDirector.reset();
    scrollDirector.targetScroll = EXPERIENCE_MAX_SCROLL;
    for (let i = 0; i < 600; i++) scrollDirector.step(1 / 60, reducedMotion);
    assert.equal(scrollDirector.scrollProgress, EXPERIENCE_MAX_SCROLL);
    scrollDirector.targetScroll = 0;
    for (let i = 0; i < 600; i++) scrollDirector.step(1 / 60, reducedMotion);
    assert.equal(scrollDirector.scrollProgress, 0);
  }
  const atmosphereSource = stripTypeScriptTypes(await fs.readFile('src/experience/atmosphere.ts', 'utf8'))
    .replace("'../utils/noise'", "'./noise.mjs'");
  await fs.writeFile(path.join(temporary, 'atmosphere.mjs'), atmosphereSource);
  const { computeAtmosphere } = await import(pathToFileURL(path.join(temporary, 'atmosphere.mjs')).href);
  for (let i = 0; i <= 500; i++) {
    const scroll = i / 500 * EXPERIENCE_MAX_SCROLL;
    const output = computeAtmosphere(scroll, 1, 0.3, 0.1, 0.5, 0.8);
    assert(Object.values(output).every(value => Number.isFinite(value) && value >= 0), 'Invalid sound envelope');
    assert.deepEqual(output, computeAtmosphere(scroll, 1, 0.3, 0.1, 0.5, 0.8), 'Sound route must reverse deterministically');
  }
  const audioSource = stripTypeScriptTypes(await fs.readFile('src/hero/SoundController.ts', 'utf8'))
    .replace("'../experience/atmosphere'", "'./atmosphere.mjs'");
  await fs.writeFile(path.join(temporary, 'sound.mjs'), audioSource);
  const { soundController } = await import(pathToFileURL(path.join(temporary, 'sound.mjs')).href);
  soundController.updateExperienceAtmosphere(1.4, 1, 0, 0, 0);
  assert.equal(soundController.ctx, null, 'Updating a scene must not initialize audio without opt-in');
  const calls = [];
  soundController.ctx = { currentTime: 0 };
  soundController.windGain = { gain: { setTargetAtTime: (...args) => calls.push(args) } };
  soundController.enabled = true;
  soundController.updateExperienceAtmosphere(0, 0, 0, 0, 0);
  soundController.ctx.currentTime = 0.01;
  soundController.updateExperienceAtmosphere(1.4, 1, 0, 0, 0);
  assert.equal(calls.length, 1, 'Audio automation must be throttled');
  soundController.ctx.currentTime = 0.05;
  soundController.updateExperienceAtmosphere(1.4, 1, 0, 0, 0);
  assert.equal(calls.length, 2, 'Audio updates must resume after throttle window');
  soundController.enabled = false;
  soundController.ctx.currentTime = 0.1;
  soundController.updateExperienceAtmosphere(1.4, 1, 0, 0, 0);
  assert.equal(calls.length, 2, 'Sound-off must stop scheduling audio');
  console.log('PASS: full-model bottom-to-top entry/exit; frontal portal lock; actual crystal-geometry clearance; four-ring clearance/reversibility; overhead and social-stage framing; 1,920 ring framing checks; bottom-to-top portal assembly; scene handoffs; all journey states; 501 sound envelopes; opt-in and audio scheduling.');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
