import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'igloo-bricks-'));
try {
  const threeUrl = pathToFileURL(path.join(process.cwd(), 'node_modules/three/build/three.module.js')).href;
  for (const [source, target] of [['utils/noise', 'noise'], ['hero/IglooGeometry', 'geometry'], ['hero/IglooMaterial', 'material']]) {
    const compiled = stripTypeScriptTypes(await fs.readFile(`src/${source}.ts`, 'utf8'))
      .replace("'three'", JSON.stringify(threeUrl)).replace("'../utils/noise'", "'./noise.mjs'");
    await fs.writeFile(path.join(directory, `${target}.mjs`), compiled);
  }
  const geometryModule = await import(pathToFileURL(path.join(directory, 'geometry.mjs')).href);
  const { createIglooBrickMaterial } = await import(pathToFileURL(path.join(directory, 'material.mjs')).href);
  const { material } = createIglooBrickMaterial();
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader);
  const predicate = shader.fragmentShader.match(/if \(([^\n]+)\) discard;/)?.[1];
  assert(predicate, 'Material reveal predicate must be present');
  // Execute the material's actual scalar discard predicate against displaced geometry.
  const discarded = new Function('vIglooLocalY', 'revealJitter', 'uRevealHeight', `return (${predicate});`);
  const block = geometryModule.createMasonryBlockGeometry();
  const vertices = block.attributes.position;
  let clipped = 0, checked = 0;
  for (const brick of geometryModule.buildIglooBricks()) {
    for (const displacement of [0, 0.84, 1.7]) {
      const position = brick.basePos.clone().addScaledVector(brick.outwardDir, brick.isInteractive ? displacement : 0);
      if (brick.isInteractive) position.y += displacement * (0.25 + brick.seed * 0.42);
      const matrix = new THREE.Matrix4().compose(position, brick.baseQuat, brick.scale);
      for (let i = 0; i < vertices.count; i++) {
        const transformed = new THREE.Vector3(vertices.getX(i), vertices.getY(i), vertices.getZ(i)).applyMatrix4(matrix);
        for (const jitter of [-0.08, 0.08]) {
          checked++;
          if (discarded(transformed.y, jitter, 3.35)) clipped++;
        }
      }
    }
  }
  console.log(`Completed masonry: ${clipped} clipped samples out of ${checked} across resting, hover and scroll displacement.`);
  assert.equal(clipped, 0, 'Finished igloo bricks must not disappear when lifted above the intro reveal plane');
  assert(discarded(2, 0, 1), 'Unbuilt upper courses must still be hidden during construction');
  assert(!discarded(0.5, 0, 1), 'Built lower courses must remain visible during construction');
  material.dispose();
  block.dispose();
  console.log('PASS: completed bricks remain visible; bottom-to-top construction reveal is preserved.');
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
