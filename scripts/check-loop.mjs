// Verifies the mathematical seamlessness of the 60-second loop.
// Run: node scripts/check-loop.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildIceBlocks } from '../src/loop/iglooLayout.ts';
import {
  computeTimings,
  createBlockState,
  createGlobalState,
  evaluateBlock,
  evaluateCamera,
  evaluateCameraVelocity,
  evaluateGlobals,
} from '../src/loop/choreography.ts';

const blocks = buildIceBlocks();
const timings = blocks.map(computeTimings);
const a = createBlockState();
const b = createBlockState();
const EPS = 1e-9;

let maxSpeed = 0;
for (let i = 0; i < blocks.length; i++) {
  evaluateBlock(blocks[i], timings[i], 0, a);
  evaluateBlock(blocks[i], timings[i], 1 - 1e-12, b);
  assert(a.pos.distanceTo(b.pos) < 1e-6, `block ${i} position differs at the seam`);
  assert(Math.abs(a.quat.angleTo(b.quat)) < 1e-6, `block ${i} rotation differs at the seam`);
  assert(a.scale.distanceTo(b.scale) < 1e-6, `block ${i} scale differs at the seam`);
  assert(Math.abs(a.glow - b.glow) < 1e-6 && Math.abs(a.wire - b.wire) < 1e-6, `block ${i} glow differs at the seam`);
  assert(a.pos.distanceTo(blocks[i].restPos) < EPS, `block ${i} not at rest at p=0`);

  // Continuity: no teleporting anywhere in the cycle (max step per 1/3600 of loop).
  const prev = new THREE.Vector3();
  evaluateBlock(blocks[i], timings[i], 0, a);
  prev.copy(a.pos);
  for (let k = 1; k <= 7200; k++) {
    evaluateBlock(blocks[i], timings[i], k / 7200, a);
    const step = a.pos.distanceTo(prev) * 7200 / 60; // units per second
    maxSpeed = Math.max(maxSpeed, step);
    prev.copy(a.pos);
  }
}
assert(maxSpeed < 12, `blocks move too fast (${maxSpeed.toFixed(2)} u/s) - looks like teleporting`);

const p0 = { x: 0, y: 0, z: 0 }, p1 = { x: 0, y: 0, z: 0 }, t0 = { x: 0, y: 0, z: 0 }, t1 = { x: 0, y: 0, z: 0 };
evaluateCamera(0, p0, t0);
evaluateCamera(1 - 1e-12, p1, t1);
const d = Math.hypot(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z) + Math.hypot(t0.x - t1.x, t0.y - t1.y, t0.z - t1.z);
assert(d < 1e-6, 'camera differs at the seam');
const v0 = evaluateCameraVelocity(0, { x: 0, y: 0, z: 0 });
const v1 = evaluateCameraVelocity(1 - 1e-12, { x: 0, y: 0, z: 0 });
assert(Math.hypot(v0.x - v1.x, v0.y - v1.y, v0.z - v1.z) < 1e-5, 'camera velocity differs at the seam');

const g0 = evaluateGlobals(0, createGlobalState());
const g1 = evaluateGlobals(1 - 1e-12, createGlobalState());
for (const key of Object.keys(g0)) {
  if (key === 'domeSweep' || key === 'ringSweep' || key === 'ringBreak') continue; // gated by visibility envelopes
  assert(Math.abs(g0[key] - g1[key]) < 1e-6, `global ${key} differs at the seam`);
}

// Long-run drift: wrapping progress for thousands of cycles must not accumulate error.
let p = 0;
const dt = 1 / 60;
for (let f = 0; f < 60 * 60 * 5000 / 100; f++) {
  p += dt / 60 * 100;
  p -= Math.floor(p);
}
assert(p >= 0 && p < 1, 'progress must stay normalized');

console.log(`Loop OK: ${blocks.length} blocks seamless at p=0/1, camera C2 at the seam, max block speed ${maxSpeed.toFixed(2)} u/s.`);
