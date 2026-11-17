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
  await fs.writeFile(path.join(temporary, 'stage.mjs'), stripTypeScriptTypes(await fs.readFile('src/portal/stage.ts', 'utf8')));
  const { STAGE_DROP, SCULPTURE_POSITION } = await import(pathToFileURL(path.join(temporary, 'stage.mjs')).href);
  const source = await fs.readFile('src/portal/PortalCameraPath.ts', 'utf8');
  const compiled = stripTypeScriptTypes(source)
    .replace("'three'", JSON.stringify(pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href))
    .replace("'../utils/noise'", "'./noise.mjs'")
    .replace("'./stage'", "'./stage.mjs'");
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
          const radius = Math.hypot(position.x, position.y);
          assert(radius < clearance || radius > 3.6, `Camera hits ring at z=${z}`);
          if (radius < clearance) crossed.add(z);
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
    for (const progress of [0.64, 0.68, 0.72, 0.75]) {
      computePortalCameraPose(progress, mobile, position, look, { pointerX: 1, pointerY: -1 });
      assert(Math.abs(position.x) < 1e-9 && Math.abs(position.y) < 1e-9, 'Passage camera must align with the opening after the elevated ring view');
      assert(Math.abs(look.x) < 1e-9 && Math.abs(look.y) < 1e-9, 'Portal look direction must align with its normal');
    }
  }
  for (const mobile of [false, true]) {
    const position = new THREE.Vector3(), look = new THREE.Vector3();
    for (const progress of [0.38, 0.46, 0.5, 0.55]) {
      computePortalCameraPose(progress, mobile, position, look, { reducedMotion: true });
      const pitch = Math.atan2(position.y - look.y, Math.abs(position.z - look.z));
      assert(pitch > (mobile ? 0.17 : 0.28), 'Ring must be seen from above during completed assembly');
    }
  }
  const revealSource = stripTypeScriptTypes(await fs.readFile('src/particles/reveal.ts', 'utf8'))
    .replace("'../utils/noise'", "'./noise.mjs'");
  await fs.writeFile(path.join(temporary, 'reveal.mjs'), revealSource);
  const { getSculptureReveal } = await import(pathToFileURL(path.join(temporary, 'reveal.mjs')).href);
  assert.equal(getSculptureReveal(0.3), 0, 'Character must not appear before the portal');
  assert(getSculptureReveal(0.6) >= 0.6, 'Character opacity must be prepared before the downward arrival');
  assert.equal(getSculptureReveal(0.84), 1, 'Character must be fully visible by the overhead reveal');
  assert.equal(getSculptureReveal(1), 1, 'Character must remain visible on the final social stage');
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
  const surfaceSamples = [];
  const clearance = [crystals.createPenguinCrystalGeometry(), crystals.createOverpassCrystalGeometry()].map(bundle => {
    const vertices = bundle.outerGeom.attributes.position;
    surfaceSamples.push(Array.from({ length: vertices.count }, (_, i) => new THREE.Vector3(vertices.getX(i), vertices.getY(i), vertices.getZ(i))));
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
        for (const yaw of [-0.4, 0.4]) {
          for (const tilt of [-0.15, 0.15]) {
            const rotation = new THREE.Euler(tilt, yaw, 0.04);
            for (const vertex of surfaceSamples[index]) {
              const projected = vertex.clone().applyEuler(rotation).add(worldCenter).project(camera);
              assert(projected.y * direction > 1, `Whole model must pass ${direction < 0 ? 'below' : 'above'} viewport, crystal=${index}, mobile=${mobile}`);
            }
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
      const projected = new THREE.Vector3(Math.cos(angle) * 7.2, -2.8 - STAGE_DROP, -48 + Math.sin(angle) * 7.2).project(camera);
      assert(Math.abs(projected.x) < 0.99 && Math.abs(projected.y) < 0.99, `Overhead stage clips at aspect=${aspect}`);
    }
    const finalPose = computePortalCameraPose(1, aspect < 1, position, look, { aspect });
    camera.fov = finalPose.fov;
    camera.updateProjectionMatrix();
    assert(position.x > 1, 'Final view must expose a side angle');
    assert(position.y < -20, 'Final camera must descend physically below the portal');
    const finalPitch = Math.atan2(position.y - look.y, Math.hypot(position.x - look.x, position.z - look.z));
    const finalYaw = Math.atan2(Math.abs(position.x - look.x), Math.abs(position.z - look.z));
    assert(finalPitch > 0.05 && finalPitch < Math.PI / 7, 'Final camera must settle near eye level after the overhead arrival');
    assert(finalYaw > Math.PI / 6 && finalYaw < Math.PI / 3, 'Final view must expose a pronounced three-quarter side angle');
    camera.position.copy(position);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    const scale = aspect < 1 ? 1.05 : 1.35;
    for (const corner of [[-0.85, -1.25], [0.85, -1.25], [-0.85, 1.4], [0.85, 1.4]]) {
      const projected = new THREE.Vector3(SCULPTURE_POSITION[0] + corner[0] * scale, SCULPTURE_POSITION[1] + corner[1] * scale, SCULPTURE_POSITION[2]).project(camera);
      assert(Math.abs(projected.x) < 0.94 && Math.abs(projected.y) < 0.85, `Social sculpture clips at aspect=${aspect}: ${projected.x}, ${projected.y}`);
    }
  }
  for (const aspect of [0.46, 0.56, 0.75, 1.33, 16 / 9, 2.4]) {
    const position = new THREE.Vector3(), look = new THREE.Vector3();
    let lastHeight = 0;
    for (let i = 1; i <= 200; i++) {
      computePortalCameraPose(0.77 + i / 200 * 0.23, aspect < 1, position, look, { aspect, reducedMotion: true });
      assert(position.y <= lastHeight + 1e-8, 'Camera must descend into the stage instead of rising above the portal');
      lastHeight = position.y;
    }
    const camera = new THREE.PerspectiveCamera();
    const pose = computePortalCameraPose(1, aspect < 1, position, look, { aspect });
    camera.position.copy(position);
    camera.lookAt(look);
    camera.fov = pose.fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const center = new THREE.Vector3(...SCULPTURE_POSITION).project(camera);
    assert(center.y < 0 && center.y > -0.5, 'Cartoon should sit below screen center inside the stage');
    const scale = aspect < 1 ? 1.05 : 1.35;
    const top = new THREE.Vector3(0, SCULPTURE_POSITION[1] + 1.4 * scale, -48).project(camera);
    const bottom = new THREE.Vector3(0, SCULPTURE_POSITION[1] - 1.25 * scale, -48).project(camera);
    assert(Math.abs(top.y - bottom.y) < 0.85, 'Cartoon must leave space around it instead of filling the viewport');
    assert(bottom.y > -0.7, 'Social selector must remain unobstructed below the cartoon');
  }
  const damping = stripTypeScriptTypes(await fs.readFile('src/utils/damping.ts', 'utf8'));
  await fs.writeFile(path.join(temporary, 'damping.mjs'), damping);
  const directorSource = stripTypeScriptTypes(await fs.readFile('src/experience/ScrollDirector.ts', 'utf8'))
    .replace("'react'", JSON.stringify(pathToFileURL(path.join(root, 'node_modules/react/index.js')).href))
    .replace("'../utils/noise'", "'./noise.mjs'")
    .replace("'../utils/damping'", "'./damping.mjs'");
  await fs.writeFile(path.join(temporary, 'director.mjs'), directorSource);
  const { classifyScrollState, scrollDirector, EXPERIENCE_MAX_SCROLL, getScrollPacing } = await import(pathToFileURL(path.join(temporary, 'director.mjs')).href);
  const runImpulse = (start, fps) => {
    scrollDirector.reset();
    scrollDirector.setImmediate(start);
    scrollDirector.applyWheelImpulse(100);
    for (let i = 0; i < fps * 4; i++) scrollDirector.step(1 / fps, false);
    return scrollDirector.scrollProgress - start;
  };
  const heroTravel = runImpulse(0.05, 60);
  const portfolioTravel = runImpulse(0.53, 60);
  assert(portfolioTravel / heroTravel < 0.46, 'Portfolio needs more than twice the scroll input distance');
  const originalNotchTravel = 100 * 0.00028 * 1.15 * 2.4 / 5.4;
  assert(portfolioTravel / originalNotchTravel < 0.35, 'Portfolio should move at least 2.8 times slower than the previous controller');
  for (const fps of [30, 120]) {
    assert(Math.abs(runImpulse(0.53, fps) - portfolioTravel) < 0.00005, 'Scroll pacing must be frame-rate independent');
  }
  scrollDirector.setImmediate(0.53);
  scrollDirector.applyWheelImpulse(100);
  for (let i = 0; i < 6; i++) scrollDirector.step(1 / 60, false);
  const reversePoint = scrollDirector.scrollProgress;
  scrollDirector.applyWheelImpulse(-100);
  scrollDirector.step(1 / 60, false);
  assert(scrollDirector.scrollProgress < reversePoint, 'Upward input must immediately reverse motion without forward coasting');

  const layoutSource = stripTypeScriptTypes(await fs.readFile('src/portal/layout.ts', 'utf8'));
  await fs.writeFile(path.join(temporary, 'layout.mjs'), layoutSource);
  const { PORTAL_LAYOUT, INNER_ARCS } = await import(pathToFileURL(path.join(temporary, 'layout.mjs')).href);
  const nearestShell = PORTAL_LAYOUT.shellInner - PORTAL_LAYOUT.shellBevel;
  const largestArc = Math.max(...INNER_ARCS.map(arc => arc.outer)) + PORTAL_LAYOUT.arcBevel;
  assert(nearestShell - largestArc >= PORTAL_LAYOUT.minimumGap, 'Beveled portal surfaces must retain at least 0.5 world units of open space');
  assert(PORTAL_LAYOUT.surfaceFrostInner - 0.06 > PORTAL_LAYOUT.shellInner, 'Frost deposits must stay on the shell, out of the gap');
  for (const mobile of [false, true]) {
    const startPosition = new THREE.Vector3(), startLook = new THREE.Vector3();
    computePortalCameraPose(0.86, mobile, startPosition, startLook);
    for (const progress of [0.88, 0.91, 0.94, 0.95]) {
      const position = new THREE.Vector3(), look = new THREE.Vector3();
      computePortalCameraPose(progress, mobile, position, look);
      assert(position.distanceTo(startPosition) < 1e-9 && look.distanceTo(startLook) < 1e-9,
        'Overhead reveal must hold its composition instead of rushing down to the side');
    }
  }
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
  console.log(`Portfolio notch travel: ${portfolioTravel.toFixed(6)} (${(originalNotchTravel / portfolioTravel).toFixed(1)}x slower than previous controller).`);
  console.log('PASS: slower frame-independent pacing; immediate reversal; fixed portal gaps; downward arrival; low three-quarter side finish; clear cartoon/social framing; held overhead reveal; full-model entry/exit; elevated portal view; passage alignment; cartoon reveal readiness; actual crystal-geometry clearance; four-ring clearance/reversibility; overhead and social-stage framing; 1,920 ring framing checks; bottom-to-top portal assembly; scene handoffs; all journey states; 501 sound envelopes; opt-in and audio scheduling.');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
